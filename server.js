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
    .then(() => console.log("✅ Mongo conectado"))
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

/* ========================= WEBHOOK Y LÓGICA SECUENCIAL ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = (msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "").trim();

            // Guardar mensaje entrante
            const saved = await Message.create({ chatId: sender, from: sender, text: incomingText });
            broadcast({ type: "new_message", message: saved });
            
            // Buscar inicio de flujo
            try {
                const flowDoc = await Flow.findOne({ name: "Main Flow" });
                if (flowDoc && incomingText) {
                    const nodes = flowDoc.data.drawflow.Home.data;
                    const triggerNode = Object.values(nodes).find(n => 
                        n.name === "trigger" && n.data.val?.toLowerCase() === incomingText.toLowerCase()
                    );
                    
                    if (triggerNode && triggerNode.outputs.output_1.connections[0]) {
                        const firstNextNodeId = triggerNode.outputs.output_1.connections[0].node;
                        // INICIA LA SECUENCIA RECURSIVA
                        await processSequence(sender, nodes[firstNextNodeId], nodes);
                    }
                }
            } catch (err) { console.error("❌ Error Secuencia:", err.message); }
        }
    }
    res.sendStatus(200);
});

// FUNCIÓN RECURSIVA: Procesa el nodo actual y salta al siguiente si existe conexión
// ... (Todo el código anterior de server.js se mantiene igual)

async function processSequence(to, node, allNodes) {
    if (!node) return;

    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

    // --- LÓGICA DE NODOS ACTUALIZADA ---
    if (node.name === "message" || node.name === "ia") {
        botText = node.data.info || "S/380";
        payload.type = "text";
        payload.text = { body: botText };
    } 
    else if (node.name === "media") {
        // NUEVO: Módulo de Imagen funcional
        const imageUrl = node.data.media_url;
        const caption = node.data.caption || "";
        
        if (imageUrl) {
            payload.type = "image";
            payload.image = { link: imageUrl, caption: caption };
            botText = `🖼️ Imagen enviada: ${caption}`;
        } else {
            // Si el nodo está vacío, mandamos un aviso para no romper el flujo
            payload.type = "text";
            payload.text = { body: "⚠️ (Nodo de imagen vacío en el flujo)" };
            botText = "Error: Nodo media vacío";
        }
    }
    else if (node.name === "whatsapp_list") {
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

    // --- ENVÍO Y RECURSIVIDAD ---
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // Guardar registro en el chat
        const savedBot = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: savedBot });

        // SALTO AL SIGUIENTE NODO (Secuencia continua)
        if (node.outputs && node.outputs.output_1 && node.outputs.output_1.connections.length > 0) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            const nextNode = allNodes[nextNodeId];
            
            await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 seg entre mensajes
            return await processSequence(to, nextNode, allNodes);
        }
    } catch (err) {
        console.error("❌ Error en flujo secuencial:", err.response?.data || err.message);
    }
}

// ... (Resto del server.js sin cambios)/* ========================= RESTO DE APIS (ENVÍO CRM, ETC) ========================= */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/send-media", upload.single("file"), async (req, res) => {
    try {
        const { to } = req.body;
        const file = req.file;
        const form = new FormData();
        form.append("file", fs.createReadStream(file.path));
        form.append("messaging_product", "whatsapp");
        const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/media`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, type: "image", image: { id: uploadRes.data.id }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
        const saved = await Message.create({ chatId: to, from: "me", text: "📷 Imagen", media: "/uploads/" + file.filename });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
    const chats = await Message.aggregate([{ $sort: { timestamp: 1 } }, { $group: { _id: "$chatId", lastMessage: { $last: { $ifNull: ["$text", "📷 Imagen"] } }, lastTime: { $last: "$timestamp" } } }, { $sort: { lastTime: -1 } }]);
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

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server Punto Nemo Secuencial"));