// Конфигурация сервера PSMC
const SERVER_CONFIG = {
    ip: "psmc.minerent.io",
    javaPort: "25565",
    bedrockPort: "19132",
    version: "1.21.11",
    currentYear: 2026,
    apis: [
        // {
        //     name: "MCSRVSTAT",
        //     url: "https://api.mcsrvstat.us/2/",
        //     timeout: 5000
        // },
        // {
        //     name: "MINETOOLS",
        //     url: "https://api.minetools.eu/ping/",
        //     timeout: 5000
        // },
        {
            name: "MCAPI",
            url: "https://api.mcstatus.io/v2/status/java/",
            timeout: 5000
        }
    ]
};

let serverState = {
    online: false,
    players: { online: 0, max: 100 },
    motd: "PSMC - Prosto Server Minecraft",
    version: SERVER_CONFIG.version,
    ping: 0,
    lastUpdate: null,
    isChecking: false,
    lastSuccessApi: null,
    errorCount: 0
};

const elements = {};

document.addEventListener('DOMContentLoaded', function() {
    console.log("PSMC сайт запущен - режим реальной проверки");
    initElements();
    setStaticData();
    setupEventListeners();
    setupInfoTabs();

    // Переключение на вкладку Java по умолчанию
    switchTab('java');

    checkServerStatus(true);
    setInterval(() => checkServerStatus(false), 30000);
    setInterval(updateTimeDisplay, 60000);
});

function initElements() {
    elements.statusText = document.getElementById('statusText');
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.countNumber = document.querySelector('.count-number');
    elements.serverPing = document.getElementById('serverPing');
    elements.lastUpdate = document.getElementById('lastUpdate');
    elements.refreshBtn = document.getElementById('refreshBtn');
    elements.copyIpBtn = document.getElementById('copyIpBtn');
    elements.serverVersion = document.getElementById('serverVersion');
    elements.statusSub = document.querySelector('.status-sub');
    elements.tabBtns = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.quickJava = document.getElementById('quickJava');
    elements.quickBedrock = document.getElementById('quickBedrock');
}

function setStaticData() {
    if (elements.serverVersion) {
        elements.serverVersion.textContent = SERVER_CONFIG.version;
    }
    document.querySelectorAll('.footer-bottom p, .info-value').forEach(el => {
        if (el.textContent.includes('2026')) {
            el.textContent = SERVER_CONFIG.currentYear;
        }
    });
}

// ===================== СТАТУС СЕРВЕРА (без изменений) =====================
async function checkServerStatus(isInitial = false, notification = false) {
    if (serverState.isChecking) return;
    serverState.isChecking = true;
    const startTime = Date.now();
    setStatus('loading', 'Проверяем сервер...');
    if (elements.refreshBtn) {
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        elements.refreshBtn.disabled = true;
    }
    try {
        const serverData = await tryAllApis();
        updateServerState(serverData);
        updateInterface();
        serverState.lastUpdate = new Date();
        updateTimeDisplay();
        if (!isInitial && notification) {
            if (serverState.online) {
                showNotification(`Сервер онлайн Игроков: ${serverState.players.online}`, 'success');
            } else {
                showNotification('Сервер оффлайн', 'info');
            }
        }
        serverState.errorCount = 0;
    } catch (error) {
        console.error('Ошибка проверки сервера:', error);
        serverState.errorCount++;
        if (serverState.errorCount >= 3) {
            serverState.online = false;
            serverState.players.online = 0;
            serverState.motd = "Сервер не отвечает";
            serverState.ping = 0;
            if (elements.statusSub) {
                elements.statusSub.textContent = "Сервер выключен или недоступен";
            }
        }
        updateInterface();
        if (!isInitial) {
            showNotification('Не удалось проверить сервер', 'error');
        }
    } finally {
        const endTime = Date.now();
        console.log(`Проверка заняла: ${endTime - startTime}ms`);
        serverState.isChecking = false;
        if (elements.refreshBtn) {
            elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить сейчас';
            elements.refreshBtn.disabled = false;
        }
    }
}

