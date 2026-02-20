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
app.use("/chat", express.static(chatPath));

const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
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
    media: String,
    timestamp: { type: Date, default: Date.now }
}));

const Session = mongoose.model("Session", new mongoose.Schema({
    chatId: String,
    lastNodeId: String,
    updatedAt: { type: Date, default: Date.now, expires: 3600 }
}));

const Flow = mongoose.model("Flow", new mongoose.Schema({
    name: { type: String, default: "Main Flow" },
    data: { type: Object, required: true }
}));

/* ========================= WEBSOCKET ========================= */
let clients = new Set();
wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
    clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= FUNCIÓN PARA DESCARGAR MEDIOS ========================= */
async function downloadMedia(mediaId, fileName) {
    try {
        // 1. Obtener URL de descarga desde Meta
        const resUrl = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        
        // 2. Descargar el binario de la imagen
        const response = await axios.get(resUrl.data.url, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` },
            responseType: 'arraybuffer'
        });

        const filePath = path.join(uploadsPath, fileName);
        fs.writeFileSync(filePath, response.data);
        return `/uploads/${fileName}`;
    } catch (e) {
        console.error("❌ Error descargando media:", e.message);
        return null;
    }
}

/* ========================= WEBHOOK WHATSAPP ========================= */
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
        try {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    const value = change.value;
                    if (value.messages) {
                        for (const msg of value.messages) {
                            const sender = msg.from;
                            let incomingText = "";
                            let mediaUrl = null;

                            // --- RECEPCIÓN DE TEXTO O INTERACTIVOS ---
                            if (msg.type === "text") {
                                incomingText = msg.text.body.toLowerCase().trim();
                            } else if (msg.type === "interactive") {
                                incomingText = msg.interactive.list_reply?.title.toLowerCase().trim() || 
                                               msg.interactive.button_reply?.title.toLowerCase().trim();
                            } 
                            // --- RECEPCIÓN DE IMÁGENES ---
                            else if (msg.type === "image") {
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

                                // Lógica de Flujo
                                const flow = await Flow.findOne({ name: "Main Flow" });
                                if (flow && flow.data?.drawflow) {
                                    const nodes = flow.data.drawflow.Home.data;
                                    let nextNode = null;

                                    // Buscar Trigger
                                    const triggerNode = Object.values(nodes).find(n => 
                                        n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText
                                    );

                                    if (triggerNode) {
                                        const out = triggerNode.outputs.output_1.connections;
                                        if (out.length > 0) nextNode = nodes[out[0].node];
                                    } else {
                                        // Continuar sesión (Manejo de menús y listas)
                                        const session = await Session.findOne({ chatId: sender });
                                        if (session && nodes[session.lastNodeId]) {
                                            const currentNode = nodes[session.lastNodeId];
                                            
                                            // Respuesta a Lista o Menú
                                            const foundRowKey = Object.keys(currentNode.data).find(k => 
                                                (k.startsWith('row') || k.startsWith('option')) && 
                                                currentNode.data[k].toLowerCase().trim() === incomingText
                                            );
                                            
                                            if (foundRowKey) {
                                                const rowIdx = foundRowKey.replace('row', '').replace('option', '');
                                                const outList = currentNode.outputs[`output_${rowIdx}`]?.connections;
                                                if (outList?.length > 0) nextNode = nodes[outList[0].node];
                                            }
                                        }
                                    }

                                    // Enviar Respuesta automática
                                    if (nextNode) {
                                        let payload = { messaging_product: "whatsapp", to: sender };

                                        if (nextNode.name === 'message' || nextNode.name === 'ia') {
                                            payload.type = "text";
                                            payload.text = { body: nextNode.data.info || "Webs Rápidas: Base S/380" };
                                            await Session.deleteOne({ chatId: sender });

                                        } else if (nextNode.name === 'whatsapp_list') {
                                            const rows = Object.keys(nextNode.data)
                                                .filter(k => k.startsWith('row') && nextNode.data[k].trim() !== "")
                                                .map((k, i) => ({ id: `id_${i}`, title: nextNode.data[k].substring(0, 24) }));

                                            payload.type = "interactive";
                                            payload.interactive = {
                                                type: "list",
                                                header: { type: "text", text: "Menú de Opciones" },
                                                body: { text: nextNode.data.list_title || "Elige una opción:" },
                                                footer: { text: "Webs Rápidas" },
                                                action: {
                                                    button: (nextNode.data.button_text || "Ver Opciones").substring(0, 20),
                                                    sections: [{ title: "Servicios", rows }]
                                                }
                                            };
                                            await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
                                        }

                                        if (payload.type) {
                                            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
                                                headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error("❌ Webhook Error:", e.message); }
    }
    res.sendStatus(200);
});

/* ========================= REST API PARA EL CRM ========================= */
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
    await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
    res.json({ success: true });
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

// Endpoint manual para enviar mensajes desde el CRM
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

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server activo en puerto 3000"));