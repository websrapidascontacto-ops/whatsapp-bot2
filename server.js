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
app.get("/", (req, res) => res.redirect("/index.html"));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado - Punto Nemo Arreglado"))
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

/* ========================= WHATSAPP MEDIA DOWNLOADER ========================= */
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
    } catch (e) { return null; }
}

/* ========================= WEBHOOK PRINCIPAL ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            // Captura texto de mensajes normales o de respuestas interactivas (Listas/Botones)
            let incomingText = (msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "").trim();
            let mediaUrl = null;

            if (msg.type === "image") {
                mediaUrl = await downloadMedia(msg.image.id, `${Date.now()}-${sender}.jpg`);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

            const saved = await Message.create({ chatId: sender, from: sender, text: incomingText, media: mediaUrl });
            broadcast({ type: "new_message", message: saved });
            
            try {
                const flowDoc = await Flow.findOne({ name: "Main Flow" });
                if (flowDoc && incomingText) {
                    const nodes = flowDoc.data.drawflow.Home.data;

                    // 1. LÓGICA DE TRIGGER (INICIO DE FLUJO)
                    const triggerNode = Object.values(nodes).find(n => 
                        n.name === "trigger" && n.data.val?.toLowerCase() === incomingText.toLowerCase()
                    );
                    
                    if (triggerNode && triggerNode.outputs.output_1.connections[0]) {
                        const firstNextNodeId = triggerNode.outputs.output_1.connections[0].node;
                        return await processSequence(sender, nodes[firstNextNodeId], nodes);
                    }

                    // 2. LÓGICA DE CONTINUACIÓN POR LISTA
                    // Buscamos si el texto recibido coincide con alguna fila de un nodo whatsapp_list
                    const activeListNode = Object.values(nodes).find(n => {
                        if (n.name !== "whatsapp_list") return false;
                        return Object.values(n.data).some(val => val.trim().toLowerCase() === incomingText.toLowerCase());
                    });

                    if (activeListNode) {
                        const rowKey = Object.keys(activeListNode.data).find(k => 
                            activeListNode.data[k].trim().toLowerCase() === incomingText.toLowerCase()
                        );
                        
                        if (rowKey) {
                            const outputNum = rowKey.replace('row', 'output_'); 
                            const connection = activeListNode.outputs[outputNum]?.connections[0];
                            
                            if (connection) {
                                const nextNodeId = connection.node;
                                return await processSequence(sender, nodes[nextNodeId], nodes);
                            }
                        }
                    }
                }
            } catch (err) { console.error("❌ Error Webhook Logic:", err.message); }
        }
    }
    res.sendStatus(200);
});

/* ========================= PROCESADOR DE SECUENCIA ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;

    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

    // Manejo de tipos de nodo
    if (node.name === "message" || node.name === "ia") {
        botText = node.data.info || "Base S/380. WhatsApp: 991138132";
        payload.type = "text";
        payload.text = { body: botText };
    } 
    else if (node.name === "media") {
        const mediaPath = node.data.media_url;
        const caption = node.data.caption || "";
        const domain = process.env.RAILWAY_STATIC_URL || "whatsapp-bot2-production-0129.up.railway.app";
        const fullUrl = mediaPath.startsWith('/uploads/') ? `https://${domain}${mediaPath}` : mediaPath;

        payload.type = "image";
        payload.image = { link: fullUrl, caption: caption };
        botText = `🖼️ Imagen: ${caption}`;
    }
    else if (node.name === "whatsapp_list") {
        const rows = Object.keys(node.data)
            .filter(k => k.startsWith("row") && node.data[k])
            .map((k, i) => ({ 
                id: `row_${node.id}_${i}`, 
                title: node.data[k].substring(0, 24) 
            }));

        payload.type = "interactive";
        payload.interactive = {
            type: "list",
            body: { text: node.data.list_title || "Selecciona una opción:" },
            action: { 
                button: node.data.button_text || "Ver opciones", 
                sections: [{ title: "Opciones disponibles", rows }] 
            }
        };
        botText = "📋 Menú enviado";
    }

    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        const savedBot = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: savedBot });

        // === CRUCIAL: Bloqueo de secuencia si es Lista ===
        if (node.name === "whatsapp_list") {
            console.log(`⏳ Nodo Lista enviado. Esperando acción del usuario ${to}...`);
            return; // Detiene el flujo automático aquí
        }

        // Seguir al siguiente nodo si hay conexión en output_1 (para mensajes planos o media)
        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            await new Promise(r => setTimeout(r, 1500)); 
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }
    } catch (err) { 
        console.error("❌ Error en processSequence:", err.response?.data || err.message); 
    }
}

/* ========================= APIS Y SUBIDAS ========================= */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/api/upload-node-media", upload.single("file"), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No hay archivo" });
        res.json({ url: `/uploads/${req.file.filename}` });
    } catch (err) { res.status(500).json({ error: "Error subida" }); }
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
    try {
        await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("🚀 Server Punto Nemo 3 - Navegación de Listas Activa");
});