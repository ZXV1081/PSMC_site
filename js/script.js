// Конфигурация сервера PSMC
const SERVER_CONFIG = {
    ip: "psmc.minerent.io",
    javaPort: "25565",
    bedrockPort: "19132",
    version: "1.21.11",
    currentYear: 2026
};

// Состояние сервера
let serverState = {
    online: false,
    players: { online: 0, max: 100 },
    motd: "PSMC - Prosto Server Minecraft",
    version: SERVER_CONFIG.version,
    ping: 0,
    lastUpdate: null,
    isChecking: false,
    errorCount: 0
};

// DOM элементы
const elements = {};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log("PSMC сайт запущен - режим реальной проверки");
    initElements();
    setStaticData();
    setupEventListeners();
    setupInfoTabs();
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

// ========== СТАТУС СЕРВЕРА (через Cloudflare Worker) ==========
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
        const serverData = await fetchServerStatus();
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

async function fetchServerStatus() {
    // Используем Cloudflare Worker для запроса статуса
    const target = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
    const workerUrl = `https://psmc-proxy.s-v-p-1251.workers.dev/status?target=${encodeURIComponent(target)}`;
    const response = await fetch(workerUrl, {
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`Worker вернул статус ${response.status}`);
    }
    const data = await response.json();
    // Приводим к формату, который понимает processApiData
    return processApiData(data, 'MCAPI');
}

function processApiData(data, apiName) {
    console.log(`Данные от ${apiName}:`, data);
    // Ожидаем структуру от mcstatus.io
    return {
        online: data.online || false,
        players: {
            online: data.players?.online || 0,
            max: data.players?.max || 100
        },
        motd: data.motd?.clean || "PSMC Server",
        version: data.version?.name_raw || SERVER_CONFIG.version,
        ping: data.round_trip_latency_ms || 0
    };
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

// ========== ОБРАБОТЧИКИ ==========
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

function switchTab(tabName) {
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

// ========== ИНФОРМАЦИОННЫЕ ВКЛАДКИ ==========
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
            if (tabId === 'shop') {
                setTimeout(loadShopProducts, 200);
            }
        });
    });
}

// ========== МАГАЗИН (ЧЕРЕЗ CLOUDFLARE WORKER) ==========
const SHOP_CONFIG = {
    apiKey: "90e6baaf7c43d441540e966a5d52c7c0", // не используется, но оставлено для совместимости
    shopId: "155890",
    serverId: 139070,
    shopUrl: "https://psmc.easydonate.ru",
    apiBase: "https://psmc-proxy.s-v-p-1251.workers.dev" // Worker URL
};

async function loadShopProducts() {
    const container = document.getElementById('shopProducts');
    if (!container) return;
    // Если уже загружены, не перезагружаем
    if (container.dataset.loaded === 'true') return;

    container.innerHTML = `
        <div style="text-align:center; padding:40px;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i>
            <p style="color:var(--muted);">Загрузка товаров...</p>
        </div>
    `;

    try {
        const response = await fetch(`${SHOP_CONFIG.apiBase}/shop/products`, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Товары от EasyDonate:', data);

        const products = data.response || data.data || data;
        if (!Array.isArray(products) || products.length === 0) {
            container.innerHTML = `<div class="shop-error"><i class="fas fa-info-circle"></i> Товары не найдены.</div>`;
            return;
        }

        renderProducts(products);
        container.dataset.loaded = 'true';

    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        // Показываем предупреждение вместо ошибки
        container.innerHTML = `
            <div style="background: rgba(255, 166, 38, 0.15); border: 2px solid var(--warning); border-radius: 12px; padding: 25px; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="color: var(--warning); font-size: 2.5rem; display: block; margin-bottom: 15px;"></i>
                <h4 style="color: var(--warning); margin-bottom: 10px;">Магазин временно недоступен</h4>
                <p style="color: var(--light); max-width: 500px; margin: 0 auto;">
                    Для доступа к магазину <strong>включите VPN</strong> и обновите страницу.<br>
                    Или перейдите в магазин напрямую:
                </p>
                <a href="${SHOP_CONFIG.shopUrl}" target="_blank" style="display: inline-block; margin-top: 15px; color: var(--primary); text-decoration: underline;">${SHOP_CONFIG.shopUrl}</a>
                <br>
                <button onclick="loadShopProducts()" style="margin-top: 20px; padding: 12px 25px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
                    <i class="fas fa-sync-alt"></i> Попробовать снова
                </button>
            </div>
        `;
        // Сбрасываем флаг, чтобы можно было повторить попытку
        container.dataset.loaded = 'false';
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

    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const productId = this.dataset.productId;
            await createPayment(productId);
        });
    });
}

async function createPayment(productId) {
    const container = document.getElementById('shopProducts');
    
    const oldLoading = container.querySelector('.shop-loading');
    if (oldLoading) oldLoading.remove();

    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'shop-loading';
    loadingMsg.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Обработка...`;
    container.prepend(loadingMsg);

    try {
        const url = `${SHOP_CONFIG.apiBase}/shop/payment/create?customer=${encodeURIComponent('Игрок')}&server_id=${SHOP_CONFIG.serverId}&products={"${productId}":1}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
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
        const loading = container.querySelector('.shop-loading');
        if (loading) loading.remove();
    }
}

// ========== АВТОЗАГРУЗКА МАГАЗИНА ==========
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

// ========== ДЛЯ ОТЛАДКИ ==========
window.PSMC = window.PSMC || {};
window.PSMC.shop = {
    load: loadShopProducts,
    config: SHOP_CONFIG
};
window.PSMC.server = {
    check: checkServerStatus,
    state: serverState
};