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

const chatPath = path.join(__dirname, "chat");
const uploadsPath = path.join(chatPath, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

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
    timestamp: { type: Date, default: Date.now }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: String,
    data: Object
}));

/* ========================= WEBSOCKETS ========================= */
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

/* ========================= WEBHOOK WHATSAPP ========================= */
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
    const data = req.body;
    if (data.object === "whatsapp_business_account" && data.entry?.[0].changes?.[0].value.messages?.[0]) {
        const msg = data.entry[0].changes[0].value.messages[0];
        const sender = msg.from;
        
        // Extraer texto de mensajes normales o de botones/listas
        const incomingText = (
            msg.text?.body || 
            msg.interactive?.button_reply?.title || 
            msg.interactive?.list_reply?.title || 
            ""
        ).toLowerCase().trim();

        console.log(`📩 Mensaje de ${sender}: ${incomingText}`);

        // Guardar en base de datos para el CRM
        const savedMsg = await Message.create({ chatId: sender, from: sender, text: incomingText });
        broadcast({ type: "new_message", message: savedMsg });

        try {
            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc && flowDoc.data.drawflow.Home.data) {
                const nodes = flowDoc.data.drawflow.Home.data;

                // 1. Buscar nodo Trigger que coincida
                const triggerNode = Object.values(nodes).find(n => 
                    n.name === "trigger" && n.data.val.toLowerCase().trim() === incomingText
                );

                if (triggerNode) {
                    const conn = triggerNode.outputs.output_1.connections[0];
                    if (conn) {
                        const nextNode = nodes[conn.node];
                        await processNode(sender, nextNode, nodes);
                    }
                }
            }
        } catch (e) {
            console.error("❌ Webhook Flow Error:", e.message);
        }
    }
    res.sendStatus(200);
});

async function processNode(to, node, allNodes) {
    let payload = { messaging_product: "whatsapp", to: to };

    if (node.name === "message" || node.name === "ia") {
        payload.type = "text";
        payload.text = { body: node.data.info };
    } 
    else if (node.name === "whatsapp_list") {
        const rows = Object.keys(node.data)
            .filter(k => k.startsWith("row") && node.data[k])
            .map((k, i) => ({ id: `row_${i}`, title: node.data[k].substring(0, 24) }));

        payload.type = "interactive";
        payload.interactive = {
            type: "list",
            body: { text: node.data.list_title || "Selecciona una opción:" },
            action: { 
                button: node.data.button_text || "Ver Menú", 
                sections: [{ title: "Opciones", rows }] 
            }
        };
    }

    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        
        // Registrar respuesta del bot en el chat
        const botText = node.data.info || node.data.list_title || "Mensaje interactivo enviado";
        const savedBotMsg = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: savedBotMsg });

    } catch (err) {
        console.error("❌ Error enviando mensaje:", err.response?.data || err.message);
    }
}

/* ========================= REST API ========================= */
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

/* ========================= START SERVER ========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));