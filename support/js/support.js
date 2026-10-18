import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://alhrersusznjnpnyqlcq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_B10yl_NY341a4H-BvjW78A_KyxZlDbQ' 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// DOM-элементы
const loginScreen = document.getElementById('login-screen')
const dashboardScreen = document.getElementById('dashboard-screen')
const loginForm = document.getElementById('login-form')
const loginError = document.getElementById('login-error')
const ticketsList = document.getElementById('tickets-list')
const chatPanel = document.getElementById('chat-panel')

// Элементы кастомного уведомления
const alertModal = document.getElementById('alert-modal')
const alertTitle = document.getElementById('alert-title')
const alertMessage = document.getElementById('alert-message')
const alertOkBtn = document.getElementById('alert-ok-btn')

let currentTicketId = null
let currentTicket = null
let realtimeChannel = null
let closeTimer = null

// === Функция красивого уведомления (вместо alert) ===
function showAlert(title, message) {
    return new Promise((resolve) => {
        alertTitle.textContent = title
        alertMessage.innerHTML = message.replace(/\n/g, '<br>')
        alertModal.style.display = 'flex'
        
        alertOkBtn.onclick = () => {
            alertModal.style.display = 'none'
            resolve()
        }
    })
}

// === 1. Авторизация ===
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('login-email').value
    const password = document.getElementById('login-password').value
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { loginError.textContent = error.message; return }
    
    loginError.textContent = ''
    showDashboard()
})

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut()
    showLogin()
})

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) showDashboard(); else showLogin();
}

function showDashboard() {
    loginScreen.style.display = 'none'
    dashboardScreen.style.display = 'block'
    loadTickets()
}

function showLogin() {
    loginScreen.style.display = 'block'
    dashboardScreen.style.display = 'none'
    loginForm.reset()
}

// === 2. Загрузка списка тикетов ===
async function loadTickets() {
    const { data: tickets, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false })
    
    if (error) { console.error(error); return }
    
    ticketsList.innerHTML = ''
    tickets.forEach(ticket => {
        const div = document.createElement('div')
        div.className = 'ticket-item'
        div.id = `ticket-${ticket.id}`
        div.innerHTML = `
            <span class="ticket-subject">${ticket.subject || 'Без темы'}</span>
            <div class="ticket-meta">
                <span>${ticket.requester_email || 'Неизвестный'}</span>
                <span class="status-badge status-${ticket.status}">${ticket.status}</span>
            </div>
        `
        div.addEventListener('click', () => openTicket(ticket))
        ticketsList.appendChild(div)
    })
}

