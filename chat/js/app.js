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

/* CERRAR EMOJI AL DAR CLICK AFUERA */
document.addEventListener("click", (e) => {
    const pickerContainer = document.getElementById("emoji-picker-container");
    const emojiTrigger = document.getElementById("emoji-trigger");
    if (pickerContainer.style.display === "block") {
        if (!pickerContainer.contains(e.target) && e.target !== emojiTrigger) {
            pickerContainer.style.display = "none";
        }
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
}

/* ABRIR CHAT */
async function openChat(chatId){
currentChat=chatId;

// Limpiar no leídos
delete unreadCounts[chatId];

document.getElementById("header-name").innerText=chatId;
messagesContainer.innerHTML="";

if(window.innerWidth<=768){
chatListContainer.style.display="none";
chatContent.classList.add("active-mobile");
}

const res=await fetch("/messages/"+chatId);
const msgs=await res.json();
msgs.forEach(renderMessage);

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

messagesContainer.appendChild(div);
messagesContainer.scrollTop=messagesContainer.scrollHeight;
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

    // Procesamos cada archivo seleccionado
    for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        try {
            console.log("⏳ Subiendo archivo...");
            // 1. Subimos el archivo a tu carpeta /uploads
            const uploadRes = await fetch("/api/upload-node-media", { 
                method: "POST", 
                body: formData 
            });
            const uploadData = await uploadRes.json();

            if (uploadData.url) {
                console.log("🚀 Enviando imagen a WhatsApp...");
                // 2. Enviamos a la ruta /send-message que SÍ existe en tu server.js
                await fetch("/send-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        to: currentChat,
                        mediaUrl: uploadData.url, // El server completará la URL con el dominio
                        text: comment // El comentario del modal se envía como texto/caption
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
    overlay.style.display = 'block';
    console.log("Abriendo editor de flujos para Webs Rápidas... 🚀");
}

function closeFlowEditor() {
    if(confirm("¿Estás seguro de cerrar? Asegúrate de haber guardado tu flujo.")) {
        document.getElementById('flow-editor-overlay').style.display = 'none';
    }
}

// Función para el botón de "Cargar Flujos"
function loadFlowsList() {
    alert("Cargando lista de flujos guardados... Base: S/380");
    // Aquí podrías abrir un pequeño modal con la lista de archivos JSON guardados
}
/* ================================================= */
/* INTEGRACIÓN CON EDITOR DE FLUJOS (Webs Rápidas)  */
/* ================================================= */

function openFlowEditor() {
    const overlay = document.getElementById('flow-editor-overlay');
    if(overlay) {
        overlay.style.display = 'block';
        console.log("Editor de flujos abierto. Montserrat activado.");
    }
}

function closeFlowEditor() {
    document.getElementById('flow-editor-overlay').style.display = 'none';
}

function loadFlowsList() {
    alert("Cargando flujos guardados... Base S/380. WhatsApp: 991138132");
}

// ESCUCHAR DATOS DEL EDITOR (Iframe)
window.addEventListener('message', function(event) {
    if (event.data.type === 'SAVE_FLOW') {
        let flowJson = event.data.data;
        
        // 1. Extraer los datos de los inputs del iframe manualmente para asegurar que NO viajen vacíos
        const iframe = document.querySelector('iframe'); // Asegúrate de que este sea tu iframe del editor
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

        // 2. Enviar a Railway (MongoDB)
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

// Función para cargar flujos (ahora funcional)
async function loadFlowsList() {
    try {
        const response = await fetch('/api/get-flow');
        const data = await response.json();
        if (data) {
            // Enviamos el flujo cargado al iframe del editor
            const iframe = document.getElementById('flow-iframe');
            iframe.contentWindow.postMessage({ type: 'LOAD_FLOW', data: data }, '*');
            alert("📂 Flujo cargado. Precio base: S/380");
        } else {
            alert("No hay flujos guardados aún.");
        }
    } catch (error) {
        console.error(error);
    }
}