async function tryAllApis() {
    const javaAddress = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
    const promises = SERVER_CONFIG.apis.map(async (api) => {
        try {
            let apiUrl;
            switch(api.name) {
                // case "MCSRVSTAT":
                //     apiUrl = `${api.url}${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
                //     break;
                // case "MINETOOLS":
                //     apiUrl = `${api.url}${SERVER_CONFIG.ip}/${SERVER_CONFIG.javaPort}`;
                //     break;
                case "MCAPI":
                    apiUrl = `${api.url}${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
                    break;
                default:
                    apiUrl = `${api.url}${javaAddress}`;
            }
            console.log(`Пробуем API: ${api.name} - ${apiUrl}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), api.timeout);
            const response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json', 'User-Agent': 'PSMC-Server-Checker/1.0' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`API ${api.name} вернул статус ${response.status}`);
            }
            const data = await response.json();
            return processApiData(data, api.name);
        } catch (error) {
            console.warn(`API ${api.name} не сработало:`, error.message);
            throw error;
        }
    });
    return await Promise.any(promises);
}

function processApiData(data, apiName) {
    console.log(`Данные от ${apiName}:`, data);
    switch(apiName) {
        // case "MCSRVSTAT":
        //     return {
        //         online: data.online || false,
        //         players: { online: data.players?.online || 0, max: data.players?.max || 100 },
        //         motd: data.motd?.clean || "PSMC Server",
        //         version: data.version || SERVER_CONFIG.version,
        //         ping: data.debug?.ping ? true : 0
        //     };
        // case "MINETOOLS":
        //     return {
        //         online: !data.error || false,
        //         players: { online: data.players?.online || 0, max: data.players?.max || 100 },
        //         motd: data.description || "PSMC Server",
        //         version: data.version?.name || SERVER_CONFIG.version,
        //         ping: data.latency || 0
        //     };
        case "MCAPI":
            return {
                online: data.online || false,
                players: { online: data.players?.online || 0, max: data.players?.max || 100 },
                motd: data.motd?.clean || "PSMC Server",
                version: data.version?.name_raw || SERVER_CONFIG.version,
                ping: data.round_trip_latency_ms || 0
            };
        default:
            return { online: false, players: { online: 0, max: 100 }, motd: "PSMC Server", version: SERVER_CONFIG.version, ping: 0 };
    }
}

function updateServerState(data) {
    serverState.online = data.online;
    serverState.players = data.players;
    serverState.motd = data.motd;
    serverState.version = data.version || SERVER_CONFIG.version;
    serverState.ping = data.ping || 0;
    serverState.lastUpdate = new Date();
}

function updateInterface() {
    if (serverState.online) {
        setStatus('online', 'Сервер онлайн ✓');
        if (elements.statusText) {
            elements.statusText.textContent = `Онлайн - ${serverState.players.online} игроков`;
        }
        if (elements.statusSub) {
            elements.statusSub.textContent = serverState.motd;
        }
    } else {
        setStatus('offline', 'Сервер оффлайн ✗');
        if (elements.statusText) {
            elements.statusText.textContent = 'Сервер выключен';
        }
        if (elements.statusSub) {
            elements.statusSub.textContent = 'Попробуйте подключиться позже';
        }
    }
    if (elements.countNumber) {
        elements.countNumber.textContent = serverState.online ? serverState.players.online : '0';
    }
    if (elements.serverPing) {
        if (serverState.online && serverState.ping > 0) {
            elements.serverPing.textContent = `${Math.round(serverState.ping)} мс`;
        } else {
            elements.serverPing.textContent = '—';
        }
    }
    updateStatusMessage();
}

function setStatus(type, message) {
    if (!elements.statusIndicator) return;
    elements.statusIndicator.className = 'status-indicator';
    elements.statusIndicator.classList.add(type);
}

function updateStatusMessage() {
    let messageContainer = document.querySelector('.server-status-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.className = 'server-status-message';
        document.querySelector('.status-card').appendChild(messageContainer);
    }
    if (serverState.online) {
        messageContainer.innerHTML = `
            <div class="status-message-content">
                <i class="fas fa-check-circle"></i>
                <div>
                    <h4>Сервер работает нормально</h4>
                    <p>Присоединяйтесь к игре! ${serverState.players.online}/${serverState.players.max} игроков онлайн.</p>
                    <p class="status-tip"><i class="fas fa-bolt"></i> Пинг: ${serverState.ping ? Math.round(serverState.ping) + ' мс' : 'измеряется...'}</p>
                </div>
            </div>
        `;
        messageContainer.style.background = 'rgba(76, 175, 80, 0.1)';
        messageContainer.style.borderColor = '#4CAF50';
    } else {
        messageContainer.innerHTML = `
            <div class="status-message-content">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <h4>Сервер временно недоступен</h4>
                    <p>Сервер выключен или находится на техническом обслуживании.</p>
                    <p class="status-tip"><i class="fas fa-lightbulb"></i> Сохраните IP адрес и попробуйте позже.</p>
                </div>
            </div>
        `;
        messageContainer.style.background = 'rgba(255, 166, 38, 0.1)';
        messageContainer.style.borderColor = '#ffa726';
    }
}

