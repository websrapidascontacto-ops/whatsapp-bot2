const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer"); 
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require("dotenv").config();

const Message = require("./models/Message");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: "uploads/" }); 

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

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
            let mediaUrl = null;
            if (msg.type === "image") {
              try {
                const metaRes = await axios.get(`https://graph.facebook.com/v18.0/${msg.image.id}`, {
                  headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` }
                });
                mediaUrl = `/proxy-media?url=${encodeURIComponent(metaRes.data.url)}`;
              } catch (e) {}
            }
            const messageData = { from: senderId, text: msg.text?.body || "", messageType: msg.type, source: "whatsapp", pushname: pushName, mediaUrl };
            await Message.create({ chatId: senderId, ...messageData });
            broadcastMessage({ type: "incoming", data: messageData });
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

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

app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to } = req.body;
    const file = req.file;
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), { filename: file.originalname, contentType: file.mimetype });
    form.append('type', file.mimetype);
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
      headers: { ...form.getHeaders(), 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` }
    });

    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
    }, { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } });

    const mediaUrl = `/uploads/${file.filename}`;
    broadcastMessage({ type: "sent", data: { to, text: "", mediaUrl, source: "whatsapp" } });
    await Message.create({ chatId: to, from: "me", text: "📷 Imagen", mediaUrl, source: "whatsapp" });
    
    res.json({ status: "ok" });
  } catch (err) { 
    res.status(500).json({ error: "Error enviando media" }); 
  }
});

app.get("/chat/list", async (req, res) => {
  const list = await Message.aggregate([
    { $sort: { timestamp: -1 } },
    { $group: { _id: "$chatId", text: { $first: "$text" }, pushname: { $first: "$pushname" }, timestamp: { $first: "$timestamp" } } },
    { $sort: { timestamp: -1 } }
  ]);
  res.json(list);
});

app.get("/chat/messages/:chatId", async (req, res) => {
  const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
  res.json(messages);
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log(`🚀 CRM Activo`));