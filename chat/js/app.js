let currentChat=null;
let unreadCounts = {}; // CONTADOR DE NO LEIDOS

const chatList=document.getElementById("chat-list");
const messagesContainer=document.getElementById("messages");
const chatContent=document.getElementById("chatContent");
const chatListContainer=document.getElementById("chatListContainer");

/* ENTER ENVÍA */
document.getElementById("message-input").addEventListener("keypress",e=>{
if(e.key==="Enter"){e.preventDefault();sendMessage();}
});

/* EMOJI */
const picker=new EmojiMart.Picker({onEmojiSelect:e=>{
document.getElementById("message-input").value+=e.native;
}});
document.getElementById("emoji-picker-container").appendChild(picker);

document.getElementById("emoji-trigger").onclick=(e)=>{
e.stopPropagation();
const c=document.getElementById("emoji-picker-container");
c.style.display=c.style.display==="none"?"block":"none";
};

/* CERRAR EMOJI Y MENÚS AL DAR CLICK AFUERA */
document.addEventListener("click", (e) => {
    const pickerContainer = document.getElementById("emoji-picker-container");
    const emojiTrigger = document.getElementById("emoji-trigger");
    const flowMenu = document.getElementById('flow-menu');

    if (pickerContainer && pickerContainer.style.display === "block") {
        if (!pickerContainer.contains(e.target) && e.target !== emojiTrigger) {
            pickerContainer.style.display = "none";
        }
    }
    // Cerrar menú de flujos si se hace clic fuera
    if (flowMenu && !e.target.closest('.flow-selector-container')) {
        flowMenu.style.display = 'none';
    }
});

/* FUNCIONES LIGHTBOX (POP-UP IMÁGENES) */
function openLightbox(src) {
    const lightbox = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const downloadLink = document.getElementById("download-link");
    if(lightbox && img && downloadLink) {
        img.src = src;
        downloadLink.href = src;
        lightbox.style.display = "flex";
    }
}

function closeLightbox() {
    const lightbox = document.getElementById("lightbox");
    if(lightbox) lightbox.style.display = "none";
}

/* WEBSOCKET */
const ws=new WebSocket(
location.protocol==="https:"?"wss://"+location.host:"ws://"+location.host
);

ws.onmessage=(event)=>{
const data=JSON.parse(event.data);

if(data.type==="new_message"){
const chatId = data.message.chatId;

if(chatId===currentChat){
renderMessage(data.message);
} else {
unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
}

loadChats();
}
};

/* CARGAR CHATS */
async function loadChats(){
try {
    const res=await fetch("/chats");
    const chats=await res.json();
    chatList.innerHTML="";

    chats.forEach(chat=>{
    const div=document.createElement("div");
    div.className="chat-item";

    if(unreadCounts[chat._id]){
    div.classList.add("unread");
    }

    div.innerHTML=`
    <div>${chat._id}</div>
    <small>${chat.lastMessage||""}</small>
    ${unreadCounts[chat._id] ? `<span class="badge">${unreadCounts[chat._id]}</span>` : ""}
    `;

    div.onclick=()=>openChat(chat._id);
    chatList.appendChild(div);
    });
} catch(e) { console.error("Error al cargar chats:", e); }
}

/* ABRIR CHAT (CORREGIDO PARA EVITAR TypeError) */
async function openChat(chatId){
currentChat=chatId;

// Limpiar no leídos
delete unreadCounts[chatId];

const hName = document.getElementById("header-name");
if(hName) hName.innerText=chatId;

if(messagesContainer) messagesContainer.innerHTML="";

if(window.innerWidth<=768 && chatListContainer && chatContent){
chatListContainer.style.display="none";
chatContent.classList.add("active-mobile");
}

try {
    const res=await fetch("/messages/"+chatId);
    const msgs=await res.json();
    msgs.forEach(renderMessage);
} catch(e) { console.error("Error al obtener mensajes:", e); }

// Recargar lista para quitar badge
loadChats();
}

function goBackMobile(){
chatContent.classList.remove("active-mobile");
chatListContainer.style.display="flex";
}

function renderMessage(msg){
const div=document.createElement("div");
div.className="msg-bubble "+(msg.from==="me"?"msg-sent":"msg-received");

if(msg.media){
const img=document.createElement("img");
img.src=msg.media;
img.className="msg-image";
img.style.cursor="pointer";
img.onclick = () => openLightbox(msg.media);
img.onerror=function(){this.style.display="none";};
div.appendChild(img);
}

if(msg.text){
const text=document.createElement("div");
text.innerText=msg.text;
div.appendChild(text);
}

const time=document.createElement("div");
time.className="msg-time";
const now=msg.timestamp?new Date(msg.timestamp):new Date();
time.innerText=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
div.appendChild(time);

if(messagesContainer) {
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop=messagesContainer.scrollHeight;
}
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
            console.log("⏳ Subiendo archivo...");
            const uploadRes = await fetch("/api/upload-node-media", { 
                method: "POST", 
                body: formData 
            });
            const uploadData = await uploadRes.json();

            if (uploadData.url) {
                console.log("🚀 Enviando imagen a WhatsApp...");
                await fetch("/send-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        to: currentChat,
                        mediaUrl: uploadData.url,
                        text: comment 
                    })
                });
            }
        } catch (err) {
            console.error("❌ Error en el proceso de envío:", err);
        }
    }
    closeModal();
}

