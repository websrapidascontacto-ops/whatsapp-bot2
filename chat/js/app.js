/* --- VARIABLES GLOBALES --- */
let currentChat = null;
let unreadCounts = {}; 
let typingTimeout; // Control para el teclado manual

const chatList = document.getElementById("chat-list");
const messagesContainer = document.getElementById("messages");
const chatContent = document.getElementById("chatContent");
const chatListContainer = document.getElementById("chatListContainer");

// --- 1. DATA DEL FLUJO NEMO ---
const DATA_FLUJO_NEMO = { /* ... tu data se mantiene intacta ... */ };

/* --- INICIALIZACIÓN --- */
loadChats();

/* --- EVENTOS DE INTERFAZ --- */
const messageInput = document.getElementById("message-input");

messageInput.addEventListener("keypress", e => {
    if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
});

// Evento para detectar cuando TÚ escribes (Presencia Real)
messageInput.addEventListener("input", () => {
    setWhatsAppPresence('composing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        setWhatsAppPresence('paused');
    }, 2000);
});

// Emojis y Clics (Mantenido igual)
const picker = new EmojiMart.Picker({
    onEmojiSelect: e => { messageInput.value += e.native; }
});
document.getElementById("emoji-picker-container").appendChild(picker);
document.getElementById("emoji-trigger").onclick = (e) => {
    e.stopPropagation();
    const c = document.getElementById("emoji-picker-container");
    c.style.display = c.style.display === "none" ? "block" : "none";
};

/* --- FUNCIONES DE PRESENCIA (CONEXIÓN BACKEND) --- */
async function setWhatsAppPresence(status) {
    if (!currentChat) return;
    try {
        await fetch('/api/whatsapp-presence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChat, status: status })
        });
    } catch (e) { console.error("Error de presencia:", e); }
}

/* --- UI HELPERS (TYPING INDICATOR) --- */
function showTypingIndicator() {
    if (document.getElementById("ai-typing")) return;
    
    // Avisar a WhatsApp que el bot está escribiendo
    setWhatsAppPresence('composing');

    const div = document.createElement("div");
    div.className = "typing-bubble";
    div.id = "ai-typing"; 
    div.style.fontFamily = "'Montserrat', sans-serif";
    div.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById("ai-typing");
    if (indicator) {
        indicator.remove();
        setWhatsAppPresence('paused'); // Quitar el "escribiendo" en WhatsApp
    }
}

/* --- RENDERIZADO Y OTROS --- */
function renderMessage(msg) {
    const div = document.createElement("div");
    div.className = `msg-bubble ${msg.from === "me" ? "msg-sent" : "msg-received"}`;
    div.style.fontFamily = "'Montserrat', sans-serif";

    if (msg.media) {
        const img = document.createElement("img");
        img.src = msg.media;
        img.className = "msg-image";
        img.onclick = () => openLightbox(msg.media);
        div.appendChild(img);
    }
    if (msg.text) {
        const textDiv = document.createElement("div");
        textDiv.innerText = msg.text;
        div.appendChild(textDiv);
    }
    
    const time = document.createElement("div");
    time.className = "msg-time";
    time.innerText = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(time);

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ... Mantén tus funciones de loadChats, confirmSendImages, etc. sin cambios ...

/* --- RESTO DE FUNCIONES (loadChats, openChat, etc.) --- */
// (Copia tus funciones de loadChats, openChat y gestión de archivos aquí abajo una sola vez)
function showTypingIndicator() {
    const messagesArea = document.getElementById("messages");
    if (!messagesArea) return;
    
    // Evitar duplicados si ya está el indicador
    if (document.getElementById("ai-typing")) return;

    const typingDiv = document.createElement("div");
    typingDiv.className = "typing-bubble";
    typingDiv.id = "ai-typing"; 
    typingDiv.innerHTML = `
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    `;
    messagesArea.appendChild(typingDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById("ai-typing");
    if (indicator) indicator.remove();
}

async function sendMessage(){
    if(!currentChat)return;
    const input=document.getElementById("message-input");
    const text=input.value.trim();
    if(!text)return;
    await fetch("/send-message",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({to:currentChat,text})
    });
    input.value="";
}

async function sendFlowTrigger(trigger){
    if(!currentChat)return;
    await fetch("/api/execute-flow",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({to:currentChat, trigger: trigger})
    });
}

