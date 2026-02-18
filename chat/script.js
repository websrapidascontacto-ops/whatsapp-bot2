// ================= CONFIGURACIÓN INICIAL =================
const socket = new WebSocket(`ws://${window.location.host}`);
const chatContainer = document.getElementById('chat-container');
const badgeWhatsapp = document.getElementById('badge-whatsapp');
let unreadCount = 0;

// ================= LÓGICA DE WEBSOCKET =================
socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === "incoming") {
        handleIncomingMessage(msg.data);
    } else if (msg.type === "sent") {
        handleSentMessage(msg.data);
    }
};

// ================= MANEJO DE MENSAJES =================

function handleIncomingMessage(data) {
    // 1. Actualizar contador de notificaciones en la barra lateral
    unreadCount++;
    badgeWhatsapp.innerText = unreadCount;
    badgeWhatsapp.style.display = 'block';

    // 2. Buscar si ya existe un box para este chat
    let box = document.getElementById(`chat-${data.from}`);
    
    if (!box) {
        // Si no existe, creamos uno nuevo al lado del anterior
        box = createChatBox(data.from, data.pushname || data.from, data.source);
        chatContainer.appendChild(box);
    }

    // 3. Añadir el mensaje al área de mensajes del box
    appendMessage(data.from, data.text, 'incoming', data.mediaUrl);
}

function handleSentMessage(data) {
    appendMessage(data.to, data.text, 'sent');
}

// ================= CREADOR DE BOXES (UX/UI) =================

function createChatBox(chatId, name, source) {
    const box = document.createElement('div');
    box.id = `chat-${chatId}`;
    box.className = 'chat-box';
    
    // Icono según la fuente
    const iconClass = source === 'whatsapp' ? 'fab fa-whatsapp' : 'fas fa-envelope';
    const iconColor = source === 'whatsapp' ? '#22c55e' : '#f8fafc';

    box.innerHTML = `
        <div class="chat-header">
            <i class="${iconClass}" style="color: ${iconColor}"></i>
            <span style="font-weight: 700;">${name}</span>
        </div>
        <div class="messages-area" id="messages-${chatId}">
            </div>
        <div class="chat-input-area">
            <input type="text" id="input-${chatId}" placeholder="Escribe un mensaje..." 
                onkeypress="if(event.key === 'Enter') sendMessage('${chatId}', '${source}')">
            <button onclick="sendMessage('${chatId}', '${source}')">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;

    // Cargar historial si fuera necesario (opcional)
    loadHistory(chatId);
    
    return box;
}

// ================= FUNCIONES DE APOYO =================

function appendMessage(chatId, text, type, mediaUrl = null) {
    const area = document.getElementById(`messages-${chatId}`);
    if (!area) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    
    if (mediaUrl) {
        msgDiv.innerHTML = `<img src="${mediaUrl}" style="width:100%; border-radius:10px; margin-bottom:5px;"><br>${text}`;
    } else {
        msgDiv.innerText = text;
    }

    area.appendChild(msgDiv);
    area.scrollTop = area.scrollHeight; // Auto-scroll al final
}

async function sendMessage(to, source) {
    const input = document.getElementById(`input-${to}`);
    const text = input.value;
    if (!text) return;

    // Determinar endpoint según la fuente
    let endpoint = "/send-message"; // Default WhatsApp
    if (source === "facebook") endpoint = "/send-facebook";
    if (source === "instagram") endpoint = "/send-instagram";

    try {
        await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, text })
        });
        input.value = "";
    } catch (err) {
        console.error("Error al enviar:", err);
    }
}

async function loadHistory(chatId) {
    const res = await fetch(`/chat/messages/${chatId}`);
    const data = await res.json();
    data.forEach(m => {
        appendMessage(chatId, m.text, m.from === 'me' ? 'sent' : 'incoming', m.mediaUrl);
    });
}

// Limpiar notificaciones al interactuar con la sección
document.querySelector('.nav-item.active').onclick = () => {
    unreadCount = 0;
    badgeWhatsapp.style.display = 'none';
};
