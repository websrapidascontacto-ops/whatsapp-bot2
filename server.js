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

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ... (Config de rutas y archivos estáticos igual que antes)
const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));
const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath));

/* =========================
   MODELS
========================= */
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Mongo conectado"));

const Message = mongoose.model("Message", new mongoose.Schema({
  chatId: String, from: String, text: String, media: String, timestamp: { type: Date, default: Date.now }
}));

const Session = mongoose.model("Session", new mongoose.Schema({
  chatId: String, lastNodeId: String, updatedAt: { type: Date, default: Date.now, expires: 3600 }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
  name: { type: String, default: "Main Flow" }, data: Object
}));

/* =========================
   WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const msg = changes?.value?.messages?.[0];

    if (msg) {
      const sender = msg.from;
      let incomingText = "";
      let selectionId = "";

      if (msg.type === "text") incomingText = msg.text.body.toLowerCase().trim();
      if (msg.type === "interactive") {
        selectionId = msg.interactive.list_reply?.id;
        incomingText = msg.interactive.list_reply?.title.toLowerCase().trim();
      }

      // Guardar mensaje del usuario
      const saved = await Message.create({ chatId: sender, from: sender, text: incomingText });
      // broadcast({ type: "new_message", message: saved }); // Desactivado temporalmente para evitar errores si broadcast falla

      try {
        const flow = await Flow.findOne({ name: "Main Flow" });
        if (flow?.data?.drawflow) {
          const nodes = flow.data.drawflow.Home.data;
          let nextNode = null;

          // 1. Buscar Trigger
          const triggerNode = Object.values(nodes).find(n => 
            n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText
          );

          if (triggerNode) {
            const nextId = triggerNode.outputs.output_1.connections[0]?.node;
            nextNode = nodes[nextId];
          } else {
            // 2. Buscar por Sesión (Respuesta a menú)
            const session = await Session.findOne({ chatId: sender });
            if (session && nodes[session.lastNodeId]) {
              const currentNode = nodes[session.lastNodeId];
              let optIdx = selectionId ? selectionId.split('_')[1] : parseInt(incomingText);
              const nextId = currentNode.outputs[`output_${optIdx}`]?.connections[0]?.node;
              nextNode = nodes[nextId];
            }
          }

          if (nextNode) {
            let payload = { messaging_product: "whatsapp", to: sender };

            if (nextNode.name === 'message') {
              payload.type = "text";
              payload.text = { body: nextNode.data.info || "..." };
              await Session.deleteOne({ chatId: sender });
            } 
            else if (nextNode.name === 'ia') {
              payload.type = "text";
              payload.text = { body: "¡Hola! Soy tu asistente de Webs Rápidas 🤖. Planes desde S/380." };
              await Session.deleteOne({ chatId: sender });
            } 
            else if (nextNode.name === 'menu') {
              // EXTRACCIÓN GARANTIZADA: Buscamos cualquier campo que no sea 'info'
              const options = Object.keys(nextNode.data)
                .filter(k => k !== 'info' && nextNode.data[k])
                .map(k => nextNode.data[k]);

              if (options.length > 0) {
                payload.type = "interactive";
                payload.interactive = {
                  type: "list",
                  header: { type: "text", text: "Menú Principal" },
                  body: { text: nextNode.data.info || "Selecciona una opción:" },
                  footer: { text: "Webs Rápidas 🚀" },
                  action: {
                    button: "Ver opciones",
                    sections: [{
                      title: "Opciones",
                      rows: options.map((opt, i) => ({ id: `row_${i+1}`, title: opt.substring(0, 24) }))
                    }]
                  }
                };
                await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
              } else {
                // Si el menú no tiene opciones, enviamos solo el texto para no romper el flujo
                payload.type = "text";
                payload.text = { body: nextNode.data.info || "Menú sin opciones" };
              }
            }

            // ENVIAR A WHATSAPP
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
              headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
            });

            // Guardar respuesta del bot
            const botText = payload.interactive ? payload.interactive.body.text : payload.text.body;
            await Message.create({ chatId: sender, from: "me", text: botText });
          }
        }
      } catch (err) {
        console.error("❌ Error:", err.response?.data || err.message);
      }
    }
  }
  res.sendStatus(200);
});

// ... (Resto de APIs GET y POST se mantienen igual)
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
  } catch (err) { res.status(500).send(err); }
});

app.get("/api/get-flow", async (req, res) => {
  const flow = await Flow.findOne({ name: "Main Flow" });
  res.json(flow ? flow.data : null);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log("🚀 Server en puerto", PORT));