// GESTIÓN DE ARCHIVOS / IMÁGENES
let selectedFiles=[];
document.getElementById("file-input").addEventListener("change",(e)=>{
    if(!currentChat){alert("Selecciona un chat primero");return;}
    selectedFiles=[...e.target.files];
    if(selectedFiles.length===0)return;
    const container=document.getElementById("preview-container");
    container.innerHTML="";
    selectedFiles.forEach(file=>{
        const img=document.createElement("img");
        img.src=URL.createObjectURL(file);
        container.appendChild(img);
    });
    document.getElementById("image-modal").style.display="flex";
});

function closeModal(){
    document.getElementById("image-modal").style.display="none";
    document.getElementById("image-comment").value="";
    selectedFiles=[];
    document.getElementById("file-input").value="";
}

async function confirmSendImages() {
    if (!currentChat || selectedFiles.length === 0) return;
    const comment = document.getElementById("image-comment").value;
    for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        try {
            const uploadRes = await fetch("/api/upload-node-media", { method: "POST", body: formData });
            const uploadData = await uploadRes.json();
            if (uploadData.url) {
                await fetch("/send-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ to: currentChat, mediaUrl: uploadData.url, text: comment })
                });
            }
        } catch (err) { console.error(err); }
    }
    closeModal();
}

// BÚSQUEDA Y ELIMINACIÓN
async function searchMessages() {
    const query = document.getElementById("global-search").value.toLowerCase();
    const overlay = document.getElementById("search-results-overlay");
    const list = document.getElementById("search-results-list");
    if (query.length < 2) { overlay.style.display = "none"; return; }
    const res = await fetch("/search?q=" + query);
    const results = await res.json();
    list.innerHTML = "";
    overlay.style.display = "flex";
    results.forEach(res => {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `<div style="font-size:11px; color:var(--blue); font-weight:700">${res.chatId}</div><div>${res.text}</div>`;
        div.onclick = () => { openChat(res.chatId); closeSearch(); };
        list.appendChild(div);
    });
}
function closeSearch() { document.getElementById("search-results-overlay").style.display = "none"; }

async function deleteCurrentChat() {
    if (!currentChat) return;
    if (confirm("🗑️ ¿Borrar conversación?")) {
        const res = await fetch(`/chats/${currentChat}`, { method: "DELETE" });
        if (res.ok) { currentChat = null; messagesContainer.innerHTML = ""; loadChats(); }
    }
}

/* ========================= GESTIÓN DEL EDITOR ========================= */

let currentEditingFlowId = null;

function openFlowEditor(flowId = null) {
    currentEditingFlowId = flowId;
    const overlay = document.getElementById('flow-editor-overlay');
    if(overlay) {
        overlay.style.display = 'block';
        loadFlowDataIntoEditor(flowId);
    }
}

function closeFlowEditor() {
    if(confirm("¿Seguro de cerrar el editor? Asegúrate de haber guardado.")) {
        document.getElementById('flow-editor-overlay').style.display = 'none';
        currentEditingFlowId = null;
    }
}

async function loadFlowDataIntoEditor(flowId) {
    try {
        const url = flowId ? `/api/get-flow-by-id/${flowId}` : '/api/get-flow';
        const response = await fetch(url);
        const data = await response.json();
        
        const iframe = document.getElementById('flow-iframe');
        if(iframe && iframe.contentWindow) {
            // Esperamos un momento a que el iframe esté listo
            setTimeout(() => {
                // IMPORTANTE: Enviamos el tipo 'IMPORT_CLEAN' para que el iframe borre lo anterior
                iframe.contentWindow.postMessage({ type: 'IMPORT_CLEAN', data: data }, '*');
            }, 500);
        }
    } catch (e) { console.error("Error al cargar datos en editor:", e); }
}


