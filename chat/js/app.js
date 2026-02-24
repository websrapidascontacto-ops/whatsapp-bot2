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

/* EMOJI PICKER */
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
    if (pickerContainer && pickerContainer.style.display === "block") {
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
    if(!chatList) return;
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

/* ABRIR CHAT - CORREGIDO PARA QUE NO DE ERROR SI FALTA EL HEADER */
async function openChat(chatId){
    currentChat=chatId;
    delete unreadCounts[chatId];

    // PROTECCIÓN LÍNEA 107: Verifica si existe antes de asignar
    const headerName = document.getElementById("header-name");
    if(headerName) {
        headerName.innerText = chatId;
    }

    if(messagesContainer) messagesContainer.innerHTML="";

    if(window.innerWidth<=768){
        if(chatListContainer) chatListContainer.style.display="none";
        if(chatContent) chatContent.classList.add("active-mobile");
    }

    const res=await fetch("/messages/"+chatId);
    const msgs=await res.json();
    msgs.forEach(renderMessage);

    loadChats();
}

function goBackMobile(){
    if(chatContent) chatContent.classList.remove("active-mobile");
    if(chatListContainer) chatListContainer.style.display="flex";
}

function renderMessage(msg){
    if(!messagesContainer) return;
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
    if(!input) return;
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

const fileInputElement = document.getElementById("file-input");
if(fileInputElement) {
    fileInputElement.addEventListener("change",(e)=>{
        if(!currentChat){alert("Selecciona un chat primero");return;}
        selectedFiles=[...e.target.files];
        if(selectedFiles.length===0)return;
        const container=document.getElementById("preview-container");
        if(container){
            container.innerHTML="";
            selectedFiles.forEach(file=>{
                const img=document.createElement("img");
                img.src=URL.createObjectURL(file);
                container.appendChild(img);
            });
        }
        const imgModal = document.getElementById("image-modal");
        if(imgModal) imgModal.style.display="flex";
    });
}

function closeModal(){
    const imgModal = document.getElementById("image-modal");
    if(imgModal) imgModal.style.display="none";
    const imgComment = document.getElementById("image-comment");
    if(imgComment) imgComment.value="";
    selectedFiles=[];
    const fInput = document.getElementById("file-input");
    if(fInput) fInput.value="";
}

async function confirmSendImages() {
    if (!currentChat || selectedFiles.length === 0) return;
    const commentElem = document.getElementById("image-comment");
    const comment = commentElem ? commentElem.value : "";

    for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        try {
            const uploadRes = await fetch("/api/upload-node-media", { 
                method: "POST", 
                body: formData 
            });
            const uploadData = await uploadRes.json();
            if (uploadData.url) {
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

/* GESTIÓN DE BÚSQUEDA */
async function searchMessages() {
    const sInput = document.getElementById("global-search");
    if(!sInput) return;
    const query = sInput.value.toLowerCase();
    const overlay = document.getElementById("search-results-overlay");
    const list = document.getElementById("search-results-list");
    if (query.length < 2) { if(overlay) overlay.style.display = "none"; return; }
    const res = await fetch("/search?q=" + query);
    const results = await res.json();
    if(list) {
        list.innerHTML = "";
        if(overlay) overlay.style.display = "flex";
        results.forEach(res => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerHTML = `<div style="font-size:11px; color:var(--blue); font-weight:700">${res.chatId}</div>
                             <div style="font-size:13px">${res.text}</div>`;
            div.onclick = () => { openChat(res.chatId); closeSearch(); };
            list.appendChild(div);
        });
    }
}

function closeSearch() { 
    const overlay = document.getElementById("search-results-overlay");
    if(overlay) overlay.style.display = "none"; 
}

async function deleteCurrentChat() {
    if (!currentChat) return;
    if (confirm("🗑️ ¿Borrar conversación?")) {
        const res = await fetch(`/chats/${currentChat}`, { method: "DELETE" });
        if (res.ok) { 
            currentChat = null; 
            if(messagesContainer) messagesContainer.innerHTML = ""; 
            loadChats(); 
        }
    }
}

/* GESTIÓN DEL EDITOR DE FLUJOS (Webs Rápidas S/380) */
function openFlowEditor() {
    const overlay = document.getElementById('flow-editor-overlay');
    if(overlay) {
        overlay.style.display = 'block';
        console.log("Editor abierto. Montserrat OK.");
    }
}

function closeFlowEditor() {
    if(confirm("¿Estás seguro de cerrar? Asegúrate de haber guardado.")) {
        const overlay = document.getElementById('flow-editor-overlay');
        if(overlay) overlay.style.display = 'none';
    }
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
        fetch('/api/save-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flowJson)
        })
        .then(res => res.json())
        .then(res => {
            if(res.success) alert("✅ ¡Flujo guardado correctamente!");
        })
        .catch(err => console.error("Error al guardar:", err));
    }
});

async function loadFlowsList() {
    try {
        console.log("Cargando flujos desde Railway...");
        const response = await fetch('/api/get-flows'); // Cambiado a plural para coincidir con el servidor
        const flows = await response.json();
        
        if (flows && flows.length > 0) {
            // Tomamos el último flujo guardado
            const lastFlow = flows[flows.length - 1];
            const flowData = lastFlow.data || lastFlow;

            const iframe = document.getElementById('flow-iframe');
            if(iframe && iframe.contentWindow) {
                // Enviamos el mensaje al Editor
                iframe.contentWindow.postMessage({ 
                    type: 'IMPORT_CLEAN', 
                    data: flowData 
                }, '*');
                
                alert("📂 Flujo cargado con éxito. Precio: S/380");
            } else {
                alert("❌ Error: No se encontró el lienzo del editor.");
            }
        } else {
            alert("⚠️ No tienes flujos guardados en la base de datos.");
        }
    } catch (error) {
        console.error("Error al cargar flujos:", error);
        alert("❌ Error de conexión con el servidor.");
    }
}

loadChats();