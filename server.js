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
    clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
    });
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

                            // Detectar si es texto normal o una selección de lista/botón
                            if (msg.type === "text") {
                                incomingText = msg.text.body.toLowerCase().trim();
                            } else if (msg.type === "interactive") {
                                // Captura el título de la opción seleccionada en la lista
                                incomingText = msg.interactive.list_reply?.title.toLowerCase().trim() || 
                                               msg.interactive.button_reply?.title.toLowerCase().trim();
                            }

                            if (incomingText) {
                                const saved = await Message.create({ chatId: sender, from: sender, text: incomingText });
                                broadcast({ type: "new_message", message: saved });

                                const flow = await Flow.findOne({ name: "Main Flow" });
                                if (flow && flow.data && flow.data.drawflow) {
                                    const nodes = flow.data.drawflow.Home.data;
                                    let nextNode = null;

                                    // 1. ¿Es un Trigger?
                                    const triggerNode = Object.values(nodes).find(n => 
                                        n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText
                                    );

                                    if (triggerNode) {
                                        const out = triggerNode.outputs.output_1.connections;
                                        if (out.length > 0) nextNode = nodes[out[0].node];
                                    } else {
                                        // 2. ¿Es respuesta a un menú o lista previa?
                                        const session = await Session.findOne({ chatId: sender });
                                        if (session && nodes[session.lastNodeId]) {
                                            const currentNode = nodes[session.lastNodeId];
                                            
                                            // Lógica para Menú Numérico (output_1, output_2...)
                                            const outputKey = `output_${parseInt(incomingText)}`;
                                            if (currentNode.outputs[outputKey]?.connections.length > 0) {
                                                nextNode = nodes[currentNode.outputs[outputKey].connections[0].node];
                                            } else {
                                                // Lógica para Lista de WhatsApp (buscamos por coincidencia de texto)
                                                // Si el texto coincide con alguna 'rowX' del nodo lista
                                                const foundRowKey = Object.keys(currentNode.data).find(k => 
                                                    k.startsWith('row') && currentNode.data[k].toLowerCase().trim() === incomingText
                                                );
                                                if (foundRowKey) {
                                                    const rowIdx = foundRowKey.replace('row', '');
                                                    const outList = currentNode.outputs[`output_${rowIdx}`]?.connections;
                                                    if (outList && outList.length > 0) nextNode = nodes[outList[0].node];
                                                }
                                            }
                                        }
                                    }

                                    // 3. ENVIAR RESPUESTA SEGÚN TIPO DE NODO
                                    if (nextNode) {
                                        let payload = { messaging_product: "whatsapp", to: sender };

                                        if (nextNode.name === 'message' || nextNode.name === 'ia') {
                                            const txt = nextNode.data.info || "Gracias por contactarnos.";
                                            payload.type = "text";
                                            payload.text = { body: txt };
                                            await Session.deleteOne({ chatId: sender });

                                        } else if (nextNode.name === 'menu') {
                                            let menuTxt = `*${nextNode.data.info || "Menú"}* 📋\n\n`;
                                            const opts = Object.keys(nextNode.data).filter(k => k.startsWith('option')).sort();
                                            opts.forEach((k, i) => menuTxt += `${i + 1}️⃣ ${nextNode.data[k]}\n`);
                                            payload.type = "text";
                                            payload.text = { body: menuTxt + "\n_Responde con un número_" };
                                            await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });

                                        } else if (nextNode.name === 'whatsapp_list') {
                                            const rows = Object.keys(nextNode.data)
                                                .filter(k => k.startsWith('row') && nextNode.data[k].trim() !== "")
                                                .map((k, i) => ({ id: `id_${i}`, title: nextNode.data[k].substring(0, 24) }));

                                            payload.type = "interactive";
                                            payload.interactive = {
                                                type: "list",
                                                header: { type: "text", text: "Webs Rápidas" },
                                                body: { text: nextNode.data.list_title || "Elige una opción:" },
                                                footer: { text: "Estamos para ayudarte" },
                                                action: {
                                                    button: nextNode.data.button_text || "Ver Opciones",
                                                    sections: [{ title: "Selecciona una", rows }]
                                                }
                                            };
                                            await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
                                        }

                                        // Envío final a Meta
                                        if (payload.type) {
                                            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, 
                                                payload, 
                                                { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
                                            );
                                            
                                            const logText = payload.text?.body || `[Mensaje Interactivo: ${payload.interactive?.type}]`;
                                            const botSaved = await Message.create({ chatId: sender, from: "me", text: logText });
                                            broadcast({ type: "new_message", message: botSaved });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error("❌ Error Webhook:", e.message); }
    }
    res.sendStatus(200);
});

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

app.post("/api/save-flow", async (req, res) => {
    try {
        await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Error al guardar" }); }
});

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

app.post("/send-message", async (req, res) => {
    const { to, text } = req.body;
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: text }
        }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } });
        const saved = await Message.create({ chatId: to, from: "me", text });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

        const saved = await Message.create({ chatId: to, from: "me", media: "/uploads/" + file.filename });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Error media" }); }
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server activo en puerto 3000"));