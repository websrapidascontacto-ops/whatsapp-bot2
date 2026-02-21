const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer"); 
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require("dotenv").config();

// Importación de modelos
const Message = require("./models/Message");

const app = express();

// --- CONFIGURACIÓN DE ALMACENAMIENTO (MULTER) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = "uploads/";
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// MIDDLEWARES
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// RUTAS ESTÁTICAS
app.use(express.static("public"));
app.use("/chat", express.static(path.join(__dirname, "chat")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// CONEXIÓN A MONGO
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado exitosamente"))
    .catch(err => console.error("❌ Error conectando a MongoDB:", err));

// CONFIGURACIÓN DE SERVIDOR Y WEBSOCKET
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });
const wsClients = new Set();

wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
});

function broadcastMessage(data) {
    wsClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    });
}

// --- PROXY DE IMÁGENES (INDISPENSABLE PARA VER IMÁGENES RECIBIDAS) ---
app.get("/proxy-media", async (req, res) => {
    const mediaUrl = req.query.url;
    if (!mediaUrl) return res.status(400).send("No URL");
    try {
        const response = await axios.get(mediaUrl, {
            headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` },
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (e) { res.status(500).send("Error de proxy"); }
});

// --- RUTA: ENVÍO DE MEDIA (IMÁGENES/ARCHIVOS) ---
app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No se subió ningún archivo" });

        const form = new FormData();
        form.append('file', fs.createReadStream(file.path), {
            filename: file.filename,
            contentType: file.mimetype,
        });
        form.append('type', file.mimetype);
        form.append('messaging_product', 'whatsapp');

        const uploadRes = await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`,
            form,
            { headers: { ...form.getHeaders(), 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } }
        );

        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "image",
                image: { id: uploadRes.data.id }
            },
            { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
        );

        const mediaUrl = `/uploads/${file.filename}`;
        
        broadcastMessage({
            type: "sent",
            data: { to, text: "📷 Imagen", mediaUrl, source: "whatsapp" }
        });

        await Message.create({
            chatId: to, from: "me", text: "📷 Imagen", mediaUrl, source: "whatsapp"
        });

        res.json({ status: "ok", url: mediaUrl });
    } catch (err) {
        console.error("❌ ERROR EN SEND-MEDIA:", err.response?.data || err.message);
        res.status(500).json({ error: "Error procesando media" });
    }
});

// --- RUTA: ENVÍO DE TEXTO ---
app.post("/send-message", async (req, res) => {
    try {
        const { to, text } = req.body;
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            },
            { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } }
        );
        broadcastMessage({ type: "sent", data: { to, text, source: "whatsapp" } });
        await Message.create({ chatId: to, from: "me", text, source: "whatsapp" });
        res.json({ status: "ok" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- WEBHOOK (RECEPCIÓN DE MENSAJES E IMÁGENES) ---
app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        res.status(200).send(req.query["hub.challenge"]);
    } else { res.sendStatus(403); }
});

app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (value.messages) {
                    for (const msg of value.messages) {
                        const senderId = msg.from;
                        const pushName = value.contacts?.[0]?.profile?.name || "Cliente";
                        let text = msg.text?.body || "";
                        let mediaUrl = null;

                        if (msg.type === "image") {
                            text = "📷 Imagen recibida";
                            try {
                                const metaRes = await axios.get(`https://graph.facebook.com/v18.0/${msg.image.id}`, {
                                    headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` }
                                });
                                // Generamos la URL del proxy para que el front-end pueda cargarla
                                mediaUrl = `/proxy-media?url=${encodeURIComponent(metaRes.data.url)}`;
                            } catch (e) { console.error("Error obteniendo URL de Meta"); }
                        }

                        const newMessage = {
                            chatId: senderId, from: senderId, text, mediaUrl,
                            source: "whatsapp", pushname: pushName, timestamp: new Date()
                        };

                        broadcastMessage({ type: "incoming", data: newMessage });
                        await Message.create(newMessage);
                    }
                }
            }
        }
        res.sendStatus(200);
    } else { res.sendStatus(404); }
});

app.get("/chat/messages/:chatId", async (req, res) => {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
    res.json(messages);
});

app.get("/", (req, res) => res.send("🚀 CRM Webs Rápidas Activo"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));