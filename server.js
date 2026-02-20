require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================= CONFIG ================= */

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPath = path.join(__dirname, "chat");
app.use("/chat", express.static(chatPath));

const uploadsPath = path.join(chatPath, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => res.redirect("/chat/index.html"));

/* ================= MONGODB ================= */

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI no definida");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo conectado"))
  .catch(err => {
    console.error("❌ Error Mongo:", err);
    process.exit(1);
  });

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

/* ================= WEBSOCKET ================= */

let clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
  clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(data));
    }
  });
}

/* ================= GUARDAR FLUJO ================= */

app.post("/api/save-flow", async (req, res) => {
  try {
    await Flow.findOneAndUpdate(
      { name: "Main Flow" },
      { data: req.body },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error guardando flujo:", error);
    res.status(500).json({ success: false });
  }
});

app.get("/api/get-flow", async (req, res) => {
  try {
    const flow = await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
  } catch (error) {
    console.error("❌ Error obteniendo flujo:", error);
    res.status(500).json(null);
  }
});

/* ================= SERVER ================= */

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("🚀 Server activo");
});