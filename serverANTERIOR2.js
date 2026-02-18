// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
const WebSocket = require("ws");
const fetch = require("node-fetch"); // usando node-fetch@2
const multer = require("multer");

// Modelos (asegúrate de tenerlos en /models)
const User = require("./models/User");
const Flow = require("./models/Flow");
const auth = require("./middleware/auth");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ========================
// MongoDB
// ========================
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/saasflow";
mongoose.connect(mongoURI)
  .then(()=>console.log("MongoDB conectado"))
  .catch(err=>console.error("Error MongoDB:", err));

// ========================
// WebSocket
// ========================
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor corriendo en puerto", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ noServer: true });
const wsClients = new Set();

wss.on("connection", ws => {
  wsClients.add(ws);
  console.log("Frontend conectado via WebSocket");

  ws.on("close", () => wsClients.delete(ws));
});

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit("connection", ws, request);
  });
});

// ========================
// Auth y API
// ========================

/* REGISTRO */
app.post("/register", async (req,res)=>{
  const user = new User(req.body);
  await user.save();
  res.json({status:"registered"});
});

/* LOGIN */
app.post("/login", async (req,res)=>{
  const user = await User.findOne({email:req.body.email});
  if(!user) return res.status(400).json({error:"User not found"});
  const valid = await user.comparePassword(req.body.password);
  if(!valid) return res.status(400).json({error:"Wrong password"});

  const token = jwt.sign({id:user._id}, process.env.JWT_SECRET || "secretkey");
  res.json({token});
});

/* GUARDAR FLOW */
app.post("/save-flow", auth, async (req,res)=>{
  await Flow.findOneAndUpdate(
    {userId:req.user.id},
    {data:req.body},
    {upsert:true}
  );
  res.json({status:"saved"});
});

/* OBTENER FLOW */
app.get("/get-flow", auth, async (req,res)=>{
  const flow = await Flow.findOne({userId:req.user.id});
  res.json(flow?.data || {});
});

/* MOTOR INTELIGENTE */
app.post("/execute", async (req,res)=>{
  const {userId,message} = req.body;
  const flow = await Flow.findOne({userId});
  if(!flow) return res.json({reply:"No flow configured"});

  const nodes = flow.data.drawflow.Home.data;
  let triggerNode = Object.values(nodes).find(n=>n.name==="trigger");
  if(!triggerNode) return res.json({reply:"No trigger"});

  const keyword = triggerNode.data.keyword || "";
  if(!message.includes(keyword))
    return res.json({reply:"No match"});

  let nextId = triggerNode.outputs.output_1.connections[0]?.node;
  while(nextId){
    const node = nodes[nextId];
    if(node.name==="message"){
      return res.json({reply: node.data.text});
    }
    if(node.name==="menu"){
      return res.json({
        reply: node.data.question,
        buttons: node.data.options
      });
    }
    nextId = node.outputs.output_1?.connections[0]?.node;
  }

  res.json({reply:"End of flow"});
});

// ========================
// Chat WhatsApp Web
// ========================

// Servir frontend del chat en /chat
app.use("/chat", express.static(path.join(__dirname, "chat")));

// Variables para el frontend (meta API)
app.get("/chat/config.js", (req,res)=>{
  res.type("application/javascript");
  res.send(`
    const PHONE_NUMBER_ID = "${process.env.PHONE_NUMBER_ID}";
    const ACCESS_TOKEN = "${process.env.ACCESS_TOKEN}";
  `);
});

// ========================
// Webhook WhatsApp
// ========================

app.get("/webhook", (req,res)=>{
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if(mode && token){
    if(mode === "subscribe" && token === verify_token){
      console.log("Webhook verificado ✅");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

app.post("/webhook", async (req,res)=>{
  // Aquí llegan mensajes y estados de WhatsApp
  console.log("Webhook recibido:", JSON.stringify(req.body));
  res.sendStatus(200);

  // Ejemplo: emitir mensaje a frontend
  if(req.body.entry){
    req.body.entry.forEach(entry=>{
      if(entry.changes){
        entry.changes.forEach(change=>{
          if(change.value && change.value.messages){
            change.value.messages.forEach(msg=>{
              wsClients.forEach(ws=>{
                ws.send(JSON.stringify(msg));
              });
            });
          }
        });
      }
    });
  }
});

// ========================
// Envío de mensajes a WhatsApp API
// ========================
async function sendWhatsAppMessage(to,text){
  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {body:text}
  };
  const resp = await fetch(url,{
    method:"POST",
    body: JSON.stringify(body),
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${process.env.ACCESS_TOKEN}`
    }
  });
  return resp.json();
}

// ========================
// Subida de archivos (ejemplo)
// ========================
const upload = multer({ dest: "uploads/" });
app.post("/chat/upload", upload.single("file"), (req,res)=>{
  res.json({status:"ok", file:req.file});
});

// ========================
// End of server
// ========================