window.openFlowsModal = async function() {
    const modal = document.getElementById('flows-modal');
    if(modal) modal.style.display = 'flex';
    const listContainer = document.getElementById('flows-list-container');
    if(!listContainer) return;
    listContainer.innerHTML = '<div style="color:white; padding:20px;">Cargando flujos...</div>';
    try {
        const res = await fetch('/api/get-flows');
        const flows = await res.json();
        listContainer.innerHTML = "";
        flows.forEach(f => {
            const div = document.createElement('div');
            div.style = "background:#1e1e2e; padding:15px; border-radius:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333; font-family:'Montserrat', sans-serif;";
            div.innerHTML = `
                <div>
                    <div style="color:white; font-weight:700; font-size:14px;">${f.name}</div>
                    <div style="font-size:10px; font-weight:bold; margin-top:4px; color:${f.active ? '#25D366' : '#ff4b2b'};">
                        ${f.active ? '● ACTIVADO (Bot usando este)' : '○ DESACTIVADO'}
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    ${!f.active ? `<button onclick="activateFlow('${f.id}')" style="background:#25D366; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">ACTIVAR</button>` : ''}
                    <button onclick="openFlowEditor('${f.id}')" style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">EDITAR</button>
                    <button onclick="deleteFlow('${f.id}')" style="background:#ff4b2b; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">BORRAR</button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    } catch (e) { listContainer.innerHTML = '<div style="color:white;">Error al cargar flujos.</div>'; }
};

/* ========================= GESTIÓN DE FLUJOS (CORREGIDO) ========================= */

window.activateFlow = async (id) => {
    try {
        const res = await fetch(`/api/activate-flow/${id}`, { method: 'POST' });
        if(res.ok) {
            alert("🚀 Flujo activado correctamente para el Bot");
            // Refrescamos el modal para que el punto cambie a VERDE y el borde se actualice
            if (typeof openFlowsModal === 'function') {
                await openFlowsModal();
            }
        } else {
            alert("❌ No se pudo activar el flujo");
        }
    } catch (error) {
        console.error("Error en activateFlow:", error);
    }
};

window.deleteFlow = async (id) => {
    if(!confirm("⚠️ ¿Estás seguro de eliminar este flujo de forma permanente?")) return;
    try {
        const res = await fetch(`/api/delete-flow/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("🗑️ Flujo eliminado con éxito");
            if (typeof openFlowsModal === 'function') {
                openFlowsModal();
            }
        }
    } catch (error) {
        console.error("Error en deleteFlow:", error);
    }
};

/* MENÚ DE ROBOT 🤖 (LANZAR TRIGGERS AL CHAT ACTUAL) */
window.toggleFlowMenu = async function() {
    const menu = document.getElementById('flow-menu');
    if(!menu) return;

    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        menu.innerHTML = '<div style="padding:15px; color:white; font-family:Montserrat; font-size:12px; text-align:center;">⌛ Cargando triggers...</div>';
        
        try {
            // Buscamos el flujo que está marcado como principal (isMain: true)
            const response = await fetch('/api/get-flow');
            const data = await response.json();
            
            menu.innerHTML = ""; 
            
            if (data && data.drawflow && data.drawflow.Home && data.drawflow.Home.data) {
                const nodes = data.drawflow.Home.data;
                let foundTriggers = false;

                for (const id in nodes) {
                    if (nodes[id].name === 'trigger') {
                        foundTriggers = true;
                        const val = nodes[id].data.val;
                        
                        const item = document.createElement('div');
                        // Diseño mejorado con Montserrat y hover
                        item.style = `
                            padding: 12px 15px; 
                            color: white; 
                            cursor: pointer; 
                            border-bottom: 1px solid #4a5568; 
                            font-family: 'Montserrat', sans-serif; 
                            font-size: 13px;
                            transition: background 0.2s;
                        `;
                        item.onmouseover = () => item.style.background = "#3d4a5d";
                        item.onmouseout = () => item.style.background = "transparent";
                        
                        item.innerHTML = `🤖 <span style="margin-left:8px;">${val}</span>`;
                        
                        item.onclick = () => { 
                            sendFlowTrigger(val); 
                            menu.style.display = 'none'; 
                        };
                        menu.appendChild(item);
                    }
                }

                if (!foundTriggers) {
                    menu.innerHTML = '<div style="padding:15px; color:#a0aec0; font-family:Montserrat; font-size:12px;">No se encontraron triggers en el flujo activo</div>';
                }

            } else {
                menu.innerHTML = '<div style="padding:15px; color:#a0aec0; font-family:Montserrat; font-size:12px;">No hay un flujo principal activado</div>';
            }
        } catch (e) { 
            console.error("Error cargando menú de triggers:", e);
            menu.innerHTML = '<div style="padding:15px; color:#fc8181; font-family:Montserrat; font-size:12px;">❌ Error al conectar con el servidor</div>'; 
        }
    } else { 
        menu.style.display = 'none'; 
    }
};
/* --- Función para el botón de "Subir JSON" --- */
window.importFlow = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const flowData = JSON.parse(e.target.result);
            const iframe = document.getElementById('flow-iframe');
            
            if(iframe && iframe.contentWindow) {
                // Esto limpia el lienzo y pone los 51 nodos en su sitio
                iframe.contentWindow.postMessage({ type: 'IMPORT_CLEAN', data: flowData }, '*');
                alert("✅ Flujo importado y lienzo optimizado.");
            }
        } catch (err) {
            alert("❌ Error: El archivo no es un JSON válido");
        }
    };
    reader.readAsText(file);
};
// Agrega esto al final de tu script actual para que la flecha de "Volver" funcione
document.addEventListener('DOMContentLoaded', () => {
    // Buscamos la barra de arriba del chat
    const header = document.querySelector(".chat-header-info"); 
    
    if (header) {
        // Si no existe el botón ya, lo creamos
        if (!document.querySelector('.mobile-back-btn')) {
            const backBtn = document.createElement('button');
            backBtn.className = 'mobile-back-btn';
            backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>'; // Solo flecha para que se vea limpio
            backBtn.onclick = () => {
                document.body.classList.remove('show-chat'); // Quita el modo enfoque
            };
            // Lo ponemos al principio del header
            header.prepend(backBtn);
        }
    }
});
/* --- BLOQUE FINAL UNIFICADO (IA + FLUJOS) --- */

