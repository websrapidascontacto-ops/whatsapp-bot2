// ================= IMPORTS =================
const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

const fetch = global.fetch;

// ================= MODELOS =================
const User = require("./models/User");
const Flow = require("./models/Flow");
const Message = require("./models/Message");
const auth = require("./middleware/auth");

// ================= EXPRESS =================
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/chat", express.static(path.join(__dirname, "chat")));

// ================= MONGODB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ================= SERVIDOR HTTP =================
const server = require("http").createServer(app);

// ================= WEBSOCKET =================
const wss = new WebSocket.Server({ server });
const wsClients = new Set();

wss.on("connection", ws => {
  wsClients.add(ws);
  console.log("🟢 Frontend conectado via WebSocket");
  ws.on("close", () => wsClients.delete(ws));
});

function broadcastMessage(data) {
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

// ================= AUTH =================
app.post("/register", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.json({ status: "registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = await user.comparePassword(req.body.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// ================= FLOW =================
app.post("/save-flow", auth, async (req, res) => {
  await Flow.findOneAndUpdate(
    { userId: req.user.id },
    { data: req.body },
    { upsert: true }
  );
  res.json({ status: "saved" });
});

app.get("/get-flow", auth, async (req, res) => {
  const flow = await Flow.findOne({ userId: req.user.id });
  res.json(flow?.data || {});
});

// ================= WEBHOOKS (WHATSAPP & INSTAGRAM) =================

// --- Validaciones GET ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// Nueva ruta para validar Instagram
app.get("/webhook/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.IG_VERIFY_TOKEN) {
    console.log("✅ Webhook Instagram verificado");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// --- Recepción POST WhatsApp ---
app.post("/webhook", async (req, res) => {
  console.log("📩 Evento recibido de WhatsApp");
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const from = msg.from;
            const messageType = msg.type;
            let text = "";
            let mediaUrl = null;

            if (messageType === "text") text = msg.text?.body;
            if (messageType === "audio") text = "🎤 Audio recibido";
            if (messageType === "image") {
              text = msg.image?.caption || "";
              const mediaId = msg.image?.id;
              try {
                const mediaRes = await fetch(
                  `https://graph.facebook.com/v18.0/${mediaId}`,
                  { headers: { "Authorization": `Bearer ${process.env.ACCESS_TOKEN}` } }
                );
                const mediaData = await mediaRes.json();
                const realUrl = mediaData.url;
                const imageRes = await fetch(realUrl, {
                  headers: { "Authorization": `Bearer ${process.env.ACCESS_TOKEN}` }
                });
                const buffer = Buffer.from(await imageRes.arrayBuffer());
                const mimeType = imageRes.headers.get("content-type");
                mediaUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
              } catch (err) {
                console.log("❌ Error descargando imagen:", err.message);
              }
            }

            const message = {
              from,
              text,
              messageType,
              mediaUrl,
              pushname: value.contacts?.[0]?.profile?.name,
              profilePic: value.contacts?.[0]?.profile?.profile_pic_url || null,
              source: "whatsapp"
            };

            await Message.create({ chatId: from, ...message });
            broadcastMessage({ type: "incoming", data: message });
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// --- Recepción POST Instagram (NUEVO) ---
app.post("/webhook/instagram", async (req, res) => {
  const body = req.body;
  if (body.object === "instagram") {
    for (const entry of body.entry || []) {
      const messaging = entry.messaging?.[0];
      if (messaging && messaging.message) {
        const from = messaging.sender.id;
        const text = messaging.message.text;

        const messageData = {
          from,
          text,
          messageType: "text",
          pushname: "Cliente Instagram",
          profilePic: "https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg",
          source: "instagram" 
        };

        // Guardar en la misma DB que WhatsApp
        await Message.create({ chatId: from, ...messageData });
        // Enviar al mismo WebSocket
        broadcastMessage({ type: "incoming", data: messageData });
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }
  res.sendStatus(404);
});

// ================= ENVIAR MENSAJES (WHATSAPP & INSTAGRAM) =================

// WhatsApp (Tu ruta original intacta)
app.post("/send-message", async (req, res) => {
  const { to, text, type = "text", fileUrl, caption } = req.body;
  if (!to) return res.status(400).json({ error: "Missing 'to'" });

  let payload = { messaging_product: "whatsapp", to };
  if (type === "image") payload.image = { link: fileUrl, caption: caption || "" };
  else if (type === "audio") payload.audio = { link: fileUrl };
  else payload.text = { body: text };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    broadcastMessage({ type: "sent", data: { to, text, imageUrl: fileUrl || null, source: "whatsapp" } });
    await Message.create({ chatId: to, from: "me", type, text, mediaUrl: fileUrl || "", source: "whatsapp" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Instagram (NUEVA ruta de envío)
app.post("/send-instagram", async (req, res) => {
  const { to, text } = req.body;
  if (!to) return res.status(400).json({ error: "Missing 'to'" });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.IG_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: to },
          message: { text: text }
        })
      }
    );

    const data = await response.json();
    broadcastMessage({ type: "sent", data: { to, text, source: "instagram" } });
    await Message.create({ chatId: to, from: "me", type: "text", text: text, source: "instagram" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ENDPOINT PARA MENSAJES HISTÓRICOS =================
app.get("/chat/messages/:chatId", async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messages = await Message.find({ chatId }).sort({ timestamp: 1 });
    res.json(messages.map(m => ({
      from: m.from,
      type: m.type,
      text: m.text,
      mediaUrl: m.mediaUrl,
      timestamp: m.timestamp,
      source: m.source || "whatsapp"
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= PUERTO =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
