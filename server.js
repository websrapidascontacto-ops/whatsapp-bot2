const express = require("express");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer"); 
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require("dotenv").config();

// Importación de modelos (Asegúrate de que tu modelo Message tenga el campo mediaUrl)
const Message = require("./models/Message");

const app = express();

// --- CONFIGURACIÓN DE ALMACENAMIENTO (MULTER) ---
// Se asegura de mantener la extensión para que el navegador reconozca la imagen
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

// CONEXIÓN A MONGO (Usando tu URI del .env)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado exitosamente"))
    .catch(err => console.error("❌ Error conectando a MongoDB:", err));

// CONFIGURACIÓN DE SERVIDOR Y WEBSOCKET
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });
const wsClients = new Set();

wss.on("connection", (ws) => {
    wsClients.add(ws);
    console.log("📱 Nuevo cliente visualizador conectado");
    ws.on("close", () => wsClients.delete(ws));
});

function broadcastMessage(data) {
    wsClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    });
}

// --- RUTA: ENVÍO DE MEDIA (IMÁGENES/ARCHIVOS) ---
app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: "No se subió ningún archivo" });

        // 1. Subir el archivo a los servidores de Meta (WhatsApp)
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

        const mediaId = uploadRes.data.id;

        // 2. Enviar el mensaje de imagen a través de la API de WhatsApp
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "image",
                image: { id: mediaId }
            },
            { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
        );

        // 3. Preparar URL local para el Front-end
        const mediaUrl = `/uploads/${file.filename}`;

        // 4. Emitir por WebSocket para actualización en tiempo real
        broadcastMessage({
            type: "sent",
            data: {
                to: to,
                text: "📷 Imagen",
                mediaUrl: mediaUrl,
                source: "whatsapp",
                timestamp: new Date()
            }
        });

        // 5. Guardar en la Base de Datos con mediaUrl
        await Message.create({
            chatId: to,
            from: "me",
            text: "📷 Imagen",
            mediaUrl: mediaUrl,
            source: "whatsapp"
        });

        res.json({ status: "ok", url: mediaUrl });

    } catch (err) {
        console.error("❌ ERROR EN SEND-MEDIA:", err.response?.data || err.message);
        res.status(500).json({ error: "Error procesando el envío de media" });
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
                recipient_type: "individual",
                to: to,
                type: "text",
                text: { body: text }
            },
            { headers: { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` } }
        );

        broadcastMessage({ type: "sent", data: { to, text, source: "whatsapp" } });

        await Message.create({ chatId: to, from: "me", text, source: "whatsapp" });

        res.json({ status: "ok" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WEBHOOK (RECEPCIÓN DE MENSAJES) ---
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
            const from = message.from;
            let text = "";
            let mediaUrl = "";

            if (message.type === "text") {
                text = message.text.body;
            } else if (message.type === "image") {
                text = "📷 Imagen recibida";
                // Aquí podrías agregar lógica para descargar la imagen de Meta y generar una mediaUrl local
            }

            const newMessage = {
                chatId: from,
                from: from,
                text: text,
                mediaUrl: mediaUrl,
                source: "whatsapp",
                timestamp: new Date()
            };

            broadcastMessage({ type: "received", data: newMessage });
            await Message.create(newMessage);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// RUTA RAIZ
app.get("/", (req, res) => {
    res.send("<h1>Servidor Ventas Pro Activo 🚀</h1><p>Precio base: S/380 | WhatsApp: 991138132</p>");
});

// INICIO DEL SERVIDOR
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});