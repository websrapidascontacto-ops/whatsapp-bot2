const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =========================
   CONFIG
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 SERVIR CARPETA "chat" (SIN S)
const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));

// uploads dentro de chat
const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

/* =========================
   RUTA PRINCIPAL OPCIONAL
========================= */

app.get("/", (req, res) => {
  res.redirect("/chat/index.html");
});

/* =========================
   MONGODB
========================= */

if (!process.env.MONGO_URI) {
  console.log("❌ ERROR: MONGO_URI no configurado en Railway");
  process.exit(1);
}

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
   API
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

app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;

  const msg = await Message.create({
    chatId: to,
    from: "me",
    text
  });

  broadcast({ type: "new_message", message: msg });

  res.json({ success: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

app.post("/send-media", upload.single("file"), async (req, res) => {
  const { to } = req.body;

  const msg = await Message.create({
    chatId: to,
    from: "me",
    media: "/uploads/" + req.file.filename
  });

  broadcast({ type: "new_message", message: msg });

  res.json({ success: true });
});

/* =========================
   PORT
========================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server corriendo en puerto", PORT);
});
