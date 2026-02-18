const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer"); 
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require("dotenv").config();

// Modelo de Mensaje
const Message = require("./models/Message");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: "uploads/" }); 

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos
app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));
app.use("/chat", express.static(path.join(__dirname, "chat")));

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.error("❌ Error MongoDB:", err));

const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });
const wsClients = new Set();

wss.on("connection", ws => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

function broadcastMessage(data) {
  wsClients.forEach(ws => { 
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); 
  });
}

// --- RUTAS DE LA API ---

// PROXY MEDIA: Para visualizar imágenes de WhatsApp que han expirado
app.get("/proxy-media", async (req, res) => {
  const mediaUrl = req.query.url;
  if (!mediaUrl || mediaUrl === "null") return res.status(400).send("No URL");
  try {
    const response = await axios.get(mediaUrl, {
      headers: { 
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'User-Agent': 'Mozilla/5.0' 
      },
      responseType: 'arraybuffer'
    });
    res.set('Content-Type', response.headers['content-type']);
    res.send(response.data);
  } catch (e) { 
    res.status(500).send("Error al obtener imagen del servidor de Meta"); 
  }
});

// LISTAR CHATS: Obtiene la última interacción de cada contacto
app.get("/chat/list", async (req, res) => {
  try {
    const list = await Message.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { 
          _id: "$chatId", 
          text: { $first: "$text" }, 
          pushname: { $first: "$pushname" },
          timestamp: { $first: "$timestamp" }
      }},
      { $sort: { timestamp: -1 } }
    ]);
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// OBTENER MENSAJES: Carga el historial de un chat específico
app.get("/chat/messages/:chatId", async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ELIMINAR CHAT: Borra permanentemente los mensajes de la DB
app.delete("/chat/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    await Message.deleteMany({ chatId });
    res.json({ status: "ok", message: "Chat eliminado" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// WEBHOOK: Recibe mensajes de WhatsApp (Meta)
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const senderId = msg.from;
            const pushName = value.contacts?.[0]?.profile?.name || senderId;
            let mediaUrl = null;

            if (msg.type === "image") {
              try {
                const metaRes = await axios.get(`https://graph.facebook.com/v18.0/${msg.image.id}`, {
                  headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` }
                });
                mediaUrl = metaRes.data.url;
              } catch (e) { console.error("Error obteniendo URL de imagen"); }
            }

            const messageData = { 
              chatId: senderId, from: senderId, 
              text: msg.text?.body || (msg.type === "image" ? "📷 Imagen" : ""), 
              messageType: msg.type, source: "whatsapp", pushname: pushName, mediaUrl,
              timestamp: new Date()
            };

            await Message.create(messageData);
            broadcastMessage({ type: "incoming", data: messageData });
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// ENVIAR TEXTO
app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, 
      { messaging_product: "whatsapp", to, text: { body: text } },
      { headers: { "Authorization": `Bearer ${process.env.ACCESS_TOKEN}` } }
    );
    const messageData = { chatId: to, from: "me", text, source: "whatsapp", pushname: "Yo", timestamp: new Date() };
    await Message.create(messageData);
    broadcastMessage({ type: "sent", data: messageData });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ENVIAR MEDIA (Imágenes)
app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to } = req.body;
    const file = req.file;
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), { filename: file.originalname, contentType: file.mimetype });
    form.append('type', file.mimetype);
    form.append('messaging_product', 'whatsapp');

    // Subir a Meta
    const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form,
      { headers: { ...form.getHeaders(), 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } }
    );

    // Enviar mensaje con el ID de la media
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id } },
      { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } }
    );

    const mediaUrl = `/uploads/${file.filename}`;
    const messageData = { chatId: to, from: "me", text: "📷 Imagen", mediaUrl, source: "whatsapp", pushname: "Yo", timestamp: new Date() };
    await Message.create(messageData);
    broadcastMessage({ type: "sent", data: messageData });
    res.json({ status: "ok" });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: "Error enviando media" }); 
  }
});

// Puerto y arranque
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 CRM Webs Rápidas Corriendo en puerto ${PORT}`);
});