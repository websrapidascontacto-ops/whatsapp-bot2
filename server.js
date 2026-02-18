const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer"); 
const axios = require("axios"); // Para el proxy de imágenes
require("dotenv").config();

const Message = require("./models/Message");

const app = express();
const upload = multer({ dest: "uploads/" }); 

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// RUTAS ORIGINALES
app.use(express.static("public"));
app.use("/chat", express.static(path.join(__dirname, "chat")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB conectado"));

const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });
const wsClients = new Set();

wss.on("connection", ws => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

function broadcastMessage(data) {
  wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); });
}

// PROXY PARA EVITAR ERROR 401 EN IMÁGENES
app.get("/proxy-media", async (req, res) => {
  const mediaUrl = req.query.url;
  if (!mediaUrl) return res.status(400).send("No URL");
  try {
    const response = await axios.get(mediaUrl, {
      headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` },
      responseType: 'arraybuffer'
    });
    res.set('Content-Type', response.headers['content-type']);
    res.send(response.data);
  } catch (e) { res.status(500).send("Error de proxy"); }
});

// WEBHOOK (CAPTURA IMÁGENES Y NOTIFICACIONES)
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const senderId = msg.from;
            const pushName = value.contacts?.[0]?.profile?.name || "Cliente";
            let profilePic = ""; let mediaUrl = null;

            // Foto de Perfil del Cliente
            try {
              const pfpRes = await axios.get(`https://graph.facebook.com/v18.0/${senderId}?fields=profile_pic&access_token=${process.env.ACCESS_TOKEN}`);
              profilePic = pfpRes.data.profile_pic;
            } catch (e) {}

            // Procesar Imagen Recibida
            if (msg.type === "image") {
              try {
                const metaRes = await axios.get(`https://graph.facebook.com/v18.0/${msg.image.id}`, {
                  headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` }
                });
                // Pasamos la URL de Meta por nuestro Proxy
                mediaUrl = `/proxy-media?url=${encodeURIComponent(metaRes.data.url)}`;
              } catch (e) {}
            }

            const messageData = { 
              from: senderId, 
              text: msg.text?.body || "", 
              messageType: msg.type, 
              source: "whatsapp", 
              pushname: pushName, 
              profilePic, 
              mediaUrl 
            };

            await Message.create({ chatId: senderId, ...messageData });
            broadcastMessage({ type: "incoming", data: messageData });
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// ENVIAR MENSAJE
app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, 
      { messaging_product: "whatsapp", to, text: { body: text } },
      { headers: { "Authorization": `Bearer ${process.env.ACCESS_TOKEN}` } }
    );
    broadcastMessage({ type: "sent", data: { to, text, source: "whatsapp" } });
    await Message.create({ chatId: to, from: "me", text, source: "whatsapp" });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ENVIAR ARCHIVO DESDE CRM
app.post("/send-media", upload.single("file"), async (req, res) => {
  const { to } = req.body; if (!req.file) return res.status(400).send("No file");
  const mediaUrl = `/uploads/${req.file.filename}`;
  broadcastMessage({ type: "sent", data: { to, text: "", mediaUrl, source: "whatsapp" } });
  await Message.create({ chatId: to, from: "me", text: "", mediaUrl, source: "whatsapp" });
  res.json({ status: "ok" });
});

app.get("/chat/messages/:chatId", async (req, res) => {
  const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
  res.json(messages);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 CRM en puerto ${PORT}`));