function updateTimeDisplay() {
    if (!elements.lastUpdate || !serverState.lastUpdate) return;
    const now = new Date();
    const diff = Math.floor((now - serverState.lastUpdate) / 1000);
    if (diff < 60) {
        elements.lastUpdate.textContent = `${diff} секунд назад`;
    } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        elements.lastUpdate.textContent = `${minutes} ${getRussianMinutes(minutes)} назад`;
    } else {
        const hours = Math.floor(diff / 3600);
        elements.lastUpdate.textContent = `${hours} ${getRussianHours(hours)} назад`;
    }
}

function getRussianMinutes(minutes) {
    if (minutes === 1) return 'минуту';
    if (minutes >= 2 && minutes <= 4) return 'минуты';
    return 'минут';
}

function getRussianHours(hours) {
    if (hours === 1) return 'час';
    if (hours >= 2 && hours <= 4) return 'часа';
    return 'часов';
}

function setupEventListeners() {
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => checkServerStatus(false, true));
    }
    if (elements.copyIpBtn) {
        elements.copyIpBtn.addEventListener('click', () => {
            copyToClipboard(`${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`);
        });
    }
    if (elements.tabBtns) {
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                switchTab(tab);
            });
        });
    }
    const javaCopyButtons = [
        elements.quickJava,
        ...document.querySelectorAll('.copy-small[data-address]')
    ].filter(Boolean);
    javaCopyButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            let text = '';
            if (this === elements.quickJava) {
                text = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
            } else if (this.dataset.address) {
                text = this.dataset.address;
            }
            if (text) copyToClipboard(text);
        });
    });
    const bedrockButtons = [
        elements.quickBedrock,
        document.querySelector('.copy-full[data-bedrock]')
    ].filter(Boolean);
    bedrockButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (this.disabled || this.classList.contains('bedrock-btn') || this.dataset.bedrock) {
                e.preventDefault();
                showNotification('Bedrock Edition временно недоступна', 'error');
                return false;
            }
        });
    });
    document.querySelectorAll('[data-bedrock]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Bedrock Edition временно недоступна', 'error');
        });
    });
}

// ===================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК =====================
function switchTab(tabName) {
    // Проверяем, что элементы существуют
    if (!elements.tabBtns || !elements.tabContents) {
        console.warn('Элементы вкладок ещё не загружены');
        return;
    }
    elements.tabBtns.forEach(btn => btn.classList.remove('active'));
    elements.tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.style.display = 'block';
        activeTab.classList.add('active');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification(`Скопировано: ${text}`, 'success');
            const btn = event?.target.closest('button');
            if (btn && !btn.disabled) {
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                btn.style.background = 'linear-gradient(135deg, #4CAF50, #2E7D32)';
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.style.background = '';
                }, 2000);
            }
        })
        .catch(err => {
            console.error('Ошибка копирования:', err);
            showNotification('Не удалось скопировать', 'error');
        });
}

function showNotification(message, type = 'info') {
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) oldNotification.remove();
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 3000);
}

// ===================== ИНФОРМАЦИОННЫЕ ВКЛАДКИ =====================
function setupInfoTabs() {
    const infoTabBtns = document.querySelectorAll('.info-tab-btn');
    const infoTabContents = document.querySelectorAll('.info-tab-content');
    if (!infoTabBtns.length) return;
    infoTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-info-tab');
            infoTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            infoTabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `info-${tabId}`) {
                    content.classList.add('active');
                }
            });
            // Если это вкладка магазина, загружаем товары
            if (tabId === 'shop') {
                setTimeout(loadShopProducts, 200);
            }
        });
    });
}

// ===================== МАГАЗИН (EasyDonate API) =====================
const SHOP_CONFIG = {
    apiKey: "90e6baaf7c43d441540e966a5d52c7c0",
    shopId: "155890",
    serverId: 139070,
    shopUrl: "https://easydonate.ru/shop/155890",
    apiBase: "https://easydonate.ru/api/v3"
};

