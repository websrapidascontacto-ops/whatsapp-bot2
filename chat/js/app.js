let currentChat=null;
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

document.getElementById("emoji-trigger").onclick=()=>{
const c=document.getElementById("emoji-picker-container");
c.style.display=c.style.display==="none"?"block":"none";
};

/* WEBSOCKET */
const ws=new WebSocket(
location.protocol==="https:"?"wss://"+location.host:"ws://"+location.host
);

ws.onmessage=(event)=>{
const data=JSON.parse(event.data);
if(data.type==="new_message"){
if(data.message.chatId===currentChat){
renderMessage(data.message);
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
div.innerHTML=`<div>${chat._id}</div><small>${chat.lastMessage||""}</small>`;
div.onclick=()=>openChat(chat._id);
chatList.appendChild(div);
});
}

/* ABRIR CHAT */
async function openChat(chatId){
currentChat=chatId;
document.getElementById("header-name").innerText=chatId;
messagesContainer.innerHTML="";
if(window.innerWidth<=768){
chatListContainer.style.display="none";
chatContent.classList.add("active-mobile");
}
const res=await fetch("/messages/"+chatId);
const msgs=await res.json();
msgs.forEach(renderMessage);
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

async function confirmSendImages(){
if(!currentChat)return;

for(const file of selectedFiles){
const formData=new FormData();
formData.append("file",file);
formData.append("to",currentChat);
await fetch("/send-media",{method:"POST",body:formData});
}

const comment=document.getElementById("image-comment").value;
if(comment.trim()!==""){
await fetch("/send-message",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({to:currentChat,text:comment})
});
}

closeModal();
}

loadChats();