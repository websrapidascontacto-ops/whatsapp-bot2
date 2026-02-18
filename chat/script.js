const ws = new WebSocket(`wss://${window.location.host}`);

ws.onmessage = msg => {
  const data = JSON.parse(msg.data);
  const messages = document.getElementById("messages");
  messages.innerHTML += `<div><b>${data.user}:</b> ${data.text}</div>`;
};

document.getElementById("send-btn").onclick = async ()=>{
  const input = document.getElementById("message-input");
  const text = input.value;
  if(!text) return;

  // Enviar mensaje a backend para Meta API
  const res = await fetch("/send-message",{
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      phone_number_id: PHONE_NUMBER_ID,
      to: TEST_PHONE_NUMBER || "NUMERO_DESTINO",
      message: text,
      access_token: ACCESS_TOKEN
    })
  });
  const data = await res.json();
  console.log("Respuesta API:", data);

  // Mostrar en el chat local
  ws.send(JSON.stringify({user:"Yo", text}));
  input.value = "";
};
