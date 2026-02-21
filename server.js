const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
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

// Evitar errores 404 de favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get("/", (req, res) => res.redirect("/index.html"));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado - Punto Nemo Estabilizado"))
    .catch(err => console.error("❌ Error Mongo:", err));

const Message = mongoose.model("Message", new mongoose.Schema({
    chatId: String, from: String, text: String, media: String, timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: { type: String, default: "Main Flow" },
    data: { type: Object, required: true }
}));

/* ========================= WEBSOCKET ========================= */
function broadcast(data) {
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= PROCESADOR DE SECUENCIA ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;
    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

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
                botText = `🖼️ Imagen enviada`;
            } else { return; }
        }
        else if (node.name === "whatsapp_list") {
            const rows = Object.keys(node.data).filter(k => k.startsWith("row") && node.data[k])
                .map((k, i) => ({ id: `r${node.id}_${i}`, title: node.data[k].substring(0, 24) }));
            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                body: { text: node.data.list_title || "Selecciona una opción:" },
                action: { button: node.data.button_text || "Opciones", sections: [{ title: "Menú", rows }] }
            };
            botText = "📋 Menú enviado";
        }

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        const saved = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: saved });

        if (node.name === "whatsapp_list") return;

        if (node.outputs?.output_1?.connections?.[0]) {
            const nextId = node.outputs.output_1.connections[0].node;
            await new Promise(r => setTimeout(r, 1500));
            return await processSequence(to, allNodes[nextId], allNodes);
        }
    } catch (err) { console.error("❌ Error en secuencia:", err.response?.data || err.message); }
}

/* ========================= ENDPOINTS PARA APP.JS (FIX 404) ========================= */

// 1. Enviar Mensaje Simple
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

// 2. Enviar Media (Imágenes desde el CRM)
app.post("/send-media", async (req, res) => {
    const { to, mediaUrl, caption } = req.body;
    try {
        const domain = process.env.RAILWAY_STATIC_URL || "whatsapp-bot2-production-0129.up.railway.app";
        const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `https://${domain}${mediaUrl}`;

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { link: fullUrl, caption: caption || "" }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        const saved = await Message.create({ chatId: to, from: "me", text: "🖼️ Imagen enviada" });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ========================= WEBHOOK Y FLUJO ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            const text = (msg.text?.body || msg.interactive?.list_reply?.title || "").trim();
            
            if (!text) continue;

            const saved = await Message.create({ chatId: sender, from: sender, text });
            broadcast({ type: "new_message", message: saved });

            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc) {
                const nodes = flowDoc.data.drawflow.Home.data;
                const trigger = Object.values(nodes).find(n => n.name === "trigger" && n.data.val?.toLowerCase() === text.toLowerCase());
                if (trigger && trigger.outputs.output_1.connections[0]) {
                    return processSequence(sender, nodes[trigger.outputs.output_1.connections[0].node], nodes);
                }
                
                const listNode = Object.values(nodes).find(n => n.name === "whatsapp_list" && Object.values(n.data).some(v => v.trim().toLowerCase() === text.toLowerCase()));
                if (listNode) {
                    const rowKey = Object.keys(listNode.data).find(k => listNode.data[k].trim().toLowerCase() === text.toLowerCase());
                    const conn = listNode.outputs[rowKey.replace('row', 'output_')]?.connections[0];
                    if (conn) return processSequence(sender, nodes[conn.node], nodes);
                }
            }
        }
    }
    res.sendStatus(200);
});

/* ========================= OTRAS APIS ========================= */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/api/upload-node-media", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No hay archivo" });
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

app.get("/chats", async (req, res) => {
    const chats = await Message.aggregate([{ $sort: { timestamp: 1 } }, { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } }, { $sort: { lastTime: -1 } }]);
    res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
    res.json(messages);
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server Punto Nemo 3 - Endpoints CRM Restaurados"));