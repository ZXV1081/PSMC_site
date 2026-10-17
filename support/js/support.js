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

let currentTicketId = null
let currentTicket = null

// === 1. Авторизация ===
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('login-email').value
    const password = document.getElementById('login-password').value
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
        loginError.textContent = error.message
        return
    }
    
    loginError.textContent = ''
    showDashboard()
})

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut()
    showLogin()
})

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
        showDashboard()
    } else {
        showLogin()
    }
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
        div.id = `ticket-${ticket.id}` // Добавляем ID для выделения
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

// === 3. Открытие тикета и переписка ===
async function openTicket(ticket) {
    currentTicketId = ticket.id
    currentTicket = ticket
    
    // Визуально выделяем выбранный тикет
    document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active'))
    const activeEl = document.getElementById(`ticket-${ticket.id}`)
    if (activeEl) activeEl.classList.add('active')

    chatPanel.innerHTML = `
        <div class="chat-header">
            <div>
                <h3 style="margin:0;">${ticket.subject || 'Без темы'}</h3>
                <small style="color:var(--muted);">${ticket.requester_email}</small>
            </div>
            <button id="close-ticket-btn" class="action-btn secondary">Закрыть тикет</button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-area">
            <textarea id="reply-input" rows="2" placeholder="Напишите ответ..."></textarea>
            <button id="send-reply-btn" class="action-btn primary" style="width:auto;">Отправить</button>
        </div>
    `

    document.getElementById('close-ticket-btn').addEventListener('click', closeTicket)
    document.getElementById('send-reply-btn').addEventListener('click', sendReply)

    loadMessages(ticket.id)
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
            <div class="message-meta">${new Date(msg.created_at).toLocaleString()}</div>
        `
        messagesContainer.appendChild(div)
    })
    messagesContainer.scrollTop = messagesContainer.scrollHeight
}

// === 4. Отправка ответа (клиенту на почту) ===
async function sendReply() {
    const input = document.getElementById('reply-input')
    const text = input.value.trim()
    if (!text || !currentTicketId) return

    // Блокируем кнопку, чтобы не отправить дважды
    const btn = document.getElementById('send-reply-btn')
    btn.disabled = true
    btn.textContent = 'Отправка...'

    // 1. Сохраняем сообщение в БД
    const { data, error: msgError } = await supabase
        .from('support_messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'agent',
            body: text
        })
        .select()

    if (msgError) { 
        alert('ОШИБКА БАЗЫ ДАННЫХ:\n' + msgError.message + '\n' + msgError.details); 
        console.error("Полная ошибка:", msgError);
        btn.disabled = false
        btn.textContent = 'Отправить'
        return 
    }

    // 2. Вызываем Edge Function для отправки письма
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
        alert('Сообщение сохранено, но письмо не отправлено: ' + fnError.message)
    } else {
        input.value = ''
        loadMessages(currentTicketId)
    }

    btn.disabled = false
    btn.textContent = 'Отправить'
}

// === 5. Закрытие тикета ===
async function closeTicket() {
    if (!currentTicketId) return
    const { error } = await supabase
        .from('support_tickets')
        .update({ status: 'closed' })
        .eq('id', currentTicketId)
    
    if (!error) {
        currentTicket.status = 'closed'
        loadTickets()
        alert('Тикет закрыт')
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
        const { data: profile } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('id', user.id)
            .single()
        
        if (profile) {
            document.getElementById('set-nickname').value = profile.nickname
        }
    }
})

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none'
})

settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    settingsMsg.style.color = 'var(--muted)'
    settingsMsg.textContent = 'Сохранение...'

    const newNickname = document.getElementById('set-nickname').value.trim().toLowerCase()
    const newPassword = document.getElementById('set-password').value

    const { data: { user } } = await supabase.auth.getUser()

    try {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ nickname: newNickname })
            .eq('id', user.id)
        
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
        
        setTimeout(() => {
            settingsModal.style.display = 'none'
        }, 1500)

    } catch (error) {
        settingsMsg.style.color = 'var(--danger)'
        settingsMsg.textContent = error.message
    }
})

// Инициализация
checkSession()
