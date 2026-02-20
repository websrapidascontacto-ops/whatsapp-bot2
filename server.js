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

// Asegurar que la carpeta de subidas exista
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// Servir archivos estáticos
app.use(express.static(chatPath));
app.use("/uploads", express.static(uploadsPath));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get("/", (req, res) => res.redirect("/index.html"));

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
    } catch (e) {
        console.error("❌ Error descargando media de Meta:", e.message);
        return null;
    }
}

/* ========================= WEBHOOK (RECIBIR MENSAJES) ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = "";
            let mediaUrl = null;

            if (msg.type === "text") {
                incomingText = msg.text.body.trim();
            } else if (msg.type === "interactive") {
                incomingText = msg.interactive.list_reply?.title || msg.interactive.button_reply?.title;
            } else if (msg.type === "image") {
                const fileName = `${Date.now()}-${sender}.jpg`;
                mediaUrl = await downloadMedia(msg.image.id, fileName);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

            if (incomingText || mediaUrl) {
                const saved = await Message.create({ 
                    chatId: sender, 
                    from: sender, 
                    text: incomingText, 
                    media: mediaUrl 
                });
                broadcast({ type: "new_message", message: saved });
                
                // Lógica de respuesta del BOT
                try {
                    const flowDoc = await Flow.findOne({ name: "Main Flow" });
                    if (flowDoc && incomingText) {
                        const nodes = flowDoc.data.drawflow.Home.data;
                        const triggerNode = Object.values(nodes).find(n => 
                            n.name === "trigger" && n.data.val?.toLowerCase() === incomingText.toLowerCase()
                        );
                        if (triggerNode && triggerNode.outputs.output_1.connections[0]) {
                            const nextNode = nodes[triggerNode.outputs.output_1.connections[0].node];
                            await processBotResponse(sender, nextNode, nodes);
                        }
                    }
                } catch (err) { console.error("❌ Error Flow:", err.message); }
            }
        }
    }
    res.sendStatus(200);
});

async function processBotResponse(to, node, allNodes) {
    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

    if (node.name === "message" || node.name === "ia") {
        botText = node.data.info || "Base: S/380";
        payload.type = "text";
        payload.text = { body: botText };
    } else if (node.name === "whatsapp_list") {
        const rows = Object.keys(node.data).filter(k => k.startsWith("row") && node.data[k])
            .map((k, i) => ({ id: `row_${i}`, title: node.data[k].substring(0, 24) }));
        payload.type = "interactive";
        payload.interactive = {
            type: "list",
            body: { text: node.data.list_title || "Opciones:" },
            action: { button: node.data.button_text || "Ver", sections: [{ title: "Menú", rows }] }
        };
        botText = "📋 Menú enviado";
    }

    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
        headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
    });

    const savedBot = await Message.create({ chatId: to, from: "me", text: botText });
    broadcast({ type: "new_message", message: savedBot });
}

/* ========================= API CRM (ENVIAR) ========================= */

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// ENVIAR IMÁGENES DESDE EL CRM
app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No hay archivo" });

        const form = new FormData();
        form.append("file", fs.createReadStream(file.path));
        form.append("messaging_product", "whatsapp");

        const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });

        const saved = await Message.create({ 
            chatId: to, 
            from: "me", 
            text: "📷 Imagen enviada", 
            media: "/uploads/" + file.filename 
        });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error send-media:", e.response?.data || e.message);
        res.status(500).json({ error: e.message });
    }
});

// ENVIAR TEXTO DESDE EL CRM
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

/* ========================= RUTAS DE DATOS ========================= */

app.get("/chats", async (req, res) => {
    const chats = await Message.aggregate([
        { $sort: { timestamp: 1 } },
        { $group: { 
            _id: "$chatId", 
            lastMessage: { $last: { $ifNull: ["$text", "📷 Imagen"] } }, 
            lastTime: { $last: "$timestamp" } 
        }},
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

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server Operativo"));