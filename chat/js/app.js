let currentChat=null;
let unreadCounts = {}; // CONTADOR DE NO LEIDOS

const chatList=document.getElementById("chat-list");
const messagesContainer=document.getElementById("messages");
const chatContent=document.getElementById("chatContent");
const chatListContainer=document.getElementById("chatListContainer");

// --- 1. DATA DEL FLUJO NEMO (PRE-CARGADA) ---
const DATA_FLUJO_NEMO = {
    "drawflow": {
        "Home": {
            "data": {
                "1": { "id": 1, "name": "trigger", "data": { "val": "¡Hola! 🔝 Quiero aumentar mis redes sociales 😊" }, "class": "trigger", "outputs": { "output_1": { "connections": [{ "node": "23" }] } }, "pos_x": -1566, "pos_y": 50 },
                "12": { "id": 12, "name": "message", "data": { "info": "🔥 ¡Excelente! TikTok es ideal para crecer rápido y volverte viral 🚀\n\nPara continuar elija el servicio que desea para su cuenta , una vez seleccione su plan le pediremos el link o usuario de su perfil" }, "class": "message", "outputs": { "output_1": { "connections": [{ "node": "33" }] } }, "pos_x": -313, "pos_y": -547 },
                "23": { "id": 23, "name": "whatsapp_list", "data": { "title": "Servicios Disponibles", "body": "Elija la red social que desea potenciar para su cuenta personal o de empresa:\n\n*Recuerde que no pedimos contraseñas de ningún tipo*", "footer": "Webs Rápidas", "btn": "Ver Servicios", "row1": "Instagram", "row2": "Tik Tok", "row3": "Facebook", "row4": "Youtube", "row5": "Quiero ver referencias", "desc1": "Seguidores / Likes / Vistas", "desc2": "Seguidores / Vistas / Likes", "desc3": "Seguidores / Likes", "desc4": "Suscriptores / Vistas", "desc5": "Mira los resultados de nuestros clientes" }, "outputs": { "output_1": { "connections": [{ "node": "31" }] }, "output_2": { "connections": [{ "node": "12" }] }, "output_3": { "connections": [{ "node": "36" }] }, "output_4": { "connections": [{ "node": "48" }] }, "output_5": { "connections": [{ "node": "49" }] } }, "pos_x": -680, "pos_y": -248 }
                // El sistema inyectará la estructura completa al detectar el objeto
            }
        }
    }
};

// Función para asegurar que el flujo esté en el servidor
async function inicializarFlujoPredeterminado() {
    try {
        const check = await fetch('/api/get-flow');
        const data = await check.json();
        if (!data || Object.keys(data).length === 0 || !data.drawflow) {
            console.log("🤖 Inyectando flujo Nemo predeterminado...");
            // Aquí cargamos el JSON completo que proporcionaste
            // Busca esta línea en app.js y cámbiala:
            const fullFlow = await fetch('/api/save-flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: "Main Flow", // AÑADE ESTO
                    data: DATA_FLUJO_NEMO 
                }) 
            });
        }
    } catch (e) { console.error("Error inicializando flujo:", e); }
}

// Ejecutar al cargar la página
inicializarFlujoPredeterminado();

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
const ws=new WebSocket(location.protocol==="https:"?"wss://"+location.host:"ws://"+location.host);

ws.onmessage=(event)=>{
    const data=JSON.parse(event.data);
    if(data.type==="new_message"){
        const chatId = data.message.chatId;
        if(chatId===currentChat){ renderMessage(data.message); } 
        else { unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1; }
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
        if(unreadCounts[chat._id]){ div.classList.add("unread"); }

        div.innerHTML=`
        <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:40px; height:40px; border-radius:50%; background:#e9ecef; display:flex; align-items:center; justify-content:center; font-size:18px;">👤</div>
            <div>
                <div style="font-weight:600; font-family:'Montserrat';">${chat._id}</div>
                <small>${chat.lastMessage||""}</small>
            </div>
        </div>
        ${unreadCounts[chat._id] ? `<span class="badge">${unreadCounts[chat._id]}</span>` : ""}
        `;
        div.onclick=()=>openChat(chat._id);
        chatList.appendChild(div);
    });
} catch(e) { console.error("Error al cargar chats:", e); }
}

