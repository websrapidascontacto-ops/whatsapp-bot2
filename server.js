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
   CONFIGURACIÓN
========================= */
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));
const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => res.redirect("/chat/index.html"));

/* =========================
   MONGODB
========================= */
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Mongo conectado"));

const Message = mongoose.model("Message", new mongoose.Schema({
  chatId: String, from: String, text: String, media: String, timestamp: { type: Date, default: Date.now }
}));

const Session = mongoose.model("Session", new mongoose.Schema({
  chatId: String, lastNodeId: String, updatedAt: { type: Date, default: Date.now, expires: 3600 }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
  name: { type: String, default: "Main Flow" }, data: { type: Object, required: true }
}));

/* =========================
   WEBSOCKET
========================= */
let clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});
function broadcast(data) {
  clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(JSON.stringify(data)));
}

/* =========================
   WEBHOOK WHATSAPP (EL CORAZÓN DEL BOT)
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
            let incomingText = (msg.type === "text") ? msg.text.body.toLowerCase().trim() : "";

            if (incomingText) {
              // Guardar mensaje del usuario
              const saved = await Message.create({ chatId: sender, from: sender, text: incomingText });
              broadcast({ type: "new_message", message: saved });

              try {
                const flow = await Flow.findOne({ name: "Main Flow" });
                if (flow && flow.data && flow.data.drawflow) {
                  const nodes = flow.data.drawflow.Home.data;
                  let nextNode = null;

                  // 1. ¿Es un Trigger? (Palabra clave)
                  const triggerNode = Object.values(nodes).find(n => n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText);
                  
                  if (triggerNode) {
                    const outputConnections = triggerNode.outputs.output_1.connections;
                    if (outputConnections.length > 0) {
                        nextNode = nodes[outputConnections[0].node];
                    }
                  } else {
                    // 2. ¿Es una respuesta numérica a un menú?
                    const session = await Session.findOne({ chatId: sender });
                    if (session && nodes[session.lastNodeId]) {
                      const currentNode = nodes[session.lastNodeId];
                      const outputKey = `output_${parseInt(incomingText)}`;
                      if (currentNode.outputs[outputKey] && currentNode.outputs[outputKey].connections.length > 0) {
                        nextNode = nodes[currentNode.outputs[outputKey].connections[0].node];
                      }
                    }
                  }

                  // 3. ENVIAR LA RESPUESTA
                  if (nextNode) {
                    let responseText = "";
                    
                    if (nextNode.name === 'message' || nextNode.name === 'ia') {
                      responseText = nextNode.data.info || "¡Hola! 👋";
                      await Session.deleteOne({ chatId: sender }); // Cerramos sesión si es mensaje final
                    } 
                    else if (nextNode.name === 'menu') {
                      // CONSTRUCCIÓN DEL MENÚ ARREGLADA
                      let titulo = nextNode.data.info || "Selecciona una opción:";
                      responseText = `*${titulo}* 📋\n\n`;

                      // Buscamos todas las llaves que empiecen por "option" y tengan contenido
                      const optionsKeys = Object.keys(nextNode.data)
                        .filter(k => k.startsWith('option') && nextNode.data[k].trim() !== "")
                        .sort((a, b) => parseInt(a.replace('option', '')) - parseInt(b.replace('option', '')));

                      if (optionsKeys.length > 0) {
                        optionsKeys.forEach((key, index) => {
                          responseText += `${index + 1}️⃣ ${nextNode.data[key]}\n`;
                        });
                        responseText += `\n_Responde con el número de tu opción_ 📝`;
                      } else {
                        responseText += `_(No hay opciones configuradas en este menú)_`;
                      }
                      
                      // Guardamos en qué menú se quedó el usuario
                      await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
                    }

                    if (responseText) {
                      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp", to: sender, text: { body: responseText }
                      }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

                      const botSaved = await Message.create({ chatId: sender, from: "me", text: responseText });
                      broadcast({ type: "new_message", message: botSaved });
                    }
                  }
                }
              } catch (e) { console.error("❌ Error en el flujo:", e.message); }
            }

            // IMÁGENES (Mantenido intacto)
            if (msg.type === "image") {
              try {
                const mediaId = msg.image.id;
                const mediaInfo = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
                const mediaFile = await axios.get(mediaInfo.data.url, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
                const fileName = Date.now() + ".jpg";
                const filePath = path.join(uploadsPath, fileName);
                fs.writeFileSync(filePath, mediaFile.data);
                const savedMedia = await Message.create({ chatId: sender, from: sender, media: "/uploads/" + fileName });
                broadcast({ type: "new_message", message: savedMedia });
              } catch (err) { console.error("Error imagen:", err.message); }
            }
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

/* =========================
   REST API (Mantenido intacto)
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
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get("/api/get-flow", async (req, res) => {
  const flow = await Flow.findOne({ name: "Main Flow" });
  res.json(flow ? flow.data : null);
});

app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;
  await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp", to, text: { body: text }
  }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
  const saved = await Message.create({ chatId: to, from: "me", text });
  broadcast({ type: "new_message", message: saved });
  res.json({ success: true });
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

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server activo"));