const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =========================
   CONFIGURACIÓN INICIAL
========================= */
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));

const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => {
  res.redirect("/chat/index.html");
});

/* =========================
   MODELOS DE BASE DE DATOS
========================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.log("❌ Error Mongo:", err));

const Message = mongoose.model("Message", new mongoose.Schema({
  chatId: String,
  from: String,
  text: String,
  media: String,
  timestamp: { type: Date, default: Date.now }
}));

const Session = mongoose.model("Session", new mongoose.Schema({
  chatId: String,
  lastNodeId: String,
  updatedAt: { type: Date, default: Date.now, expires: 3600 }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
  name: { type: String, default: "Main Flow" },
  data: Object,
  updatedAt: { type: Date, default: Date.now }
}));

/* =========================
   WEBSOCKET (PANEL DE CONTROL)
========================= */
let clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

/* =========================
   WEBHOOK WHATSAPP (BOT)
========================= */
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (msg) {
      const sender = msg.from;
      let incomingText = "";
      let selectionId = "";

      // 1. CAPTURA DE ENTRADA (Texto o Selección de Lista)
      if (msg.type === "text") {
        incomingText = msg.text.body.toLowerCase().trim();
      } else if (msg.type === "interactive") {
        selectionId = msg.interactive.list_reply?.id; // row_1, row_2...
        incomingText = msg.interactive.list_reply?.title.toLowerCase().trim();
      }

      // Guardar mensaje recibido en DB
      const saved = await Message.create({
        chatId: sender,
        from: sender,
        text: incomingText || (msg.type === "image" ? "📷 Imagen" : "Interacción")
      });
      broadcast({ type: "new_message", message: saved });

      try {
        const flow = await Flow.findOne({ name: "Main Flow" });
        if (flow && flow.data && flow.data.drawflow) {
          const nodes = flow.data.drawflow.Home.data;
          let nextNode = null;

          // A. BUSCAR TRIGGER (Inicio)
          const triggerNode = Object.values(nodes).find(n => 
            n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText
          );

          if (triggerNode) {
            const nextId = triggerNode.outputs.output_1.connections[0]?.node;
            nextNode = nodes[nextId];
          } else {
            // B. BUSCAR POR SESIÓN (Continuación de Menú)
            const session = await Session.findOne({ chatId: sender });
            if (session && nodes[session.lastNodeId]) {
              const currentNode = nodes[session.lastNodeId];
              let optIdx = selectionId ? selectionId.split('_')[1] : parseInt(incomingText);
              const nextId = currentNode.outputs[`output_${optIdx}`]?.connections[0]?.node;
              nextNode = nodes[nextId];
            }
          }

          // C. ENVIAR RESPUESTA SEGÚN EL NODO
          if (nextNode) {
            let payload = { messaging_product: "whatsapp", to: sender };

            if (nextNode.name === 'menu') {
              const rawData = nextNode.data;
              const title = rawData.info || "Selecciona una opción:";
              
              // Extraer opciones dinámicamente de cualquier campo que no sea 'info'
              const options = Object.keys(rawData)
                .filter(k => k !== 'info' && rawData[k] && rawData[k].trim() !== "")
                .map(k => rawData[k]);

              if (options.length > 0) {
                payload.type = "interactive";
                payload.interactive = {
                  type: "list",
                  header: { type: "text", text: "Menú Principal" },
                  body: { text: title },
                  footer: { text: "Webs Rápidas 🚀" },
                  action: {
                    button: "Ver opciones",
                    sections: [{
                      title: "Opciones disponibles",
                      rows: options.map((opt, i) => ({ id: `row_${i+1}`, title: opt.substring(0, 24) }))
                    }]
                  }
                };
                await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
              } else {
                payload.type = "text";
                payload.text = { body: title };
              }
            } 
            else if (nextNode.name === 'message') {
              payload.type = "text";
              payload.text = { body: nextNode.data.info || "..." };
              await Session.deleteOne({ chatId: sender });
            }
            else if (nextNode.name === 'ia') {
              payload.type = "text";
              payload.text = { body: "¡Hola! Soy tu asistente inteligente 🤖. Nuestros planes inician en S/380." };
              await Session.deleteOne({ chatId: sender });
            }

            // Envío a WhatsApp
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
              headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
            });

            // Guardar respuesta del bot
            const botText = payload.interactive ? payload.interactive.body.text : payload.text.body;
            const botSaved = await Message.create({ chatId: sender, from: "me", text: botText });
            broadcast({ type: "new_message", message: botSaved });
          }
        }
      } catch (err) {
        console.error("❌ Error en flujo:", err.response?.data || err.message);
      }

      // LÓGICA DE RECIBIR IMAGEN
      if (msg.type === "image") {
        try {
          const mediaId = msg.image.id;
          const mediaInfo = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
          });
          const mediaFile = await axios.get(mediaInfo.data.url, {
            responseType: "arraybuffer",
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
          });
          const fileName = `${Date.now()}.jpg`;
          const filePath = path.join(uploadsPath, fileName);
          fs.writeFileSync(filePath, mediaFile.data);

          const savedMedia = await Message.create({ chatId: sender, from: sender, media: "/uploads/" + fileName });
          broadcast({ type: "new_message", message: savedMedia });
        } catch (e) { console.log("Error descarga imagen:", e.message); }
      }
    }
  }
  res.sendStatus(200);
});

/* =========================
   APIS REST (FRONTEND)
========================= */
app.get("/chats", async (req, res) => {
  const chats = await Message.aggregate([
    { $sort: { timestamp: 1 } },
    { $group: { _id: "$chatId", lastMessage: { $last: { $ifNull: ["$text", "📷 Imagen"] } }, lastTime: { $last: "$timestamp" } } },
    { $sort: { lastTime: -1 } }
  ]);
  res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
  const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
  res.json(messages);
});

app.post("/api/save-flow", async (req, res) => {
  try {
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body, updatedAt: Date.now() }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error al guardar" }); }
});

app.get("/api/get-flow", async (req, res) => {
  const flow = await Flow.findOne({ name: "Main Flow" });
  res.json(flow ? flow.data : null);
});

app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to, text: { body: text }
    }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
    const saved = await Message.create({ chatId: to, from: "me", text });
    broadcast({ type: "new_message", message: saved });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to } = req.body;
    const file = req.file;
    const form = new FormData();
    form.append("file", fs.createReadStream(file.path));
    form.append("messaging_product", "whatsapp");

    const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
    });

    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
    }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

    const saved = await Message.create({ chatId: to, from: "me", media: "/uploads/" + file.filename });
    broadcast({ type: "new_message", message: saved });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor corriendo en el puerto", PORT);
});