async function loadShopProducts() {
    const container = document.getElementById('shopProducts');
    if (!container) return;
    if (container.dataset.loaded === 'true') return;

    container.innerHTML = `
        <div style="text-align:center; padding:40px;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i>
            <p style="color:var(--muted);">Загрузка товаров...</p>
        </div>
    `;

    try {
        const response = await fetch(`${SHOP_CONFIG.apiBase}/shop/products`, {
            method: 'GET',
            headers: {
                'Shop-Key': SHOP_CONFIG.apiKey,
                'User-Agent': 'PSMC-Site/1.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Товары от EasyDonate:', data);

        // Правильная структура: data.response содержит массив
        const products = data.response || data.data || data;
        if (!Array.isArray(products) || products.length === 0) {
            container.innerHTML = `<div class="shop-error"><i class="fas fa-info-circle"></i> Товары не найдены.</div>`;
            return;
        }

        renderProducts(products);
        container.dataset.loaded = 'true';

    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        container.innerHTML = `
            <div class="shop-error">
                <i class="fas fa-exclamation-triangle"></i>
                Не удалось загрузить товары. Пожалуйста, обновите страницу позже.
                <br><small style="color:var(--muted);">${error.message}</small>
                <br><small style="color:var(--muted);">Попробуйте открыть магазин напрямую: <a href="${SHOP_CONFIG.shopUrl}" target="_blank" style="color:var(--primary);">${SHOP_CONFIG.shopUrl}</a></small>
            </div>
        `;
    }
}

function renderProducts(products) {
    const container = document.getElementById('shopProducts');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'shop-grid';

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        const iconHtml = product.icon 
            ? `<img src="${product.icon}" alt="${product.name}" style="width:64px;height:64px;">` 
            : `<i class="fas fa-gem product-icon"></i>`;
        
        card.innerHTML = `
            ${iconHtml}
            <h4>${product.name}</h4>
            <p class="product-desc">${product.description || 'Без описания'}</p>
            <span class="product-price">${product.price} ₽</span>
            <button class="buy-btn" data-product-id="${product.id}">
                <i class="fas fa-shopping-cart"></i> Купить
            </button>
        `;

        container.appendChild(card);
    });

    // Обработчик для всех кнопок "Купить"
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const productId = this.dataset.productId;
            await createPayment(productId);
        });
    });
}

async function createPayment(productId) {
    const container = document.getElementById('shopProducts');
    
    // Удаляем предыдущий блок загрузки, если есть
    const oldLoading = container.querySelector('.shop-loading');
    if (oldLoading) oldLoading.remove();

    // Создаём новый блок с рамкой и текстом "Обработка..."
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'shop-loading';
    loadingMsg.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Обработка...`;
    container.prepend(loadingMsg);

    try {
        const response = await fetch(`${SHOP_CONFIG.apiBase}/shop/payment/create?customer=${encodeURIComponent('Игрок')}&server_id=${SHOP_CONFIG.serverId}&products={"${productId}":1}`, {
            method: 'GET',
            headers: {
                'Shop-Key': SHOP_CONFIG.apiKey,
                'User-Agent': 'PSMC-Site/1.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
        }

        const data = await response.json();
        console.log('Платёжная ссылка:', data);

        if (data.success && data.response?.url) {
            window.location.href = data.response.url;
        } else {
            throw new Error(data.response || 'Не удалось создать платёж');
        }

    } catch (error) {
        console.error('Ошибка создания платежа:', error);
        alert(`Не удалось создать платёж: ${error.message}`);
    } finally {
        // Удаляем блок загрузки после завершения (успех или ошибка)
        const loading = container.querySelector('.shop-loading');
        if (loading) loading.remove();
    }
}

// Подключаем загрузку магазина при активации вкладки
const originalSetupInfoTabs = setupInfoTabs;
setupInfoTabs = function() {
    originalSetupInfoTabs();
    const shopBtn = document.querySelector('[data-info-tab="shop"]');
    if (shopBtn) {
        shopBtn.addEventListener('click', function() {
            setTimeout(loadShopProducts, 200);
        });
    }
    if (document.querySelector('.info-tab-btn[data-info-tab="shop"].active')) {
        setTimeout(loadShopProducts, 300);
    }
};

// Экспорт для отладки (теперь window.PSMC точно существует)
window.PSMC = window.PSMC || {};
window.PSMC.shop = {
    load: loadShopProducts,
    config: SHOP_CONFIG
};

