const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ========================= CONFIGURACIÓN ========================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const chatPath = path.join(__dirname, "chat");
const uploadsPath = path.join(chatPath, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(express.static(chatPath));
app.use("/uploads", express.static(uploadsPath));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Configuración de Multer flexible
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage: storage });

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado"))
    .catch(err => console.error("❌ Error Mongo:", err));

const Message = mongoose.model("Message", new mongoose.Schema({
    chatId: String, from: String, text: String, timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: String, data: Object
}));

/* ========================= WEBSOCKETS ========================= */
function broadcast(data) {
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= RUTA MEDIA (SOLUCIÓN AL ERROR) ========================= */

// Usamos .any() para que no importe si el campo se llama "files", "image" o "file"
app.post("/send-media", upload.any(), async (req, res) => {
    try {
        const { to } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            console.error("❌ No se recibieron archivos en el request");
            return res.status(400).json({ error: "No se subieron archivos" });
        }

        for (const file of files) {
            console.log(`🚀 Procesando archivo: ${file.filename}`);
            
            const formData = new FormData();
            formData.append("messaging_product", "whatsapp");
            formData.append("file", fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype,
            });
            formData.append("type", file.mimetype);

            // 1. Subir a Meta
            const uploadRes = await axios.post(
                `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`,
                formData,
                { headers: { ...formData.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
            );

            // 2. Enviar a WhatsApp
            await axios.post(
                `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: "whatsapp",
                    to: to,
                    type: "image",
                    image: { id: uploadRes.data.id }
                },
                { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
            );

            const saved = await Message.create({ chatId: to, from: "me", text: "📷 Imagen" });
            broadcast({ type: "new_message", message: saved });
        }
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error detallado en Meta:", e.response?.data || e.message);
        res.status(500).json({ error: "Error al subir o enviar a WhatsApp" });
    }
});

/* ========================= RESTO DE RUTAS ========================= */
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
    const chats = await Message.aggregate([{ $sort: { timestamp: 1 } }, { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } }, { $sort: { lastTime: -1 } }]);
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

server.listen(process.env.PORT || 3000, () => console.log("🚀 Servidor Estable"));