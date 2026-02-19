// Конфигурация сервера PSMC
const SERVER_CONFIG = {
    ip: "185.22.154.9",
    javaPort: "29067",
    bedrockPort: "19132",
    version: "1.21.11",
    currentYear: 2026,
    // API для проверки сервера
    apis: [
        {
            name: "MCSRVSTAT",
            url: "https://api.mcsrvstat.us/2/",
            timeout: 5000
        },
        {
            name: "MINETOOLS",
            url: "https://api.minetools.eu/ping/",
            timeout: 5000
        },
        {
            name: "MCAPI",
            url: "https://api.mcstatus.io/v2/status/java/",
            timeout: 5000
        }
    ]
};

// Состояние сервера
let serverState = {
    online: false,
    players: {
        online: 0,
        max: 100
    },
    motd: "PSMC - Prosto Server Minecraft",
    version: SERVER_CONFIG.version,
    ping: 0,
    lastUpdate: null,
    isChecking: false,
    lastSuccessApi: null,
    errorCount: 0
};

// DOM элементы
const elements = {};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log("PSMC сайт запущен - режим реальной проверки");
    
    // Инициализация элементов
    initElements();
    
    // Установка статических данных
    setStaticData();
    
    // Назначение обработчиков
    setupEventListeners();
    
    // Первая проверка сервера
    checkServerStatus(true);
    
    // Автоматическое обновление каждые 30 секунд
    setInterval(() => checkServerStatus(false), 30000);
    
    // Обновление времени
    setInterval(updateTimeDisplay, 60000);
});

// Инициализация элементов
function initElements() {
    // Основные элементы
    elements.statusText = document.getElementById('statusText');
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.countNumber = document.querySelector('.count-number');
    elements.serverPing = document.getElementById('serverPing');
    elements.lastUpdate = document.getElementById('lastUpdate');
    elements.refreshBtn = document.getElementById('refreshBtn');
    elements.copyIpBtn = document.getElementById('copyIpBtn');
    elements.serverVersion = document.getElementById('serverVersion');
    elements.statusSub = document.querySelector('.status-sub');
    
    // Вкладки
    elements.tabBtns = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');
    
    // Быстрое подключение
    elements.quickJava = document.getElementById('quickJava');
    elements.quickBedrock = document.getElementById('quickBedrock');
}

// Установка статических данных
function setStaticData() {
    // Устанавливаем версию
    if (elements.serverVersion) {
        elements.serverVersion.textContent = SERVER_CONFIG.version;
    }
    
    // Обновляем год
    document.querySelectorAll('.footer-bottom p, .info-value').forEach(el => {
        if (el.textContent.includes('2026')) {
            el.textContent = SERVER_CONFIG.currentYear;
        }
    });
}

// Основная функция проверки сервера
async function checkServerStatus(isInitial = false, notification = false) {
    if (serverState.isChecking) return;
    
    serverState.isChecking = true;
    const startTime = Date.now();
    
    // Устанавливаем состояние загрузки
    setStatus('loading', 'Проверяем сервер...');
    if (elements.refreshBtn) {
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        elements.refreshBtn.disabled = true;
    }
    
    try {
        // Пробуем все API по очереди
        const serverData = await tryAllApis();
        
        // Обновляем состояние сервера
        updateServerState(serverData);
        
        // Обновляем интерфейс
        updateInterface();
        
        // Обновляем время
        serverState.lastUpdate = new Date();
        updateTimeDisplay();
        
        // Показываем уведомление только если это не первая загрузка
        if (!isInitial && notification) {
            if (serverState.online) {
                showNotification(`Сервер онлайн Игроков: ${serverState.players.online}`, 'success');
            } else {
                showNotification('Сервер оффлайн', 'info');
            }
        }
        
        // Сбрасываем счетчик ошибок при успехе
        serverState.errorCount = 0;
        
    } catch (error) {
        console.error('Ошибка проверки сервера:', error);
        
        // Увеличиваем счетчик ошибок
        serverState.errorCount++;
        
        // Если много ошибок подряд, показываем что сервер выключен
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
        const duration = endTime - startTime;
        console.log(`Проверка заняла: ${duration}ms`);
        
        serverState.isChecking = false;
        
        if (elements.refreshBtn) {
            elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить сейчас';
            elements.refreshBtn.disabled = false;
        }
    }
}

// Пробуем все доступные API
async function tryAllApis() {
    const javaAddress = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
    
    // Создаем массив промисов для всех API
    const promises = SERVER_CONFIG.apis.map(async (api) => {
        try {
            let apiUrl, options;
            
            // Формируем URL в зависимости от API
            switch(api.name) {
                case "MCSRVSTAT":
                    apiUrl = `${api.url}${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
                    break;
                case "MINETOOLS":
                    apiUrl = `${api.url}${SERVER_CONFIG.ip}/${SERVER_CONFIG.javaPort}`;
                    break;
                case "MCAPI":
                    apiUrl = `${api.url}${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
                    break;
                default:
                    apiUrl = `${api.url}${javaAddress}`;
            }
            
            console.log(`Пробуем API: ${api.name} - ${apiUrl}`);
            
            // Создаем AbortController для таймаута
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), api.timeout);
            
            const response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PSMC-Server-Checker/1.0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`API ${api.name} вернул статус ${response.status}`);
            }
            
            const data = await response.json();
            
            // Обрабатываем данные в зависимости от API
            return processApiData(data, api.name);
            
        } catch (error) {
            console.warn(`API ${api.name} не сработало:`, error.message);
            throw error;
        }
    });
    
    // Ждем первый успешный ответ
    return await Promise.any(promises);
}

