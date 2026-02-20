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
   CONFIG
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
   MONGODB
========================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ Mongo conectado"))
.catch(err => {
  console.log("❌ Mongo error:", err);
  process.exit(1);
});

const messageSchema = new mongoose.Schema({
  chatId: String,
  from: String,
  text: String,
  media: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

/* =========================
   MODELO DE FLUJOS (NUEVO)
========================= */
const flowSchema = new mongoose.Schema({
  name: { type: String, default: "Main Flow" },
  data: { type: Object, required: true },
  updatedAt: { type: Date, default: Date.now }
});
const Flow = mongoose.model("Flow", flowSchema);

/* =========================
   WEBSOCKET
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
   WEBHOOK WHATSAPP
========================= */

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        if (value.messages) {
          for (const msg of value.messages) {
            const sender = msg.from;

            /* ===== TEXTO ===== */
            if (msg.type === "text") {
              const incomingText = msg.text.body.toLowerCase().trim();

              const saved = await Message.create({
                chatId: sender,
                from: sender,
                text: msg.text.body
              });

              broadcast({ type: "new_message", message: saved });

              // --- LÓGICA DE RESPUESTA AUTOMÁTICA (MOTOR DE FLUJOS) ---
              try {
                const flow = await Flow.findOne({ name: "Main Flow" });
                if (flow && flow.data && flow.data.drawflow) {
                  const nodes = flow.data.drawflow.Home.data;

                  // 1. Buscar si el texto es un Trigger
                  const triggerNode = Object.values(nodes).find(node => 
                    node.name === 'trigger' && 
                    node.data.val?.toLowerCase().trim() === incomingText
                  );

                  if (triggerNode) {
                    // 2. Buscar nodo conectado al output del trigger
                    const nextNodeId = triggerNode.outputs.output_1.connections[0]?.node;
                    const nextNode = nodes[nextNodeId];

                    if (nextNode) {
                      let responseText = "";
                      
                      if (nextNode.name === 'message') {
                        responseText = nextNode.data.info;
                      } else if (nextNode.name === 'ia') {
                        // Respuesta predefinida para nodo IA siguiendo instrucciones del usuario
                        responseText = "¡Hola! Soy el asistente inteligente de Webs Rápidas 🤖. Te informo que nuestros planes inician desde S/380. ¿Deseas agendar una asesoría?";
                      }

                      // 3. Enviar respuesta automática a WhatsApp
                      if (responseText) {
                        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                          messaging_product: "whatsapp",
                          to: sender,
                          text: { body: responseText }
                        }, {
                          headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
                        });

                        // 4. Guardar respuesta del bot en Mongo y avisar al CRM
                        const botSaved = await Message.create({
                          chatId: sender,
                          from: "me",
                          text: responseText
                        });
                        broadcast({ type: "new_message", message: botSaved });
                      }
                    }
                  }
                }
              } catch (err) {
                console.error("Error en motor de flujos:", err);
              }
            }

            /* ===== IMAGEN ===== */
            if (msg.type === "image") {
              try {
                const mediaId = msg.image.id;
                const mediaInfo = await axios.get(
                  `https://graph.facebook.com/v18.0/${mediaId}`,
                  { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
                );

                const mediaUrl = mediaInfo.data.url;
                const mediaFile = await axios.get(mediaUrl, {
                  responseType: "arraybuffer",
                  headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
                });

                const fileName = Date.now() + ".jpg";
                const filePath = path.join(uploadsPath, fileName);
                fs.writeFileSync(filePath, mediaFile.data);

                const saved = await Message.create({
                  chatId: sender,
                  from: sender,
                  media: "/uploads/" + fileName
                });

                broadcast({ type: "new_message", message: saved });
              } catch (err) {
                console.error("Error descargando imagen:", err.response?.data || err.message);
              }
            }
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

/* =========================
   API LOCAL
========================= */

app.get("/chats", async (req, res) => {
  const chats = await Message.aggregate([
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: "$chatId",
        lastMessage: { $last: { $ifNull: ["$text", "📷 Imagen"] } },
        lastTime: { $last: "$timestamp" }
      }
    },
    { $sort: { lastTime: -1 } }
  ]);
  res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
  const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
  res.json(messages);
});

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);
  const results = await Message.find({
    text: { $regex: query, $options: "i" }
  }).limit(20).sort({ timestamp: -1 });
  res.json(results);
});

app.delete("/chats/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    await Message.deleteMany({ chatId });
    res.json({ success: true, message: "Conversación eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error al borrar mensajes" });
  }
});

/* =========================
   API DE FLUJOS (NUEVO)
========================= */

app.post("/api/save-flow", async (req, res) => {
  try {
    const flowData = req.body;
    await Flow.findOneAndUpdate(
      { name: "Main Flow" },
      { data: flowData, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: "Flujo guardado en MongoDB" });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar el flujo" });
  }
});

app.get("/api/get-flow", async (req, res) => {
  try {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
  } catch (err) {
    res.status(500).json({ error: "Error al cargar el flujo" });
  }
});

/* =========================
   ENVIAR MENSAJE TEXTO MANUAL
========================= */

app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
    );

    const saved = await Message.create({
      chatId: to,
      from: "me",
      text
    });

    broadcast({ type: "new_message", message: saved });
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Error enviando mensaje" });
  }
});

/* =========================
   ENVIAR IMAGEN MANUAL
========================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to } = req.body;
    const file = req.file;

    if (!file || !to) return res.status(400).json({ error: "Faltan datos" });

    const form = new FormData();
    form.append("file", fs.createReadStream(file.path));
    form.append("messaging_product", "whatsapp");

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
    );

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { id: uploadRes.data.id }
      },
      { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
    );

    const saved = await Message.create({
      chatId: to,
      from: "me",
      media: "/uploads/" + file.filename
    });

    broadcast({ type: "new_message", message: saved });
    res.json({ success: true });
  } catch (err) {
    console.error("Error enviando imagen:", err.response?.data || err.message);
    res.status(500).json({ error: "Error enviando imagen" });
  }
});

/* =========================
   PORT
========================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server activo en puerto", PORT);
});