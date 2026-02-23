const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

// Configuración de WooCommerce (Usa tus llaves de websrapidas.com)
const WooCommerce = new WooCommerceRestApi({
    url: "https://www.aumentar-seguidores.com", 
    consumerKey: process.env.WC_KEY, 
    consumerSecret: process.env.WC_SECRET,
    version: "wc/v3"
});

// Esquema para rastrear quién está esperando validación de pago y link
const PaymentWaiting = mongoose.model("PaymentWaiting", new mongoose.Schema({
    chatId: String,
    productId: String,
    amount: String,
    profileLink: String,
    active: { type: Boolean, default: true },
    waitingForLink: { type: Boolean, default: false }
}));

/* ========================= CONFIGURACIÓN ========================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const chatPath = path.join(__dirname, "chat");
// CAMBIO: Ponemos la carpeta uploads en la raíz para que sea /uploads directamente
const uploadsPath = path.join(__dirname, "uploads"); 

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// CAMBIO: Ahora sí, /uploads apuntará a la carpeta física correcta
app.use("/uploads", express.static(uploadsPath));
app.use(express.static(chatPath));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Mongo conectado - Punto Nemo Estable"))
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
    wss.clients.forEach(c => { 
        if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); 
    });
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
        return null; 
    }
}

/* ========================= WEBHOOK PRINCIPAL (CORREGIDO) ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            
            let incomingText = (
                msg.text?.body || 
                msg.interactive?.list_reply?.title || 
                msg.interactive?.button_reply?.title || 
                ""
            ).trim();

            // AGREGADO: Guardar el mensaje del CLIENTE en la BD y avisar al frontend
            if (incomingText) {
                const savedIncoming = await Message.create({ 
                    chatId: sender, 
                    from: sender, 
                    text: incomingText 
                });
                broadcast({ type: "new_message", message: savedIncoming });
            }

            // 1. INTERCEPTOR DE PAGOS Y LINKS
            const waiting = await PaymentWaiting.findOne({ chatId: sender, active: true });
            
            if (waiting) {
                if (waiting.waitingForLink) {
                    const isLink = incomingText.includes("http") || incomingText.includes(".com") || incomingText.includes("www.");
                    
                    if (isLink) {
                        waiting.profileLink = incomingText;
                        waiting.waitingForLink = false;
                        await waiting.save();
                        
                        await processSequence(sender, { 
                            name: "message", 
                            data: { info: `✅ Link recibido correctamente. ✨\n\n💳 Ahora, para finalizar, por favor envía el Yape por S/${waiting.amount}. El sistema se activará automáticamente al recibir la notificación. 🚀` } 
                        }, {});
                    } else {
                        await processSequence(sender, { 
                            name: "message", 
                            data: { info: "⚠️ Por favor, envía un link válido de tu perfil o publicación para continuar con tu pedido. 🔗" } 
                        }, {});
                    }
                    return res.sendStatus(200);
                }

                await processSequence(sender, { 
                    name: "message", 
                    data: { info: `⏳ Seguimos esperando la confirmación de tu Yape por S/${waiting.amount}. El sistema se activará automáticamente al recibir la notificación. ✨` } 
                }, {});
                return res.sendStatus(200);
            }

            // 2. PROCESAMIENTO NORMAL DE FLUJOS
            const flowDoc = await Flow.findOne({ name: "Main Flow" });
            if (flowDoc && incomingText) {
                const nodes = flowDoc.data.drawflow.Home.data;
                const triggerNode = Object.values(nodes).find(n => n.name === "trigger" && n.data.val?.toLowerCase() === incomingText.toLowerCase());
                
                if (triggerNode) {
                    const nextNodeId = triggerNode.outputs?.output_1?.connections?.[0]?.node;
                    if (nextNodeId) await processSequence(sender, nodes[nextNodeId], nodes);
                }
            }
        }
    }
    res.sendStatus(200);
});

/* ========================= PROCESADOR DE SECUENCIA ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;

    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

    if (node.name === "message" || node.name === "ia") {
        botText = node.data.info || "Servicios Webs Rápidas 🚀";
        payload.type = "text";
        payload.text = { body: botText };
    } 
    else if (node.name === "media") {
        const mediaPath = node.data.url || node.data.media_url || node.data.info || node.data.val;
        const caption = node.data.caption || node.data.text || "";
        
        if (mediaPath) {
            const domain = process.env.RAILWAY_STATIC_URL || "whatsapp-bot2-production-0129.up.railway.app";
            const cleanPath = mediaPath.startsWith('/uploads/') ? mediaPath : `/uploads/${mediaPath.split('/').pop()}`;
            const fullUrl = `https://${domain}${cleanPath}`;

            payload.type = "image";
            payload.image = { link: fullUrl, caption: caption };
            botText = `🖼️ Imagen: ${caption}`;
        }
    }
    else if (node.name === "notify") {
        const myNumber = "51933425911"; 
        const alertText = node.data.info || "Alguien llegó a este punto";

        let notifyPayload = {
            messaging_product: "whatsapp",
            to: myNumber,
            type: "text",
            text: { body: `🔔 *AVISO:* El cliente ${to} llegó al nodo: _${alertText}_` }
        };

        axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, notifyPayload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        }).catch(e => console.error("Error aviso admin:", e.message));

        botText = "🔔 Aviso enviado al admin";

        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }
        return; 
    }
    else if (node.name === "whatsapp_list") {
        try {
            const rows = Object.keys(node.data)
                .filter(k => k.startsWith("row") && node.data[k])
                .map((k) => {
                    const rowNum = k.replace("row", ""); 
                    const descriptionText = node.data[`desc${rowNum}`] || "";

                    return { 
                        id: `row_${node.id}_${rowNum}`, 
                        title: node.data[k].toString().substring(0, 24),
                        description: descriptionText.toString().substring(0, 72) 
                    };
                });

            if (rows.length === 0) return;

            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                body: { text: node.data.list_title || "Selecciona una de nuestras opciones:" },
                action: { 
                    button: (node.data.button_text || "Ver opciones").substring(0, 20), 
                    sections: [{ title: "Servicios", rows }] 
                }
            };
            botText = "📋 Menú enviado";
        } catch (e) {
            console.error("❌ Error en lista:", e.message);
        }
    }
    else if (node.name === "payment_validation") {
            // Activamos espera de link y pago
            await PaymentWaiting.findOneAndUpdate(
                { chatId: to },
                { 
                    productId: node.data.product_id, 
                    amount: node.data.amount, 
                    active: true,
                    waitingForLink: true 
                },
                { upsert: true }
            );
            botText = `🚀 ¡Excelente elección!\n\n🔗 Para procesar tu pedido, por favor pega aquí el *link de tu cuenta o publicación* donde enviaremos el servicio. ✨`;
            payload.type = "text";
            payload.text = { body: botText };
    }

    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        const savedBot = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: savedBot });

        if (node.name === "whatsapp_list" || node.name === "payment_validation") return; 

        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            await new Promise(r => setTimeout(r, 1500)); 
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }
    } catch (err) { 
        console.error("❌ Error en processSequence:", err.message); 
    }
}

/* ========================= WEBHOOK YAPE (MACRODROID) ========================= */
app.post("/webhook-yape", async (req, res) => {
    const { texto } = req.body; 
    console.log(`📢 Texto recibido de MacroDroid: "${texto}"`);

    if (!texto) return res.sendStatus(200);

    try {
        const activeWaitings = await PaymentWaiting.find({ active: true });
        const montoRecibido = texto.match(/\d+/)?.[0]; 

        for (const waiting of activeWaitings) {
            const montoEsperado = waiting.amount.match(/\d+/)?.[0]; 

            if (montoRecibido && montoRecibido === montoEsperado) {
                console.log(`✅ ¡Match! Procesando pedido para ${waiting.chatId}`);
                
                await PaymentWaiting.updateOne({ _id: waiting._id }, { active: false });

                // Sincronización con functions.php (Meta Data del Item)
                /* ========================= WEBHOOK YAPE (VERSION SMM COMPLETA) ========================= */
                // ... dentro de tu bucle de waiting ...
                                await WooCommerce.post("orders", {
                                    payment_method: "bacs", 
                                    payment_method_title: "Yape Automático ✅",
                                    set_paid: true, // Esto dispara el hook de pago completado
                                    billing: { phone: waiting.chatId },
                                    line_items: [{ 
                                        product_id: waiting.productId, 
                                        quantity: 1,
                                        meta_data: [
                                            { key: "Link del Perfil", value: waiting.profileLink }, // Visual Admin
                                            { key: "Link del perfil", value: waiting.profileLink }, // Activador SMM
                                            { key: "profile_link", value: waiting.profileLink }     // Clave interna del functions.php
                                        ]
                                    }],
                                    customer_note: `Bot: Pedido SMM activado para ${waiting.profileLink}`
                                });
                // ... resto del código ...

                await processSequence(waiting.chatId, { 
                    name: "message", 
                    data: { info: "✅ ¡Yape verificado! 🚀 Tu pedido ya está en proceso en aumentar-seguidores.com. ✨" } 
                }, {});
                return res.sendStatus(200);
            }
        }
    } catch (err) {
        console.error("❌ Error Yape:", err.message);
    }
    res.sendStatus(200);
});

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
    const { to, text, mediaUrl } = req.body;
    try {
        let payload = { messaging_product: "whatsapp", to };
        if (mediaUrl) {
            const domain = process.env.RAILWAY_STATIC_URL || req.get('host');
            const fullUrl = `https://${domain}${mediaUrl}`;
            payload.type = "image";
            payload.image = { link: fullUrl, caption: text || "" };
        } else {
            payload.type = "text";
            payload.text = { body: text };
        }
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        const saved = await Message.create({ chatId: to, from: "me", text: text || "📷 Imagen", media: mediaUrl });
        broadcast({ type: "new_message", message: saved });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/chats", async (req, res) => {
    const chats = await Message.aggregate([
        { $sort: { timestamp: 1 } }, 
        { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } }, 
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

/* ========================= INICIO DEL SERVIDOR ========================= */
server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("🚀 Server Punto Nemo Estable - Carpeta uploads corregida");
});

// Rutas de Descarga e Importación
app.get("/api/download-flow", async (req, res) => {
    try {
        const flow = await Flow.findOne({ name: "Main Flow" });
        if (!flow) return res.status(404).send("No hay flujo guardado.");
        const flowData = JSON.stringify(flow.data, null, 4);
        res.setHeader('Content-disposition', 'attachment; filename=flujo_nemo.json');
        res.setHeader('Content-type', 'application/json');
        res.send(flowData);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/import-flow", express.json({limit: '50mb'}), async (req, res) => {
    try {
        const flowData = req.body;
        if (!flowData || !flowData.drawflow) {
            return res.status(400).json({ error: "Formato de flujo inválido" });
        }
        await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: flowData }, { upsert: true });
        res.json({ success: true, message: "Flujo importado correctamente" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});