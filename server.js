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

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));
const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => res.redirect("/chat/index.html"));

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Mongo OK"));

const messageSchema = new mongoose.Schema({ chatId: String, from: String, text: String, media: String, timestamp: { type: Date, default: Date.now } });
const Message = mongoose.model("Message", messageSchema);

const sessionSchema = new mongoose.Schema({ chatId: String, lastNodeId: String, updatedAt: { type: Date, default: Date.now, expires: 3600 } });
const Session = mongoose.model("Session", sessionSchema);

const flowSchema = new mongoose.Schema({ name: { type: String, default: "Main Flow" }, data: { type: Object, required: true }, updatedAt: { type: Date, default: Date.now } });
const Flow = mongoose.model("Flow", flowSchema);

/* ================= WS ================= */
let clients = new Set();
wss.on("connection", ws => { clients.add(ws); ws.on("close", () => clients.delete(ws)); });
const broadcast = data => clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(JSON.stringify(data)));

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = "";
            let selectionId = "";

            if (msg.type === "text") incomingText = msg.text.body.toLowerCase().trim();
            else if (msg.type === "interactive") {
                selectionId = msg.interactive.list_reply?.id;
                incomingText = msg.interactive.list_reply?.title.toLowerCase().trim();
            }

            if (incomingText || selectionId) {
              const saved = await Message.create({ chatId: sender, from: sender, text: incomingText });
              broadcast({ type: "new_message", message: saved });

              const flow = await Flow.findOne({ name: "Main Flow" });
              if (flow) {
                const nodes = flow.data.drawflow.Home.data;
                let nextNode = null;

                const triggerNode = Object.values(nodes).find(n => n.name === 'trigger' && n.data.val?.toLowerCase().trim() === incomingText);
                if (triggerNode) {
                  nextNode = nodes[triggerNode.outputs.output_1.connections[0]?.node];
                } else {
                  const session = await Session.findOne({ chatId: sender });
                  if (session && nodes[session.lastNodeId]) {
                    const idx = selectionId ? selectionId.split('_')[1] : parseInt(incomingText);
                    const out = nodes[session.lastNodeId].outputs[`output_${idx}`];
                    if (out) nextNode = nodes[out.connections[0]?.node];
                  }
                }

                if (nextNode) {
                  let payload = { messaging_product: "whatsapp", to: sender };
                  if (nextNode.name === 'message' || nextNode.name === 'ia') {
                    payload.text = { body: nextNode.data.info || "Hola, ¿en qué te ayudo?" };
                    await Session.deleteOne({ chatId: sender });
                  } else if (nextNode.name === 'menu') {
                    const options = Object.keys(nextNode.data)
                      .filter(k => k.startsWith('option') && nextNode.data[k])
                      .map(k => ({ id: `row_${k.replace('option','')}`, title: nextNode.data[k].substring(0, 24) }));

                    if (options.length > 0) {
                      payload.type = "interactive";
                      payload.interactive = {
                        type: "list",
                        header: { type: "text", text: "Menú" },
                        body: { text: nextNode.data.info || "Elige una opción" },
                        footer: { text: "Webs Rápidas 🚀" },
                        action: { button: "Ver opciones", sections: [{ title: "Servicios", rows: options }] }
                      };
                      await Session.findOneAndUpdate({ chatId: sender }, { lastNodeId: nextNode.id }, { upsert: true });
                    }
                  }
                  
                  if (payload.text || payload.interactive) {
                    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
                      headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
                    });
                    const botMsg = await Message.create({ chatId: sender, from: "me", text: payload.interactive ? payload.interactive.body.text : payload.text.body });
                    broadcast({ type: "new_message", message: botMsg });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

/* ================= APIS ================= */
app.get("/chats", async (req, res) => {
  const chats = await Message.aggregate([{ $sort: { timestamp: 1 } }, { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } }, { $sort: { lastTime: -1 } }]);
  res.json(chats);
});
app.get("/messages/:chatId", async (req, res) => res.json(await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 })));
app.post("/api/save-flow", async (req, res) => { await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: req.body }, { upsert: true }); res.json({ success: true }); });
app.get("/api/get-flow", async (req, res) => res.json((await Flow.findOne({ name: "Main Flow" }))?.data));

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("🚀 Server Ready"));