/* ========================= LÓGICA DE IA Y FLUJOS (UNIFICADO) ========================= */

async function procesarDudaConIA(textoDelUsuario) {
    if (!currentChat) return;
    showTypingIndicator(); 

    try {
        // 1. Pedir respuesta a OpenAI
        const response = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: textoDelUsuario, chatId: currentChat })
        });

        const data = await response.json();
        hideTypingIndicator(); 

        if (data.text) {
            let textoParaMostrar = data.text;

            // 2. Detectar y ejecutar acciones ([ACTION:XXX])
            const regexAction = /\[ACTION:(\w+)\]/i;
            const match = textoParaMostrar.match(regexAction);
            
            if (match) {
                const accionCompleta = match[0];
                textoParaMostrar = textoParaMostrar.replace(accionCompleta, "").trim();
                procesarRespuestaFlujo(accionCompleta);
            }

            const mensajeFinal = textoParaMostrar.trim();

            // 3. ENVIAR A WHATSAPP (Esto hace que llegue al celular) 📱
            await fetch("/send-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: currentChat, text: mensajeFinal })
            });

            // 4. Renderizar en el CRM (Montserrat)
            renderMessage({ 
                from: "bot", 
                text: mensajeFinal, 
                timestamp: Date.now() 
            });
        }
    } catch (error) {
        hideTypingIndicator();
        console.error("❌ Error en el puente de IA:", error);
    }
}

function procesarRespuestaFlujo(accion) {
    const redSocial = accion.replace("[ACTION:", "").replace("]", "").toLowerCase();
    // Mapeo exacto a tus botones del Flow
    const mapeo = { 
        "tiktok": "Tik Tok ", 
        "instagram": "Instagram ", 
        "facebook": "Facebook " 
    };
    
    if (mapeo[redSocial]) {
        console.log("🚀 Disparando flujo para:", redSocial);
        ejecutarNodoPorNombre(mapeo[redSocial]);
    }
}

async function ejecutarNodoPorNombre(nombreBoton) {
    try {
        await fetch("/api/execute-flow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: currentChat, trigger: nombreBoton })
        });
    } catch (e) { 
        console.error("❌ Error disparando flujo:", e); 
    }
}

// 2. Mapeo de acciones a nombres de nodos
function procesarRespuestaFlujo(accion) {
    console.log("🚀 Redirigiendo flujo:", accion);
    const redSocial = accion.replace("[ACTION:", "").replace("]", "").toLowerCase();

    // Mapeo exacto a tus botones del Flow
    if (redSocial === 'tiktok') {
        ejecutarNodoPorNombre("Tik Tok "); 
    } else if (redSocial === 'instagram') {
        ejecutarNodoPorNombre("Instagram ");
    } else if (redSocial === 'facebook') {
        ejecutarNodoPorNombre("Facebook ");
    }
}
/* --- CARGA DE CHATS Y APERTURA (Lógica faltante) --- */

