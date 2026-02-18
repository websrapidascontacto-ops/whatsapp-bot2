const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// STATIC
app.use("/chat", express.static(path.join(__dirname, "chat")));

// MONGODB
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/crm", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
  chatId: String,
  from: String,
  text: String,
  mediaUrl: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// WEBSOCKET
wss.on("connection", (ws) => {
  console.log("WS connected");
});

// LISTAR CHATS
app.get("/chat/list", async (req, res) => {
  const chats = await Message.aggregate([
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: "$chatId",
        text: { $first: "$text" },
        pushname: { $first: "$chatId" },
      },
    },
  ]);

  res.json(chats);
});

// OBTENER MENSAJES
app.get("/chat/messages/:id", async (req, res) => {
  const msgs = await Message.find({ chatId: req.params.id }).sort({
    timestamp: 1,
  });

  res.json(msgs);
});

// ENVIAR MENSAJE
app.post("/send-message", async (req, res) => {
  const { to, text } = req.body;

  const msg = await Message.create({
    chatId: to,
    from: "me",
    text,
  });

  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: "sent",
        data: { to, text },
      })
    );
  });

  res.json({ ok: true });
});

// MULTER MEDIA
const upload = multer({ dest: "uploads/" });

app.post("/send-media", upload.single("file"), async (req, res) => {
  const { to } = req.body;

  const mediaUrl = `/uploads/${req.file.filename}`;

  const msg = await Message.create({
    chatId: to,
    from: "me",
    mediaUrl,
  });

  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: "sent",
        data: { to, mediaUrl },
      })
    );
  });

  res.json({ ok: true });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

server.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
