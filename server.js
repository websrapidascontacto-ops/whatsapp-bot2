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

/* ================= CONFIG ================= */

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));

const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => res.redirect("/chat/index.html"));

/* ================= MONGODB ================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo conectado"))
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
  data: { type: Object, required: true }
}));

/* ================= WEBSOCKET ================= */

let clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
  clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(data));
    }
  });
}

/* ================= WEBHOOK WHATSAPP ================= */

app.post("/webhook", async (req, res) => {

  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(200);
  }

  try {

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        const value = change.value;
        if (!value.messages) continue;

        for (const msg of value.messages) {

          const sender = msg.from;
          let incomingText = "";

          if (msg.type === "text") {
            incomingText = msg.text.body.toLowerCase().trim();
          }

          /* ================= GUARDAR MENSAJE USUARIO ================= */

          if (incomingText) {

            const savedUserMsg = await Message.create({
              chatId: sender,
              from: sender,
              text: incomingText
            });

            broadcast({ type: "new_message", message: savedUserMsg });

            /* ================= PROCESAR FLUJO ================= */

            const flow = await Flow.findOne({ name: "Main Flow" });

            if (!flow || !flow.data?.drawflow?.Home?.data) continue;

            const nodes = flow.data.drawflow.Home.data;
            let nextNode = null;
            let nextNodeId = null;

            /* ===== 1. BUSCAR TRIGGER ===== */

            const triggerNodeEntry = Object.entries(nodes).find(([id, node]) =>
              node.name === "trigger" &&
              node.data?.val?.toLowerCase().trim() === incomingText
            );

            if (triggerNodeEntry) {
              const [triggerId, triggerNode] = triggerNodeEntry;

              const connections = triggerNode.outputs?.output_1?.connections || [];

              if (connections.length > 0) {
                nextNodeId = connections[0].node;
                nextNode = nodes[nextNodeId];
              }
            }

            /* ===== 2. RESPUESTA A MENÚ ===== */

            if (!nextNode) {

              const session = await Session.findOne({ chatId: sender });

              if (session && nodes[session.lastNodeId]) {

                const currentNode = nodes[session.lastNodeId];
                const selectedNumber = parseInt(incomingText);

                if (!isNaN(selectedNumber)) {

                  const outputKey = `output_${selectedNumber}`;
                  const connections = currentNode.outputs?.[outputKey]?.connections || [];

                  if (connections.length > 0) {
                    nextNodeId = connections[0].node;
                    nextNode = nodes[nextNodeId];
                  }
                }
              }
            }

            /* ===== 3. RESPONDER ===== */

            if (nextNode) {

              let responseText = "";

              /* ===== MENSAJE NORMAL ===== */

              if (nextNode.name === "message" || nextNode.name === "ia") {

                responseText = nextNode.data?.info || "¡Hola! 👋";
                await Session.deleteOne({ chatId: sender });
              }

              /* ===== MENÚ ===== */

              else if (nextNode.name === "menu") {

                const titulo = nextNode.data?.info || "Selecciona una opción:";
                responseText = `*${titulo}* 📋\n\n`;

                const optionsKeys = Object.keys(nextNode.data || {})
                  .filter(k =>
                    k.startsWith("option") &&
                    typeof nextNode.data[k] === "string" &&
                    nextNode.data[k].trim() !== ""
                  )
                  .sort((a, b) =>
                    parseInt(a.replace("option", "")) -
                    parseInt(b.replace("option", ""))
                  );

                if (optionsKeys.length > 0) {

                  optionsKeys.forEach((key, index) => {
                    responseText += `${index + 1}️⃣ ${nextNode.data[key]}\n`;
                  });

                  responseText += `\n_Responde con el número de tu opción_ 📝`;

                } else {
                  responseText += "_(No hay opciones configuradas en este menú)_";
                }

                await Session.findOneAndUpdate(
                  { chatId: sender },
                  { lastNodeId: nextNodeId },
                  { upsert: true }
                );
              }

              /* ===== ENVIAR A WHATSAPP ===== */

              if (responseText) {

                await axios.post(
                  `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                  {
                    messaging_product: "whatsapp",
                    to: sender,
                    text: { body: responseText }
                  },
                  {
                    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
                  }
                );

                const savedBotMsg = await Message.create({
                  chatId: sender,
                  from: "me",
                  text: responseText
                });

                broadcast({ type: "new_message", message: savedBotMsg });
              }
            }
          }

          /* ================= IMÁGENES ================= */

          if (msg.type === "image") {

            const mediaId = msg.image.id;

            const mediaInfo = await axios.get(
              `https://graph.facebook.com/v18.0/${mediaId}`,
              { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
            );

            const mediaFile = await axios.get(mediaInfo.data.url, {
              responseType: "arraybuffer",
              headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
            });

            const fileName = Date.now() + ".jpg";
            const filePath = path.join(uploadsPath, fileName);

            fs.writeFileSync(filePath, mediaFile.data);

            const savedMedia = await Message.create({
              chatId: sender,
              from: sender,
              media: "/uploads/" + fileName
            });

            broadcast({ type: "new_message", message: savedMedia });
          }
        }
      }
    }

  } catch (error) {
    console.error("❌ Error webhook:", error.message);
  }

  res.sendStatus(200);
});

/* ================= ELIMINAR CONVERSACIÓN ================= */

app.delete("/delete-chat/:chatId", async (req, res) => {

  const chatId = req.params.chatId;

  await Message.deleteMany({ chatId });
  await Session.deleteOne({ chatId });

  broadcast({ type: "chat_deleted", chatId });

  res.json({ success: true });
});

/* ================= REST ================= */

app.get("/chats", async (req, res) => {

  const chats = await Message.aggregate([
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: "$chatId",
        lastMessage: {
          $last: { $ifNull: ["$text", "📷 Imagen"] }
        },
        lastTime: { $last: "$timestamp" }
      }
    },
    { $sort: { lastTime: -1 } }
  ]);

  res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
  const messages = await Message.find({ chatId: req.params.chatId })
    .sort({ timestamp: 1 });
  res.json(messages);
});

app.post("/api/save-flow", async (req, res) => {
  await Flow.findOneAndUpdate(
    { name: "Main Flow" },
    { data: req.body },
    { upsert: true }
  );
  res.json({ success: true });
});

app.get("/api/get-flow", async (req, res) => {
  const flow = await Flow.findOne({ name: "Main Flow" });
  res.json(flow ? flow.data : null);
});

/* ================= SERVER ================= */

server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("🚀 Server activo")
);