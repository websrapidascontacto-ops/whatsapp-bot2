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
const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

// Configuración de WooCommerce (Usa tus llaves de websrapidas.com)
const WooCommerce = new WooCommerceRestApi({
  url: "https://www.websrapidas.com", 
  consumerKey: process.env.WC_KEY, 
  consumerSecret: process.env.WC_SECRET,
  version: "wc/v3"
});

// Esquema para rastrear quién está esperando validación de pago
const PaymentWaiting = mongoose.model("PaymentWaiting", new mongoose.Schema({
    chatId: String,
    productId: String,
    amount: String,
    active: { type: Boolean, default: true }
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
async function buscarPagoEnEmail(monto) {
    const config = {
        imap: {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD, // Contraseña de aplicación
            host: 'imap.gmail.com', port: 993, tls: true, authTimeout: 3000
        }
    };

    try {
        const connection = await imap.connect(config);
        await connection.openBox('INBOX');
        const searchCriteria = ['UNSEEN']; // Solo correos no leídos
        const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: true };
        const messages = await connection.search(searchCriteria, fetchOptions);

        for (const item of messages) {
            const all = item.parts.find(part => part.which === 'TEXT');
            const mail = await simpleParser(all.body);
            // Validamos que el monto aparezca en el texto del correo
            if (mail.text.includes(monto)) {
                connection.end();
                return true;
            }
        }
        connection.end();
        return false;
    } catch (e) { console.error("Error IMAP:", e); return false; }
}
/* ========================= WEBHOOK PRINCIPAL ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = (msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "").trim();
            let mediaUrl = null;
                const sender = msg.from;
                            
                            // --- NUEVO: INTERCEPTOR DE PAGOS ---
                            const waiting = await PaymentWaiting.findOne({ chatId: sender, active: true });
                            if (waiting && (msg.type === "image" || msg.text)) {
                                console.log(`🧐 Validando pago de ${sender} por S/${waiting.amount}...`);
                                
                                const pagoConfirmado = await buscarPagoEnEmail(waiting.amount);

                                if (pagoConfirmado) {
                                    await PaymentWaiting.updateOne({ _id: waiting._id }, { active: false });
                                    
                                    // Crear pedido en WooCommerce (websrapidas.com)
                                    try {
                                        await WooCommerce.post("orders", {
                                            payment_method: "bacs",
                                            payment_method_title: "Validación Automática",
                                            set_paid: true,
                                            billing: { phone: sender },
                                            line_items: [{ product_id: waiting.productId, quantity: 1 }]
                                        });
                                        
                                        // Responder al cliente
                                        await processSequence(sender, { name: "message", data: { info: "✅ ¡Pago verificado! Tu pedido de seguidores ha sido enviado a WooCommerce. 🚀" } }, {});
                                    } catch (err) {
                                        console.error("Error Woo:", err.message);
                                    }
                                } else {
                                    await processSequence(sender, { name: "message", data: { info: "⏳ Aún no recibimos el correo de confirmación. Por favor, asegúrate de haber enviado el monto correcto o espera unos segundos y vuelve a intentarlo." } }, {});
                                }
                                return res.sendStatus(200); // Detiene el resto de la lógica para este mensaje
                            }
                            // --- FIN INTERCEPTOR ---
            if (msg.type === "image") {
                mediaUrl = await downloadMedia(msg.image.id, `${Date.now()}-${sender}.jpg`);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

            const saved = await Message.create({ chatId: sender, from: sender, text: incomingText, media: mediaUrl });
            broadcast({ type: "new_message", message: saved });
            
            try {
                const flowDoc = await Flow.findOne({ name: "Main Flow" });
                if (flowDoc && incomingText) {
                    const nodes = flowDoc.data.drawflow.Home.data;

                   // --- 1. LISTA (Prioridad) ---
const activeListNode = Object.values(nodes).find(n => {
    if (n.name !== "whatsapp_list") return false;
    return Object.keys(n.data).some(k => 
        k.startsWith("row") && n.data[k]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
    );
});

if (activeListNode) {
    const rowKey = Object.keys(activeListNode.data).find(k => 
        k.startsWith("row") && activeListNode.data[k]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
    );
    
    if (rowKey) {
        // CORRECCIÓN: Usamos una expresión regular para extraer SOLO los números
        const outNum = rowKey.match(/\d+/)[0]; 
        const conn = activeListNode.outputs[`output_${outNum}`]?.connections[0];
        
        if (conn) {
            console.log(`✅ Coincidencia: ${incomingText} -> Salida: ${outNum}`);
            await processSequence(sender, nodes[conn.node], nodes);
            return res.sendStatus(200);
        }
    }
}

                    // --- 2. TRIGGER ---
                    const triggerNode = Object.values(nodes).find(n => 
                        n.name === "trigger" && n.data.val?.toLowerCase() === incomingText.toLowerCase()
                    );
                    
                    if (triggerNode) {
                        const firstConn = triggerNode.outputs?.output_1?.connections?.[0];
                        if (firstConn) {
                            const nextNode = nodes[firstConn.node];
                            console.log("🚀 Trigger activado. Saltando a nodo:", nextNode.name);
                            await processSequence(sender, nextNode, nodes);
                            return res.sendStatus(200);
                        }
                    }
                }
            } catch (err) { 
                console.error("❌ Error Webhook Logic:", err.message); 
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
            // Limpiamos la ruta para que no tenga dobles slashes
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

    // --- ESTO ES LO QUE DEBES ASEGURARTE QUE ESTÉ ---
    // Si el nodo notify tiene algo conectado, que siga al siguiente nodo inmediatamente
    if (node.outputs?.output_1?.connections?.[0]) {
        const nextNodeId = node.outputs.output_1.connections[0].node;
        return await processSequence(to, allNodes[nextNodeId], allNodes);
    }
    return; // Si no hay conexión, se detiene aquí.
}
   else if (node.name === "whatsapp_list") {
    try {
        const rows = Object.keys(node.data)
            .filter(k => k.startsWith("row") && node.data[k])
            .map((k) => {
                const rowNum = k.replace("row", ""); // Mantiene el número original (1, 2, 3...)
                const descriptionText = node.data[`desc${rowNum}`] || "";

                return { 
                    id: `row_${node.id}_${rowNum}`, // ID sincronizado con la salida
                    title: node.data[k].toString().substring(0, 24),
                    description: descriptionText.toString().substring(0, 72) // Ahora sí se envía
                };
            });

            if (rows.length === 0) {
                console.error("❌ Error: La lista no tiene filas configuradas");
                return;
            }

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
            console.error("❌ Error construyendo payload de lista:", e.message);
        }
    }
    else if (node.name === "payment_validation") {
            // Activamos la espera de pago para este usuario
            await PaymentWaiting.findOneAndUpdate(
                { chatId: to },
                { productId: node.data.product_id, amount: node.data.amount, active: true },
                { upsert: true }
            );
            botText = `💳 Por favor, envía la captura de tu comprobante por S/${node.data.amount}. Validaremos tu pago automáticamente. ✨`;
            payload.type = "text";
            payload.text = { body: botText };
    }
    try {
        // 1. Enviamos el mensaje al API de Facebook
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // 2. Guardamos en la DB y avisamos al chat web
        const savedBot = await Message.create({ chatId: to, from: "me", text: botText });
        broadcast({ type: "new_message", message: savedBot });

        // --- LÓGICA DE AVANCE AUTOMÁTICO (CORREGIDA) ---
        
        // Si el nodo actual es una LISTA, nos detenemos aquí (esperamos respuesta del usuario)
        if (node.name === "whatsapp_list") return; 

        // Si el nodo actual tiene una conexión de salida, saltamos al siguiente automáticamente
        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            
            // Esperamos 1.5 segundos para que no lleguen todos los mensajes pegados
            await new Promise(r => setTimeout(r, 1500)); 
            
            // Llamamos recursivamente para procesar el siguiente nodo (tu Lista)
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }
    } catch (err) { 
        console.error("❌ Error en processSequence:", err.response?.data || err.message); 
    }
}
/* ========================= WEBHOOK YAPE (MACRODROID) ========================= */
app.post("/webhook-yape", async (req, res) => {
    const { texto, emisor } = req.body; 
    console.log(`📢 Notificación de Yape: ${texto} de ${emisor}`);

    try {
        // Buscamos si algún cliente está esperando validación
        const activeWaitings = await PaymentWaiting.find({ active: true });

        for (const waiting of activeWaitings) {
            // Si el texto de la notificación contiene el monto (ej: "10.00")
            if (texto.includes(waiting.amount)) {
                console.log(`✅ ¡Pago confirmado para ${waiting.chatId}!`);

                // 1. Marcar como procesado
                await PaymentWaiting.updateOne({ _id: waiting._id }, { active: false });

                // 2. Crear pedido en WooCommerce (websrapidas.com)
                await WooCommerce.post("orders", {
                    payment_method: "yape_automation",
                    payment_method_title: "Yape Automático (MacroDroid)",
                    set_paid: true,
                    billing: { phone: waiting.chatId },
                    line_items: [{ product_id: waiting.productId, quantity: 1 }]
                });

                // 3. Respuesta automática al cliente
                await processSequence(waiting.chatId, { 
                    name: "message", 
                    data: { info: "✅ ¡Yape verificado! 🔝 Tu pedido de seguidores ha sido recibido y está en camino. ¡Gracias por tu compra! 😊✨" } 
                }, {});
                
                break;
            }
        }
    } catch (err) {
        console.error("❌ Error Webhook Yape:", err.message);
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