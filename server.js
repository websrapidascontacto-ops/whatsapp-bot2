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

// 🔥 SERVIR CARPETA CHATS
app.use(express.static(path.join(__dirname, "chats")));

// carpeta uploads dentro de chats
const uploadsPath = path.join(__dirname, "chats", "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

/* =========================
   MONGODB
========================= */

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/crm")
.then(() => console.log("✅ Mongo conectado"))
.catch(err => console.log("❌ Mongo error:", err));

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

  ws.on("close", () => {
    clients.delete(ws);
  });
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

/* =========================
   OBTENER LISTA DE CHATS
========================= */

app.get("/chats", async (req, res) => {
  try {
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
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Error obteniendo chats" });
  }
});

/* =========================
   OBTENER MENSAJES
========================= */

app.get("/messages/:chatId", async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo mensajes" });
  }
});

/* =========================
   ENVIAR TEXTO
========================= */

app.post("/send-message", async (req, res) => {
  try {
    const { to, text } = req.body;

    const msg = await Message.create({
      chatId: to,
      from: "me",
      text
    });

    broadcast({
      type: "new_message",
      message: msg
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Error enviando mensaje" });
  }
});

/* =========================
   ENVIAR IMAGEN
========================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to } = req.body;

    const msg = await Message.create({
      chatId: to,
      from: "me",
      media: "/uploads/" + req.file.filename
    });

    broadcast({
      type: "new_message",
      message: msg
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Error enviando imagen" });
  }
});

/* =========================
   PUERTO
========================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server corriendo en puerto", PORT);
});
