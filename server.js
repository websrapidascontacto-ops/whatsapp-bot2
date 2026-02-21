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
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// IMPORTANTE: Servir la carpeta de uploads para que el navegador vea las fotos
app.use(express.static(path.join(__dirname, "chat")));
app.use("/uploads", express.static(uploadDir));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Conectado"));

// Esquema unificado para que el front detecte mediaUrl
const Message = mongoose.model("Message", new mongoose.Schema({
    chatId: String, 
    from: String, 
    text: String, 
    mediaUrl: String, // Clave vital para ver imágenes en el front
    timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: { type: String, default: "Main Flow" },
    data: { type: Object, required: true }
}));

/* ========================= WEBSOCKET ========================= */
function broadcast(data) {
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= PROCESADOR DE FLUJO ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;
    let payload = { messaging_product: "whatsapp", to };
    let botText = "";
    let mediaForDb = "";

    try {
        if (node.name === "message") {
            botText = node.data.info;
            payload.type = "text";
            payload.text = { body: botText };
        } 
        else if (node.name === "media") {
            const pathMedia = node.data.media_url; 
            if (pathMedia) {
                const domain = process.env.RAILWAY_STATIC_URL || "whatsapp-bot2-production-0129.up.railway.app";
                const fullUrl = pathMedia.startsWith('http') ? pathMedia : `https://${domain}${pathMedia}`;
                payload.type = "image";
                payload.image = { link: fullUrl, caption: node.data.caption || "" };
                botText = node.data.caption || "📷 Imagen";
                mediaForDb = pathMedia; // Guardamos la ruta relativa para el front
            }
        }

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        const saved = await Message.create({ chatId: to, from: "me", text: botText, mediaUrl: mediaForDb });
        broadcast({ type: "new_message", message: saved });

    } catch (err) { console.error("❌ Error Bot:", err.message); }
}

/* ========================= ENDPOINTS CRM ========================= */

app.get("/chats", async (req, res) => {
    const chats = await Message.aggregate([
        { $sort: { timestamp: 1 } },
        { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } },
        { $sort: { lastTime: -1 } }
    ]);
    res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
    res.json(messages);
});

// ENVÍO MANUAL CON LÓGICA PUNTO NEMO (MEDIA ID)
app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;

        const form = new FormData();
        form.append('file', fs.createReadStream(file.path), { filename: file.originalname, contentType: file.mimetype });
        form.append('messaging_product', 'whatsapp');

        // 1. Subir a Meta
        const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // 2. Enviar mensaje
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        // 3. Guardar con mediaUrl para que el front la renderice
        const saved = await Message.create({ 
            chatId: to, 
            from: "me", 
            text: "📷 Imagen", 
            mediaUrl: `/uploads/${file.filename}` 
        });
        
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ========================= APIS FLUJO ========================= */
app.post("/api/upload-node-media", upload.single("file"), (req, res) => {
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.post("/api/save-flow", async (req, res) => {
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
    res.json({ success: true });
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 CRM Visual Listo"));