// === 3. Открытие тикета ===
async function openTicket(ticket) {
    if (closeTimer) { clearInterval(closeTimer); closeTimer = null; } // Сбрасываем таймер при переключении
    if (realtimeChannel) supabase.removeChannel(realtimeChannel)

    currentTicketId = ticket.id
    currentTicket = ticket
    
    document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active'))
    const activeEl = document.getElementById(`ticket-${ticket.id}`)
    if (activeEl) activeEl.classList.add('active')

    chatPanel.innerHTML = `
        <div class="chat-header">
            <div>
                <h3 style="margin:0;">${ticket.subject || 'Без темы'}</h3>
                <small style="color:var(--muted);">${ticket.requester_email}</small>
            </div>
            <div style="display:flex; gap:10px;">
                <button id="block-client-btn" class="action-btn secondary" title="Заблокировать"><i class="fas fa-ban"></i></button>
                <button id="close-ticket-btn" class="action-btn secondary" ${ticket.status === 'closed' ? 'disabled' : ''}>Закрыть тикет</button>
            </div>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-area ${ticket.status === 'closed' ? 'disabled' : ''}" id="chat-input-area">
            <textarea id="reply-input" rows="2" placeholder="${ticket.status === 'closed' ? 'Тикет закрыт. Клиент не может писать.' : 'Напишите ответ...'}"></textarea>
            <button id="send-reply-btn" class="action-btn primary" style="width:auto;"><i class="fas fa-paper-plane"></i></button>
        </div>
    `

    document.getElementById('close-ticket-btn').addEventListener('click', closeTicket)
    document.getElementById('send-reply-btn').addEventListener('click', sendReply)
    document.getElementById('block-client-btn').addEventListener('click', blockClient)

    loadMessages(ticket.id)

    // Подписываемся на новые сообщения в реальном времени
    realtimeChannel = supabase.channel(`ticket-${ticket.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, payload => {
            // Если пришло сообщение от клиента пока тикет закрывается
            if (payload.new.sender_type === 'client' && closeTimer) {
                clearInterval(closeTimer)
                closeTimer = null
                supabase.from('support_tickets').update({ status: 'open' }).eq('id', ticket.id).then(() => {
                    showAlert('Тикет снова открыт!', 'Клиент написал сообщение во время закрытия. Удаление отменено, статус изменен на "open".')
                    openTicket({...ticket, status: 'open'})
                })
            } else if (payload.new.sender_type === 'client') {
                loadMessages(ticket.id)
            }
        })
        .subscribe()
}

async function loadMessages(ticketId) {
    const messagesContainer = document.getElementById('chat-messages')
    if (!messagesContainer) return

    const { data: messages, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
    
    if (error) { console.error(error); return }
    
    messagesContainer.innerHTML = ''
    messages.forEach(msg => {
        const div = document.createElement('div')
        div.className = `message ${msg.sender_type}`
        div.innerHTML = `
            <div>${msg.body.replace(/\n/g, '<br>')}</div>
            <div class="message-meta">${new Date(msg.created_at).toLocaleTimeString()}</div>
        `
        messagesContainer.appendChild(div)
    })
    messagesContainer.scrollTop = messagesContainer.scrollHeight
}

// === 4. Отправка ответа ===
async function sendReply() {
    const input = document.getElementById('reply-input')
    const text = input.value.trim()
    if (!text || !currentTicketId || currentTicket.status === 'closed') return

    const btn = document.getElementById('send-reply-btn')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

    const { error: msgError } = await supabase
        .from('support_messages')
        .insert({ ticket_id: currentTicketId, sender_type: 'agent', body: text })
        .select()

    if (msgError) { 
        showAlert('Ошибка БД', msgError.message)
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'
        return 
    }

    const { error: fnError } = await supabase.functions.invoke('send-reply-email', {
        body: {
            ticket_id: currentTicketId,
            to: currentTicket.requester_email,
            subject: currentTicket.subject,
            reply_text: text,
            in_reply_to: currentTicket.resend_message_id 
        }
    })

    if (fnError) {
        showAlert('Внимание', 'Сообщение сохранено, но письмо не отправлено: ' + fnError.message)
    } else {
        input.value = ''
        loadMessages(currentTicketId)
    }

    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'
}

// === 5. Закрытие с таймером на 20 секунд ===
async function closeTicket() {
    if (!currentTicketId) return
    
    await showAlert('Закрытие тикета', 'Тикет будет удален через 20 секунд. Если клиент напишет сообщение, удаление отменится.')
    
    const closeBtn = document.getElementById('close-ticket-btn')
    closeBtn.disabled = true
    closeBtn.textContent = 'Удаление через 20с...'
    
    let secondsLeft = 20
    closeTimer = setInterval(async () => {
        secondsLeft--
        closeBtn.textContent = `Удаление через ${secondsLeft}с...`
        
        if (secondsLeft <= 0) {
            clearInterval(closeTimer)
            closeTimer = null
            closeBtn.textContent = 'Удаление...'
            
            // Удаляем тикет
            const { error } = await supabase.from('support_tickets').delete().eq('id', currentTicketId)
            if (error) {
                showAlert('Ошибка', 'Не удалось удалить тикет: ' + error.message)
                closeBtn.disabled = false
                closeBtn.textContent = 'Закрыть тикет'
            } else {
                // Успешно удален
                chatPanel.innerHTML = '<div class="empty-state">Тикет удален</div>'
                if (realtimeChannel) supabase.removeChannel(realtimeChannel)
                loadTickets()
            }
        }
    }, 1000)
}

// === 6. Блокировка клиента ===
async function blockClient() {
    const email = currentTicket.requester_email
    if (!email) return

    await showAlert('Блокировка', `Вы уверены, что хотите заблокировать клиента ${email}?`)
    
    // Находим профиль клиента по email и ставим is_blocked = true
    const { error } = await supabase
        .from('profiles')
        .update({ is_blocked: true })
        .eq('email', email)
    
    if (error) {
        showAlert('Ошибка', 'Не удалось заблокировать: ' + error.message)
    } else {
        showAlert('Успех', 'Клиент заблокирован. Он больше не сможет создавать тикеты.')
    }
}

// === НАСТРОЙКИ ПРОФИЛЯ ===
const settingsBtn = document.getElementById('settings-btn')
const settingsModal = document.getElementById('settings-modal')
const closeSettingsBtn = document.getElementById('close-settings')
const settingsForm = document.getElementById('settings-form')
const settingsMsg = document.getElementById('settings-msg')

settingsBtn.addEventListener('click', async () => {
    settingsModal.style.display = 'flex'
    settingsMsg.textContent = ''
    document.getElementById('set-password').value = ''

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('nickname').eq('id', user.id).single()
        if (profile) document.getElementById('set-nickname').value = profile.nickname
    }
})

closeSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'none')

settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    settingsMsg.style.color = 'var(--muted)'
    settingsMsg.textContent = 'Сохранение...'

    const newNickname = document.getElementById('set-nickname').value.trim().toLowerCase()
    const newPassword = document.getElementById('set-password').value
    const { data: { user } } = await supabase.auth.getUser()

    try {
        const { error: profileError } = await supabase.from('profiles').update({ nickname: newNickname }).eq('id', user.id)
        if (profileError) {
            if (profileError.code === '23505') throw new Error('Этот никнейм уже занят')
            throw profileError
        }
        if (newPassword) {
            const { error: passError } = await supabase.auth.updateUser({ password: newPassword })
            if (passError) throw passError
        }
        settingsMsg.style.color = 'var(--success)'
        settingsMsg.textContent = 'Успешно сохранено!'
        setTimeout(() => settingsModal.style.display = 'none', 1500)
    } catch (error) {
        settingsMsg.style.color = 'var(--danger)'
        settingsMsg.textContent = error.message
    }
})

checkSession()