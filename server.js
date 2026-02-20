const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use(express.static(chatPath));
app.use("/uploads", express.static(path.join(chatPath, "uploads")));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado"))
    .catch(err => console.error("❌ Error Mongo:", err));

const Flow = mongoose.model("Flow", new mongoose.Schema({ name: String, data: Object }));
const Message = mongoose.model("Message", new mongoose.Schema({ chatId: String, from: String, text: String, timestamp: { type: Date, default: Date.now } }));

function broadcast(data) {
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); });
}

/* ========================= WEBHOOK WHATSAPP ========================= */
app.post("/webhook", async (req, res) => {
    const data = req.body;
    if (data.object === "whatsapp_business_account" && data.entry?.[0].changes?.[0].value.messages?.[0]) {
        const msg = data.entry[0].changes[0].value.messages[0];
        const sender = msg.from;
        const incomingText = (msg.text?.body || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "").toLowerCase().trim();

        const savedMsg = await Message.create({ chatId: sender, from: sender, text: incomingText });
        broadcast({ type: "new_message", message: savedMsg });

        try {
            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc && flowDoc.data.drawflow.Home.data) {
                const nodes = flowDoc.data.drawflow.Home.data;
                const triggerNode = Object.values(nodes).find(n => n.name === "trigger" && n.data.val.toLowerCase().trim() === incomingText);

                if (triggerNode) {
                    const conn = triggerNode.outputs.output_1.connections[0];
                    if (conn) {
                        const nextNode = nodes[conn.node];
                        await processNode(sender, nextNode, nodes);
                    }
                }
            }
        } catch (e) { console.error("❌ Error Webhook:", e.message); }
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
            header: { type: "text", text: "Opciones" },
            body: { text: node.data.list_title || "Selecciona una:" },
            footer: { text: "Webs Rápidas" },
            action: { button: node.data.button_text || "Ver", sections: [{ title: "Menú", rows }] }
        };
    }

    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        broadcast({ type: "new_message", message: { chatId: to, from: "me", text: "Bot respondió" } });
    } catch (err) { console.error("❌ Error API Meta:", err.response?.data || err.message); }
}

/* ========================= API REST ========================= */
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

server.listen(process.env.PORT || 3000, () => console.log("🚀 Servidor en puerto 3000"));