// Обработка данных от разных API
function processApiData(data, apiName) {
    console.log(`Данные от ${apiName}:`, data);
    
    switch(apiName) {
        case "MCSRVSTAT":
            return {
                online: data.online || false,
                players: {
                    online: data.players?.online || 0,
                    max: data.players?.max || 100
                },
                motd: data.motd?.clean || "PSMC Server",
                version: data.version || SERVER_CONFIG.version,
                ping: data.debug?.ping ? true : 0
            };
            
        case "MINETOOLS":
            return {
                online: !data.error || false,
                players: {
                    online: data.players?.online || 0,
                    max: data.players?.max || 100
                },
                motd: data.description || "PSMC Server",
                version: data.version?.name || SERVER_CONFIG.version,
                ping: data.latency || 0
            };
            
        case "MCAPI":
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
            
        default:
            return {
                online: false,
                players: { online: 0, max: 100 },
                motd: "PSMC Server",
                version: SERVER_CONFIG.version,
                ping: 0
            };
    }
}

// Обновление состояния сервера
function updateServerState(data) {
    serverState.online = data.online;
    serverState.players = data.players;
    serverState.motd = data.motd;
    serverState.version = data.version || SERVER_CONFIG.version;
    serverState.ping = data.ping || 0;
    
    // Сохраняем время обновления
    serverState.lastUpdate = new Date();
}

// Обновление интерфейса
function updateInterface() {
    // Статус сервера
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
    
    // Количество игроков
    if (elements.countNumber) {
        elements.countNumber.textContent = serverState.online ? serverState.players.online : '0';
    }
    
    // Пинг
    if (elements.serverPing) {
        if (serverState.online && serverState.ping > 0) {
            elements.serverPing.textContent = `${Math.round(serverState.ping)} мс`;
        } else {
            elements.serverPing.textContent = '—';
        }
    }
    
    // Добавляем/обновляем информационное сообщение
    updateStatusMessage();
}

// Установка статуса
function setStatus(type, message) {
    if (!elements.statusIndicator) return;
    
    elements.statusIndicator.className = 'status-indicator';
    elements.statusIndicator.classList.add(type);
}

// Обновление сообщения о статусе
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

// Обновление времени
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

// Вспомогательные функции
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

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка обновления
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => checkServerStatus(false, true));
    }
    
    // Копирование IP
    if (elements.copyIpBtn) {
        elements.copyIpBtn.addEventListener('click', () => {
            copyToClipboard(`${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`);
        });
    }
    
    // Вкладки
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Быстрое копирование
    const copyButtons = [
        elements.quickJava,
        elements.quickBedrock,
        ...document.querySelectorAll('.copy-small'),
        document.querySelector('.copy-full')
    ].filter(Boolean);
    
    copyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            let text = '';
            
            if (this === elements.quickJava) {
                text = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.javaPort}`;
            } else if (this === elements.quickBedrock) {
                text = `${SERVER_CONFIG.ip}:${SERVER_CONFIG.bedrockPort}`;
            } else if (this.dataset.address) {
                text = this.dataset.address;
            } else if (this.dataset.bedrock) {
                text = this.dataset.bedrock;
            }
            
            if (text) copyToClipboard(text);
        });
    });
}

// Переключение вкладок
function switchTab(tabName) {
    elements.tabBtns.forEach(btn => btn.classList.remove('active'));
    elements.tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.style.display = 'block';
        activeTab.classList.add('active');
    }
}

// Копирование в буфер обмена
function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification(`Скопировано: ${text}`, 'success');
            
            const btn = event?.target.closest('button');
            if (btn) {
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

// Показ уведомлений
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

// Экспорт функций для отладки
window.PSMC = {
    checkStatus: () => checkServerStatus(false),
    getState: () => serverState,
    getConfig: () => SERVER_CONFIG,
    simulateOnline: (players = 5) => {
        serverState.online = true;
        serverState.players.online = players;
        serverState.motd = "PSMC - Prosto Server Minecraft";
        serverState.ping = 35;
        serverState.lastUpdate = new Date();
        updateInterface();
        showNotification(`Симуляция: сервер онлайн (${players} игроков)`, 'info');
    },
    simulateOffline: () => {
        serverState.online = false;
        serverState.players.online = 0;
        serverState.motd = "Сервер выключен";
        serverState.ping = 0;
        serverState.lastUpdate = new Date();
        updateInterface();
        showNotification('Симуляция: сервер оффлайн', 'info');
    }
};

// Инициализация вкладок
switchTab('java');