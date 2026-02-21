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

/* ========================= CONFIGURACIÓN DE ARCHIVOS ========================= */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Servir carpetas del CRM y subidas
app.use(express.static(path.join(__dirname, "chat")));
app.use("/uploads", express.static(uploadDir));
app.get('/favicon.ico', (req, res) => res.status(204).end());

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado - Sistema Estable"))
    .catch(err => console.error("❌ Error Mongo:", err));

const Message = mongoose.model("Message", new mongoose.Schema({
    chatId: String, 
    from: String, 
    text: String, 
    mediaUrl: String, 
    timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: { type: String, default: "Main Flow" },
    data: { type: Object, required: true }
}));

/* ========================= WEBSOCKET (BROADCAST TOTAL) ========================= */
function broadcast(data) {
    wss.clients.forEach(c => { 
        if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify(data)); 
        }
    });
}

/* ========================= PROCESADOR DE FLUJO (BOT) ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;
    let payload = { messaging_product: "whatsapp", to };
    let botText = "";
    let mediaForDb = "";

    try {
        if (node.name === "message" || node.name === "ia") {
            botText = node.data.info || "Base S/380. WhatsApp: 991138132";
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
                botText = "📷 Imagen";
                mediaForDb = pathMedia;
            } else { return; }
        }
        else if (node.name === "whatsapp_list") {
            const rows = Object.keys(node.data).filter(k => k.startsWith("row") && node.data[k])
                .map((k, i) => ({ id: `r${node.id}_${i}`, title: node.data[k].substring(0, 24) }));
            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                body: { text: node.data.list_title || "Menú" },
                action: { button: node.data.button_text || "Opciones", sections: [{ title: "Menú", rows }] }
            };
            botText = "📋 Menú enviado";
        }

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        const saved = await Message.create({ chatId: to, from: "me", text: botText, mediaUrl: mediaForDb });
        // Enviamos ambos formatos de evento para que cualquier versión de app.js lo capte
        broadcast({ type: "new_message", message: saved });
        broadcast({ type: "sent", data: saved });

        if (node.name === "whatsapp_list") return;
        if (node.outputs?.output_1?.connections?.[0]) {
            const nextId = node.outputs.output_1.connections[0].node;
            await new Promise(r => setTimeout(r, 1500));
            return await processSequence(to, allNodes[nextId], allNodes);
        }
    } catch (err) { console.error("❌ Error Bot:", err.response?.data || err.message); }
}

/* ========================= WEBHOOK (PUNTO NEMO) ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            const text = (msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "").trim();
            
            const saved = await Message.create({ chatId: sender, from: sender, text: text || "Mensaje recibido" });
            broadcast({ type: "new_message", message: saved });
            broadcast({ type: "incoming", data: saved });

            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc && text) {
                const nodes = flowDoc.data.drawflow.Home.data;
                const trigger = Object.values(nodes).find(n => n.name === "trigger" && n.data.val?.toLowerCase() === text.toLowerCase());
                if (trigger && trigger.outputs.output_1.connections[0]) {
                    processSequence(sender, nodes[trigger.outputs.output_1.connections[0].node], nodes);
                }
            }
        }
    }
    res.sendStatus(200);
});

/* ========================= ENDPOINTS CRM (SEND MESSAGE/MEDIA) ========================= */

app.get("/chats", async (req, res) => {
    const chats = await Message.aggregate([
        { $sort: { timestamp: 1 } },
        { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } },
        { $sort: { lastTime: -1 } }
    ]);
    res.json(chats);
});

app.get(["/messages/:chatId", "/chat/messages/:chatId"], async (req, res) => {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
    res.json(messages);
});

app.post("/send-message", async (req, res) => {
    const { to, text } = req.body;
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, 
            { messaging_product: "whatsapp", to, text: { body: text } },
            { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
        );
        const saved = await Message.create({ chatId: to, from: "me", text });
        broadcast({ type: "new_message", message: saved });
        broadcast({ type: "sent", data: saved });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;
        const form = new FormData();
        form.append('file', fs.createReadStream(file.path), { filename: file.originalname, contentType: file.mimetype });
        form.append('messaging_product', 'whatsapp');

        const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        const saved = await Message.create({ chatId: to, from: "me", text: "📷 Imagen", mediaUrl: `/uploads/${file.filename}` });
        broadcast({ type: "new_message", message: saved });
        broadcast({ type: "sent", data: saved });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ========================= APIS FLOW EDITOR ========================= */
app.post("/api/upload-node-media", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).send("No file");
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

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 CRM & Bot Restaurados al 100%"));