async function loadChats() {
    try {
        const res = await fetch("/chats");
        // Si el servidor falla, lanzamos error para no romper el código
        if (!res.ok) throw new Error("Servidor no responde");

        const chats = await res.json();
        chatList.innerHTML = "";

        if (!chats || chats.length === 0) {
            chatList.innerHTML = "<div style='color:gray; padding:20px; font-family:Montserrat;'>No hay chats disponibles</div>";
            return;
        }

        chats.forEach(chat => {
            // Buscamos el ID en cualquier formato posible (id o chatId)
            const id = chat.id || chat.chatId || (chat._id ? chat._id.toString() : null);
            
            if (!id) return; // Saltamos si no hay rastro de ID

            const div = document.createElement("div");
            div.className = `chat-item ${id === currentChat ? "active" : ""}`;
            div.style.fontFamily = "'Montserrat', sans-serif";
            
            // Si no hay nombre, usamos el número o ID
            const name = chat.name || id || "Usuario Desconocido";
            const lastMsg = (chat.lastMessage && chat.lastMessage.text) ? chat.lastMessage.text : "Sin mensajes";
            
            div.innerHTML = `
                <div class="chat-info" style="pointer-events: none;">
                    <div class="chat-name" style="font-weight:700;">${name}</div>
                    <div class="chat-last-msg" style="font-size:12px; opacity:0.8;">${lastMsg}</div>
                </div>
            `;
            
            div.onclick = () => openChat(id);
            chatList.appendChild(div);
        });
    } catch (e) {
        console.error("Error en loadChats:", e);
        chatList.innerHTML = "<div style='color:red; padding:20px;'>⚠️ Error al conectar con los chats</div>";
    }
}

async function openChat(chatId) {
    if (!chatId || chatId === "undefined") return;

    currentChat = chatId;
    
    // UI: Enfoque en móvil
    document.body.classList.add('show-chat');

    // Optimizamos: Solo ponemos el "Cargando" si el contenedor está vacío
    if(messagesContainer.innerHTML === "") {
        messagesContainer.innerHTML = "<div id='temp-loading' style='color:white; padding:20px; font-family:Montserrat;'>Cargando mensajes...</div>";
    }

    try {
        const res = await fetch(`/chats/${chatId}`);
        const messages = await res.json();
        
        messagesContainer.innerHTML = ""; // Limpiamos

        if (Array.isArray(messages)) {
            messages.forEach(msg => renderMessage(msg));
        }
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // CORRECCIÓN: No llames a loadChats() aquí. Solo cambia la clase CSS.
        document.querySelectorAll('.chat-item').forEach(i => {
            i.classList.remove('active');
            // Si el texto del item contiene el ID, le ponemos active
            if(i.innerText.includes(chatId)) i.classList.add('active');
        });

    } catch (e) {
        console.error("Error al abrir chat:", e);
        messagesContainer.innerHTML = "<div style='color:white; padding:20px;'>Error al cargar.</div>";
    }
}
/* ========================= CONEXIÓN TIEMPO REAL ========================= */
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}`);

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "new_message") {
        const msg = data.message;

        // 1. Si el mensaje es para el chat que tengo abierto, lo pinto al instante
        if (msg.chatId === currentChat || msg.id === currentChat) {
            renderMessage(msg);
            
            // 2. ¡AQUÍ SE ACTIVA LA IA! Si el mensaje viene del cliente, la IA responde
            if (msg.from !== "me" && msg.from !== "bot") {
                procesarDudaConIA(msg.text);
            }
        }
        
        // 3. Actualizamos la lista de la izquierda discretamente
        updateChatListPreview(msg);
    }
};

function updateChatListPreview(msg) {
    const id = msg.chatId || msg.id;
    const items = document.querySelectorAll('.chat-item');
    items.forEach(item => {
        if (item.innerText.includes(id)) {
            const lastMsgDiv = item.querySelector('.chat-last-msg');
            if (lastMsgDiv) lastMsgDiv.innerText = msg.text;
            // Movemos el chat arriba
            chatList.prepend(item);
        }
    });
}