loadChats();

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
        div.innerHTML = `<div style="font-size:11px; color:var(--blue); font-weight:700">${res.chatId}</div>
                         <div style="font-size:13px">${res.text}</div>`;
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

/* ============================= */
/* GESTIÓN DEL EDITOR DE FLUJOS  */
/* ============================= */

function openFlowEditor() {
    const overlay = document.getElementById('flow-editor-overlay');
    if(overlay) {
        overlay.style.display = 'block';
        console.log("Editor de flujos abierto. Montserrat activado.");
    }
}

function closeFlowEditor() {
    if(confirm("¿Estás seguro de cerrar? Asegúrate de haber guardado tu flujo.")) {
        document.getElementById('flow-editor-overlay').style.display = 'none';
    }
}

// ESCUCHAR DATOS DEL EDITOR (Iframe)
window.addEventListener('message', function(event) {
    if (event.data.type === 'SAVE_FLOW') {
        let flowJson = event.data.data;
        
        const iframe = document.querySelector('iframe'); 
        if(iframe && iframe.contentDocument) {
            const nodes = flowJson.drawflow.Home.data;
            for (const id in nodes) {
                const nodeEl = iframe.contentDocument.getElementById('node-' + id);
                if (nodeEl) {
                    const val = nodeEl.querySelector('input, textarea')?.value;
                    if (val) {
                        if (nodes[id].name === 'trigger') {
                            nodes[id].data = { val: val };
                        } else {
                            nodes[id].data = { info: val };
                        }
                    }
                }
            }
        }

        console.log("Datos procesados en CRM:", flowJson);

        fetch('/api/save-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flowJson)
        })
        .then(res => res.json())
        .then(res => {
            if(res.success) {
                alert("✅ ¡Flujo guardado correctamente! El bot ya puede responder.");
            }
        })
        .catch(err => console.error("Error al guardar:", err));
    }
});

// Función para cargar flujos (funcional para Railway/MongoDB)
async function loadFlowsList() {
    try {
        const response = await fetch('/api/get-flow');
        const data = await response.json();
        if (data) {
            const iframe = document.getElementById('flow-iframe');
            if(iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'LOAD_FLOW', data: data }, '*');
                alert("📂 Flujo cargado. Precio base: S/380");
            }
        } else {
            alert("No hay flujos guardados aún.");
        }
    } catch (error) {
        console.error(error);
    }
}

/* ================================================= */
/* ACTIVACIÓN DE FLUJOS DESDE EL CHAT (DINÁMICO)     */
/* ================================================= */

// Abre/Cierra el menú y carga los triggers del flujo actual
window.toggleFlowMenu = async function() {
    const menu = document.getElementById('flow-menu');
    if(!menu) return;

    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        menu.innerHTML = '<div class="flow-item">⌛ Cargando...</div>';

        try {
            const response = await fetch('/api/get-flow');
            const data = await response.json();
            
            menu.innerHTML = ""; 

            if (data && data.drawflow && data.drawflow.Home.data) {
                const nodes = data.drawflow.Home.data;
                let found = false;

                for (const id in nodes) {
                    if (nodes[id].name === 'trigger') {
                        const triggerVal = nodes[id].data.val;
                        if (triggerVal) {
                            found = true;
                            const item = document.createElement('div');
                            item.className = 'flow-item';
                            item.innerHTML = `🤖 <b>${triggerVal}</b>`;
                            item.onclick = () => lanzarFlujo(triggerVal);
                            menu.appendChild(item);
                        }
                    }
                }
                if(!found) menu.innerHTML = '<div class="flow-item">Sin Triggers</div>';
            } else {
                menu.innerHTML = '<div class="flow-item">Crea un flujo primero</div>';
            }
        } catch (error) {
            menu.innerHTML = '<div class="flow-item">Error de conexión</div>';
        }
    } else {
        menu.style.display = 'none';
    }
};

window.lanzarFlujo = function(trigger) {
    const input = document.getElementById('message-input');
    if(input) {
        input.value = trigger;
        sendMessage(); 
        document.getElementById('flow-menu').style.display = 'none';
        alert("✅ Lanzando flujo: " + trigger);
    }
};

// Función antigua por si acaso
window.openFlowPicker = function() {
    const trigger = prompt("Escribe la palabra clave (Trigger) del flujo que deseas activar:");
    if (trigger) {
        document.getElementById('message-input').value = trigger;
        sendMessage();
        alert("✅ Iniciando flujo: " + trigger);
    }
};