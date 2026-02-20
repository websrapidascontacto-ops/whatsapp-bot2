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
    chatId: String, 
    from: String, 
    text: String, 
    timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: String, 
    data: Object
}));

/* ========================= WEBSOCKETS ========================= */
function broadcast(data) {
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= RUTAS CRM ========================= */

// Enviar Mensaje de Texto
app.post("/send-message", async (req, res) => {
    const { to, text } = req.body;
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "text", text: { body: text }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        // Guardar en DB para ver en el chat
        const saved = await Message.create({ chatId: to, from: "me", text });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar Media (IMÁGENES) - CORREGIDO PARA QUE SE VEA EN EL CHAT
app.post("/send-media", upload.any(), async (req, res) => {
    try {
        const { to } = req.body;
        const files = req.files;

        if (!files || files.length === 0) return res.status(400).json({ error: "Sin archivos" });

        for (const file of files) {
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

            // 3. GUARDAR EN DB (Esto es lo que faltaba para verlas en el chat)
            const saved = await Message.create({ 
                chatId: to, 
                from: "me", 
                text: "📷 Imagen" 
            });
            
            // 4. Notificar al frontend para que aparezca la burbuja
            broadcast({ type: "new_message", message: saved });
        }
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error en media:", e.response?.data || e.message);
        res.status(500).json({ error: "Error en servidor" });
    }
});

/* ========================= WEBHOOK Y FLUJOS ========================= */
app.post("/webhook", async (req, res) => {
    const data = req.body;
    if (data.object === "whatsapp_business_account" && data.entry?.[0].changes?.[0].value.messages?.[0]) {
        const msg = data.entry[0].changes[0].value.messages[0];
        const sender = msg.from;
        
        // Capturar texto, botón o lista
        const incomingText = (msg.text?.body || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "").toLowerCase().trim();

        const savedMsg = await Message.create({ chatId: sender, from: sender, text: incomingText });
        broadcast({ type: "new_message", message: savedMsg });

        try {
            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc && flowDoc.data.drawflow.Home.data) {
                const nodes = flowDoc.data.drawflow.Home.data;
                const triggerNode = Object.values(nodes).find(n => n.name === "trigger" && n.data.val.toLowerCase().trim() === incomingText);
                if (triggerNode && triggerNode.outputs.output_1.connections[0]) {
                    const nextNode = nodes[triggerNode.outputs.output_1.connections[0].node];
                    await processNode(sender, nextNode);
                }
            }
        } catch (e) { console.error("❌ Flow Error:", e.message); }
    }
    res.sendStatus(200);
});

async function processNode(to, node) {
    try {
        let payload = { messaging_product: "whatsapp", to: to };
        if (node.name === "message" || node.name === "ia") {
            payload.type = "text"; payload.text = { body: node.data.info };
        } else if (node.name === "whatsapp_list") {
            const rows = Object.keys(node.data).filter(k => k.startsWith("row") && node.data[k])
                .map((k, i) => ({ id: `row_${i}`, title: node.data[k].substring(0, 24) }));
            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                header: { type: "text", text: "Opciones" },
                body: { text: node.data.list_title || "Selecciona:" },
                footer: { text: "Webs Rápidas" },
                action: { button: node.data.button_text || "Ver", sections: [{ title: "Menú", rows }] }
            };
        }
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // Registrar respuesta del bot en el historial del chat
        const botMsgText = node.data.info || "Lista/Menú enviado";
        const savedBot = await Message.create({ chatId: to, from: "me", text: botMsgText });
        broadcast({ type: "new_message", message: savedBot });

    } catch (err) { console.error("❌ Error processNode:", err.response?.data || err.message); }
}

/* ========================= APIS DE LISTADO ========================= */

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

app.post("/api/save-flow", async (req, res) => {
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
    res.json({ success: true });
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 CRM Webs Rápidas Activo"));