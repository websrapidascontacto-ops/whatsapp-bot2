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
   🔥 WEBHOOK WHATSAPP (ARREGLADO)
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

              const saved = await Message.create({
                chatId: sender,
                from: sender,
                text: msg.text.body
              });

              broadcast({ type: "new_message", message: saved });
            }

            /* ===== IMAGEN ===== */
            if (msg.type === "image") {

              const mediaId = msg.image.id;

              // 1️⃣ Obtener URL temporal
              const mediaRes = await axios.get(
                `https://graph.facebook.com/v18.0/${mediaId}`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
                  }
                }
              );

              const mediaUrl = mediaRes.data.url;

              // 2️⃣ Descargar imagen
              const fileRes = await axios.get(mediaUrl, {
                responseType: "arraybuffer",
                headers: {
                  Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
                }
              });

              const fileName = Date.now() + ".jpg";
              const filePath = path.join(uploadsPath, fileName);

              fs.writeFileSync(filePath, fileRes.data);

              // 3️⃣ Guardar en Mongo
              const saved = await Message.create({
                chatId: sender,
                from: sender,
                media: "/uploads/" + fileName
              });

              broadcast({ type: "new_message", message: saved });
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
        lastMessage: { $last: "$text" },
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

/* =========================
   ENVIAR MENSAJE TEXTO
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
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
        }
      }
    );

    const msg = await Message.create({
      chatId: to,
      from: "me",
      text
    });

    broadcast({ type: "new_message", message: msg });

    res.json({ success: true });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Error enviando mensaje" });
  }
});

/* =========================
   PORT
========================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server activo en puerto", PORT);
});
