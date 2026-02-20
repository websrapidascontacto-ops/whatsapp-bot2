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

/* ========================= CONFIGURACIÓN ========================= */
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Definición de rutas de carpetas
const chatPath = path.join(__dirname, "chat");
const uploadsPath = path.join(chatPath, "uploads");

// Asegurar que la carpeta de subidas exista
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// SERVIR ARCHIVOS ESTÁTICOS (Solución a errores 404 en /uploads/)
app.use(express.static(chatPath));
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => res.redirect("/chat/index.html"));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado"))
    .catch(err => console.error("❌ Error Mongo:", err));

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

/* ========================= WEBSOCKET ========================= */
let clients = new Set();
wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
    clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= FUNCIÓN PARA DESCARGAR MEDIOS DE WHATSAPP ========================= */
async function downloadMedia(mediaId, fileName) {
    try {
        const resUrl = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        const response = await axios.get(resUrl.data.url, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` },
            responseType: 'arraybuffer'
        });
        const filePath = path.join(uploadsPath, fileName);
        fs.writeFileSync(filePath, response.data);
        return `/uploads/${fileName}`;
    } catch (e) {
        console.error("❌ Error descargando media:", e.message);
        return null;
    }
}

/* ========================= WEBHOOK WHATSAPP ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = "";
            let mediaUrl = null;

            if (msg.type === "text") {
                incomingText = msg.text.body.toLowerCase().trim();
            } else if (msg.type === "interactive") {
                incomingText = msg.interactive.list_reply?.title.toLowerCase().trim() || 
                               msg.interactive.button_reply?.title.toLowerCase().trim();
            } else if (msg.type === "image") {
                const fileName = `${Date.now()}-${sender}.jpg`;
                mediaUrl = await downloadMedia(msg.image.id, fileName);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

            if (incomingText || mediaUrl) {
                const saved = await Message.create({ chatId: sender, from: sender, text: incomingText, media: mediaUrl });
                broadcast({ type: "new_message", message: saved });
                
                // Lógica de respuesta automática (resumida para brevedad)
                // ... (aquí va tu lógica de búsqueda en Flow y Session)
            }
        }
    }
    res.sendStatus(200);
});

/* ========================= API PARA EL CRM (Corrigiendo app.js) ========================= */

// Configuración de Multer para recibir archivos desde el navegador
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// RUTA PARA ENVIAR IMÁGENES (Solución al 404 de app.js:207)
app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No hay archivo" });

        // 1. Subir a Meta (API de WhatsApp)
        const form = new FormData();
        form.append("file", fs.createReadStream(file.path));
        form.append("messaging_product", "whatsapp");

        const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // 2. Enviar el ID del media por mensaje
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        const saved = await Message.create({ chatId: to, from: "me", text: "📷 Imagen", media: "/uploads/" + file.filename });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error en send-media:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/send-message", async (req, res) => {
    const { to, text } = req.body;
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "text", text: { body: text }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        const saved = await Message.create({ chatId: to, from: "me", text });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
    res.json({ success: true });
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server Online"));