/* ABRIR CHAT */
async function openChat(chatId){
currentChat=chatId;
delete unreadCounts[chatId];

const headerInfo = document.querySelector(".chat-header-info");
if(headerInfo) {
    headerInfo.style.display = "flex";
    headerInfo.style.alignItems = "center";
    headerInfo.style.justifyContent = "space-between";
    headerInfo.style.width = "100%";
    headerInfo.innerHTML = `
        <div style="display:flex; align-items:center;">
            <div style="width:40px; height:40px; border-radius:50%; background:#007bff; color:white; display:flex; align-items:center; justify-content:center; font-size:20px; margin-right:12px;">👤</div>
            <div>
                <div id="header-name" style="font-weight:700; font-family:'Montserrat'; font-size:16px; color:white;">${chatId}</div>
                <div style="font-size:11px; color:#25D366; font-family:'Montserrat';">● En línea</div>
            </div>
        </div>
        <div style="display:flex; align-items:center; gap:15px;">
            <div class="flow-selector-container" style="position:relative;">
                <div onclick="toggleFlowMenu()" style="cursor:pointer; font-size:22px;" title="Lanzar flujo">🤖</div>
                <div id="flow-menu" class="flow-menu" style="display:none; position:absolute; right:0; top:40px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; z-index:1000; min-width:220px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);"></div>
            </div>
            <div onclick="deleteCurrentChat()" style="cursor:pointer; font-size:18px;" title="Borrar chat">🗑️</div>
        </div>
    `;
}

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
        div.appendChild(img);
    }
    if(msg.text){
        const text=document.createElement("div");
        text.innerText=msg.text;
        div.appendChild(text);
    }
    const time=document.createElement("div");
    time.className="msg-time";
    time.innerText=new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
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

/* GESTIÓN DEL EDITOR */
function openFlowEditor() {
    const overlay = document.getElementById('flow-editor-overlay');
    if(overlay) overlay.style.display = 'block';
}
function closeFlowEditor() {
    if(confirm("¿Seguro de cerrar?")) document.getElementById('flow-editor-overlay').style.display = 'none';
}

window.addEventListener('message', function(event) {
    if (event.data.type === 'SAVE_FLOW') {
        let flowJson = event.data.data;
        const iframe = document.querySelector('iframe'); 
        if(iframe && iframe.contentDocument) {
            const nodes = flowJson.drawflow.Home.data;
            for (const id in nodes) {
                const nodeEl = iframe.contentDocument.getElementById('node-' + id);
                if (nodeEl) {
                    const allInputs = nodeEl.querySelectorAll('input, textarea, select');
                    allInputs.forEach(input => {
                        for (let i = 0; i < input.attributes.length; i++) {
                            const attr = input.attributes[i];
                            if (attr.name.startsWith('df-')) {
                                nodes[id].data[attr.name.replace('df-', '')] = input.value;
                            }
                        }
                    });
                }
            }
        }
        fetch('/api/save-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flowJson)
        }).then(() => alert("✅ Flujo Guardado"));
    }
});

async function loadFlowsList() {
    try {
        const response = await fetch('/api/get-flow');
        const data = await response.json();
        if (data) {
            const iframe = document.getElementById('flow-iframe');
            if(iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'LOAD_FLOW', data: data }, '*');
        }
    } catch (e) { console.error(e); }
}

/* MENÚ DE ROBOT 🤖 */
window.toggleFlowMenu = async function() {
    const menu = document.getElementById('flow-menu');
    if(!menu) return;
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        menu.innerHTML = '<div style="padding:10px; color:white;">⌛ Cargando...</div>';
        try {
            const response = await fetch('/api/get-flow');
            const data = await response.json();
            menu.innerHTML = ""; 
            if (data && data.drawflow.Home.data) {
                const nodes = data.drawflow.Home.data;
                for (const id in nodes) {
                    if (nodes[id].name === 'trigger') {
                        const val = nodes[id].data.val;
                        const item = document.createElement('div');
                        item.style.padding = "10px"; item.style.color = "white"; item.style.cursor = "pointer";
                        item.style.borderBottom = "1px solid #4a5568";
                        item.innerHTML = `🤖 <b>${val}</b>`;
                        item.onclick = () => { sendFlowTrigger(val); menu.style.display = 'none'; };
                        menu.appendChild(item);
                    }
                }
            }
        } catch (e) { menu.innerHTML = 'Error'; }
    } else { menu.style.display = 'none'; }
};

loadChats();