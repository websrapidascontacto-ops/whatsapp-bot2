if (!process.env.ACCESS_TOKEN) {
    console.error("❌ ACCESS_TOKEN no definido");
}

if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY no definido");
}

if (!process.env.WC_KEY || !process.env.WC_SECRET) {
    console.error("❌ WooCommerce keys no definidas");
}
const conversationMemory = new Map();

function updateMemory(chatId, key, value) {
    if (!conversationMemory.has(chatId)) {
        conversationMemory.set(chatId, {});
    }

    conversationMemory.get(chatId)[key] = value;
}
const rateLimitMap = new Map();

function checkRateLimit(chatId) {
    const now = Date.now();
    const last = rateLimitMap.get(chatId);

    if (last && now - last < 2500) {
        return false;
    }

    rateLimitMap.set(chatId, now);
    return true;
}
const { ejecutarIAsola } = require("./ai/aiEngine");
const mongoose = require("mongoose");
const ReplaySchema = new mongoose.Schema({
    messageId: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now, expires: 600 }
});

const ReplayCache = mongoose.models.ReplayCache ||
mongoose.model("ReplayCache", ReplaySchema);
const ADMIN_NUMBER = "51933425911";
const express = require("express");
const http = require("http");
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
// Esquema actualizado
const PaymentWaiting = mongoose.model("PaymentWaiting", new mongoose.Schema({
    chatId: String,
    productId: String,
    amount: String,
    profileLink: String,
    paymentImage: String,

    active: { type: Boolean, default: true },
    waitingForLink: { type: Boolean, default: false },
    waitingForProof: { type: Boolean, default: false }
}));
setInterval(() => {

    const now = Date.now();

    for (const [chatId, data] of conversationMemory.entries()) {

        if (!data.lastTime || now - data.lastTime > 3600000) {
            conversationMemory.delete(chatId);
        }

    }

}, 3600000);
/* ========================= CONFIGURACIÓN ========================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const chatPath = path.join(__dirname, "chat");
const uploadsPath = path.join(__dirname, "uploads"); 

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use("/uploads", express.static(uploadsPath));
app.use(express.static(chatPath));
// En server.js
app.use(express.static('public'));

/* ========================= MONGODB ========================= */
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
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
    name: { type: String, required: true, unique: true },
    data: { type: Object, required: true },
    isMain: { type: Boolean, default: false } 
}));
const UserStatus = mongoose.model("UserStatus", new mongoose.Schema({
    chatId: String,
    lastNodeId: String,
    updatedAt: Date
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
/* ========================= PROCESADOR DE SECUENCIA ========================= */
async function processSequence(to, node, allNodes) {
    if (!node) return;

    // 📍 GUARDAR ESTADO PARA LA IA (Contexto)
    try {
        await UserStatus.updateOne(
            { chatId: to },
            { lastNodeId: node.id.toString(), updatedAt: Date.now() },
            { upsert: true }
        );
    } catch (err) {
        console.error("❌ Error al guardar estado:", err.message);
    }

    let payload = { messaging_product: "whatsapp", to };
    let botText = "";

    // 1. NODO DE TEXTO O IA
    if (node.name === "message" || node.name === "ia") {
        botText = node.data.info || "Servicios Webs Rápidas 🚀";
        payload.type = "text";
        payload.text = { body: botText };
    } 
    // 2. NODO DE IMAGEN / MEDIA
else if (node.name === "media" || node.name === "image") {
        const pathFromNode = node.data.url || node.data.media_url || node.data.info || node.data.val;
        const caption = node.data.caption || node.data.text || "";

        if (pathFromNode) {
            let fullUrl = pathFromNode;

            if (!pathFromNode.startsWith('http')) {
                // 1. Railway usa RAILWAY_PUBLIC_DOMAIN (según tu imagen)
                // Si por alguna razón está vacía, usamos el link de respaldo
                const domain = process.env.RAILWAY_PUBLIC_DOMAIN || "whatsapp-bot2-production-0129.up.railway.app";
                
                // 2. Quitamos barras duplicadas si las hay
                const cleanPath = pathFromNode.startsWith('/') ? pathFromNode : `/${pathFromNode}`;
                
                // 3. WhatsApp requiere HTTPS obligatoriamente
                fullUrl = `https://${domain}${cleanPath}`;
            }

            console.log("🚀 URL Generada para WhatsApp:", fullUrl);

            payload.type = "image";
            payload.image = { 
                link: fullUrl, 
                caption: caption 
            };
            botText = `🖼️ Imagen enviada: ${caption}`;
        } else {
            payload.type = "text";
            payload.text = { body: caption || "⚠️ Error: Archivo de imagen no encontrado." };
            botText = payload.text.body;
        }
    }
    // 3. NODO DE NOTIFICACIÓN
    else if (node.name === "notify") {
        const myNumber = "51933425911"; 
        const alertText = node.data.info || "Alguien llegó a este punto";
        let notifyPayload = {
            messaging_product: "whatsapp", to: myNumber, type: "text",
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
    // 4. NODO DE LISTA FILTRADA (TU LÓGICA COMPLETA)
    else if (node.name === "whatsapp_list") {
        try {
            const rows = [];
            for (let i = 1; i <= 10; i++) {
                const rowTitle = node.data[`row${i}`];
                if (rowTitle && rowTitle.toString().trim() !== "") {
                    const descriptionText = node.data[`desc${i}`] || "";
                    rows.push({
                        id: `row_${node.id}_${i}`,
                        title: rowTitle.toString().substring(0, 24).trim(),
                        description: descriptionText.toString().substring(0, 72).trim()
                    });
                }
            }

            if (rows.length === 0) return;

            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                header: { type: "text", text: "Opciones Disponibles" },
                body: { text: (node.data.body || "Selecciona una opción de la lista:").substring(0, 1024) },
                footer: { text: "🚀" },
                action: { 
                    button: (node.data.btn || "Ver Menú").substring(0, 20), 
                    sections: [{ title: "Servicios", rows: rows }] 
                }
            };
            botText = "📋 Menú de lista filtrado enviado";
        } catch (e) { 
            console.error("❌ Error en construcción de lista:", e.message); 
        }
    }
    // 5. NODO DE VALIDACIÓN DE PAGO (TU LÓGICA COMPLETA)
    else if (node.name === "payment_validation") {
        await PaymentWaiting.findOneAndUpdate(
            { chatId: to },
            { 
                productId: node.data.product_id, 
                amount: node.data.amount, 
                active: true, 
                waitingForLink: true,
            },
            { upsert: true }
        );
        botText = `🚀 ¡Excelente elección!\n\n🔗 Para procesar tu pedido, por favor pega aquí el *link de tu cuenta o publicación* donde enviaremos el servicio. ✨`;
        payload.type = "text";
        payload.text = { body: botText };
    }

    // --- BLOQUE DE ENVÍO Y ENCADENAMIENTO (SIN OMITIR NADA) ---
    try {
        // Envío a Meta
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, payload, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });

        // Registro en CRM/DB
        const savedBot = await Message.create({ chatId: to, from: "bot", text: botText });
        broadcast({ type: "new_message", message: { ...savedBot._doc, id: to } });

        // Si es lista o pago, aquí cortamos porque el usuario debe interactuar
        if (node.name === "whatsapp_list" || node.name === "payment_validation") return; 

        // Si el nodo tiene una conexión de salida, esperamos 1.5s y mandamos el siguiente
        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            await new Promise(r => setTimeout(r, 1500)); 
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }
    } catch (err) { 
        console.error("❌ Error final processSequence:", err.response?.data || err.message); 
    }
}
app.post("/webhook", async (req, res) => {

    res.sendStatus(200);

    try {

        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return;

        for (const msg of value.messages) {

            try {

                const messageId = msg.id;

                if (messageId) {
                    const exists = await ReplayCache.findOne({ messageId });

                    if (exists) continue;

                    await ReplayCache.findOneAndUpdate(
                        { messageId },
                        { messageId },
                        { upsert: true }
                    );
                }

                const sender = msg.from;

                if (!checkRateLimit(sender)) {
                    console.log("Rate limit activado:", sender);
                    continue;
                }

                let incomingText = (
                    msg.text?.body ||
                    msg.interactive?.list_reply?.title ||
                    msg.interactive?.button_reply?.title ||
                    ""
                ).trim();

                let mediaPath = null;

                if (msg.type === "image") {

                    const mediaId = msg.image?.id;
                    const fileName = `whatsapp_${Date.now()}.jpg`;

                    if (mediaId) {
                        mediaPath = await downloadMedia(mediaId, fileName);
                    }

                    if (!incomingText) {
                        incomingText = msg.image?.caption || "📷 Imagen recibida";
                    }
                }

                if (!incomingText && !mediaPath) continue;

                /*
                =========================
                PAYMENT WAITING
                =========================
                */

                const waiting = await PaymentWaiting.findOne({
                    chatId: sender,
                    active: true
                });

                if (waiting) {

                    if (incomingText && incomingText.toLowerCase().includes("cancelar")) {
                        waiting.active = false;
                        await waiting.save();
                        await sendWhatsAppMessage(sender, "❌ Pago cancelado.");
                        continue;
                    }

                    if (mediaPath) {
                        waiting.paymentImage = mediaPath;
                        waiting.waitingForProof = false;
                        await waiting.save();

                        await sendWhatsAppMessage(sender, "📸 Comprobante recibido. En revisión.");
                        await notifyAdmin(waiting);

                        continue;
                    }

                    await sendWhatsAppMessage(sender, "📸 Envía tu comprobante o escribe CANCELAR.");
                    continue;
                }

                /*
                =========================
                ADMIN CONTROL
                =========================
                */

                if (sender === ADMIN_NUMBER && incomingText) {

                    const adminText = incomingText.trim().toUpperCase();

                    // =========================
                    // APROBAR PAGO
                    // =========================
                    if (adminText.startsWith("APROBAR")) {

                        const parts = adminText.split(" ");
                        const pedidoId = parts[1];
                        if (!pedidoId) continue;

                        const waiting = await PaymentWaiting.findById(pedidoId);

                        if (!waiting || !waiting.active) {
                            await enviarWhatsApp(sender, "❌ Pedido no encontrado o ya procesado.");
                            continue;
                        }

                        await WooCommerce.post("orders", {
                            payment_method: "bacs",
                            payment_method_title: "Yape Manual ✅",
                            status: "processing",
                            billing: { phone: waiting.chatId },
                            line_items: [{
                                product_id: waiting.productId,
                                quantity: 1,
                                meta_data: [
                                    { key: "Link del perfil", value: waiting.profileLink }
                                ]
                            }]
                        });

                        waiting.active = false;
                        await waiting.save();

                        await enviarWhatsApp(waiting.chatId, "🚀 Pago confirmado. Tu pedido fue enviado correctamente.");
                        await enviarWhatsApp(sender, "✅ Pedido aprobado y enviado al SMM.");

                        continue;
                    }

                    // =========================
                    // RECHAZAR PAGO
                    // =========================
                    if (adminText.startsWith("RECHAZAR")) {

                        const parts = adminText.split(" ");
                        const pedidoId = parts[1];
                        if (!pedidoId) continue;

                        await PaymentWaiting.updateOne(
                            { _id: pedidoId },
                            { active: false }
                        );

                        await enviarWhatsApp(sender, "🚫 Pedido rechazado.");
                        continue;
                    }
                }

            } catch (err) {
                console.error("Error procesando mensaje:", err);
            }

        }

    } catch (error) {
        console.error("Error en webhook:", error);
    }

});
/*
=============================
FLOW + IA ROUTING
=============================
*/

const flowDoc = await Flow.findOne({ isMain: true });

if (flowDoc && incomingText) {

    const nodes = flowDoc.data.drawflow.Home.data;
    let targetNode = null;

    targetNode = Object.values(nodes).find(n =>
        n.name === "trigger" &&
        n.data.val?.toLowerCase() === incomingText.toLowerCase()
    );

    if (!targetNode) {

        const listNode = Object.values(nodes).find(n => {

            if (n.name === "whatsapp_list") {
                return Object.keys(n.data).some(key =>
                    key.startsWith("row") &&
                    n.data[key]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
                );
            }

            return false;
        });

        if (listNode) {

            const rowKey = Object.keys(listNode.data).find(k =>
                k.startsWith("row") &&
                listNode.data[k]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
            );

            if (rowKey) {

                const rowNum = rowKey.replace("row", "");
                const connection = listNode.outputs?.[`output_${rowNum}`]?.connections?.[0];

                if (connection) {
                    targetNode = nodes[connection.node];
                }
            }
        }
    }

    if (targetNode) {

        flowProcessed = true;

        if (targetNode.name === "trigger") {

            const nextNodeId =
                targetNode.outputs?.output_1?.connections?.[0]?.node;

            if (nextNodeId)
                await processSequence(sender, nodes[nextNodeId], nodes);

        } else {

            await processSequence(sender, targetNode, nodes);
        }
    }
}        
            // =============================
            /*
=====================================================
MOTOR DE PRIORIDAD CONVERSACIONAL (ANTI-ERROR HUMANO)
=====================================================
*/

if (!flowProcessed && !isInteractive && incomingText.length > 0) {

    const paymentWaiting = await PaymentWaiting.findOne({
        chatId: sender,
        active: true
    });

    if (paymentWaiting) return;

    /*
    ===============================
    DETECTOR INTENCIÓN COMPRA AVANZADO
    ===============================
    */

    const buySignals = [
        "comprar",
        "precio",
        "plan",
        "como pago",
        "servicio",
        "quiero"
    ];

    const isBuyingIntent = buySignals.some(word =>
        incomingText.toLowerCase().includes(word)
    );

    /*
    ===============================
    SI QUIERE COMPRAR → PRIORIDAD FLUJO
    ===============================
    */

    if (isBuyingIntent) {
        console.log("🧠 Buyer detected → Menu routing");

        await enviarWhatsApp(
            sender,
            "✨ Ve al menú de servicios y elige un plan.\n\n👇 Escribe MENU"
        );

        return;
    }

    /*
    ===============================
    SOLO SI ESTÁ PERDIDO → IA
    ===============================
    */

    const memoryKey = `${sender}`;

    let lastState = conversationMemory.get(memoryKey) || {};

    if (!lastState.greeted) {

updateMemory(sender, "greeted", true);
updateMemory(sender, "lastTime", Date.now());

    }

    await ejecutarIAsola(sender, incomingText, {
        Message,
        enviarWhatsApp,
        Flow,
        processSequence,
        UserStatus
    });
}

/* ========================= WEBHOOK YAPE (VALIDACIÓN POR CÓDIGO) 
app.post("/webhook-yape", async (req, res) => {

    const { texto } = req.body;
    console.log("📩 Notificación Yape:", texto);

    if (!texto) return res.sendStatus(200);

    try {

        const matchCod =
            texto.match(/seguridad es:\s?(\d{3})/i) ||
            texto.match(/\b\d{3}\b/);

        const codigoNotificacion = matchCod ? (matchCod[1] || matchCod[0]) : null;

        const matchMonto = texto.match(/S\/\s?(\d+(\.\d{1,2})?)/i);
        const montoNotificacion = matchMonto ? matchMonto[1] : null;

        if (!codigoNotificacion) return res.sendStatus(200);

        const waiting = await PaymentWaiting.findOne({
            yapeCode: codigoNotificacion,
            active: true
        });

        if (!waiting) {
            console.log("⚠️ Código recibido pero no hay cliente activo esperando.");
            return res.sendStatus(200);
        }

        // 🔥 Desactivar inmediatamente para evitar duplicados
        await PaymentWaiting.updateOne(
            { _id: waiting._id },
            {
                active: false,
                waitingForCode: false
            }
        );

        console.log("✅ Match encontrado. Procesando Pedido SMM...");

        // Obtener producto WooCommerce
        const productRes = await WooCommerce.get(
            `products/${waiting.productId}`
        );

        const product = productRes.data || {};

        const serviceId = product.meta_data?.find(
            m => m.key === "bulk_service_id"
        )?.value;

        const bulkQty = product.meta_data?.find(
            m => m.key === "bulk_quantity"
        )?.value;

        // Crear pedido WooCommerce
        await WooCommerce.post("orders", {
            payment_method: "bacs",
            payment_method_title: "Yape Automático ✅",
            status: "processing",

            billing: {
                phone: waiting.chatId
            },

            line_items: [{
                product_id: waiting.productId,
                quantity: 1,
                meta_data: [
                    { key: "_ltb_id", value: serviceId },
                    { key: "_ltb_qty", value: bulkQty },
                    { key: "Link del perfil", value: waiting.profileLink },
                    { key: "Código Yape", value: codigoNotificacion }
                ]
            }]
        });

        // Guardar mensaje CRM
        const msgBot = await Message.create({
            chatId: waiting.chatId,
            from: "bot",
            text: `✅ ¡Pago validado! S/${montoNotificacion || waiting.amount}. Pedido enviado al SMM.`
        });

        broadcast({
            type: "new_message",
            message: msgBot
        });

        // Mensaje final al cliente
        await processSequence(
            waiting.chatId,
            {
                name: "message",
                data: {
                    info: `✅ *¡Pago verificado con éxito!* ✨\n\nHemos recibido tu Yape. Tu pedido ya está siendo procesado por el sistema. ¡Gracias por tu compra! 🚀`
                }
            },
            {}
        );

        res.sendStatus(200);

    } catch (error) {

        console.error("❌ Error webhook Yape:", error.message);
        res.status(500).json({
            error: "Error interno IA"
        });
    }
});
*/

/* ========================= GET TODOS LOS FLUJOS ========================= */
app.get("/api/get-flows", async (req, res) => {
    try {
        const flows = await Flow.find().sort({ createdAt: -1 });

        res.json(flows.map(f => ({
            _id: f._id,
            name: f.name,
            isMain: f.isMain
        })));

    } catch (e) {
        console.error("❌ Error obteniendo lista de flujos:", e.message);
        res.status(500).json([]);
    }
});
app.get("/api/get-flow", async (req, res) => {
    try {
        const flow = await Flow.findOne({ isMain: true });

        if (!flow) {
            return res.json({
                drawflow: { Home: { data: {} } }
            });
        }

        // IMPORTANTE: solo enviamos data porque Drawflow espera esa estructura
        res.json(flow.data);

    } catch (e) {
        console.error("❌ Error al obtener flujo principal:", e.message);
        res.status(500).json({
            drawflow: { Home: { data: {} } }
        });
    }
});


/* ========================= GET FLOW POR ID ========================= */
app.get("/api/get-flow-by-id/:id", async (req, res) => {
    try {
        const flow = await Flow.findById(req.params.id);

        if (!flow) return res.json(null);

        // 🔥 MUY IMPORTANTE:
        // Devolvemos también el _id para que el frontend pueda actualizar correctamente
        res.json({
            _id: flow._id,
            name: flow.name,
            data: flow.data
        });

    } catch (e) {
        console.error("❌ Error al obtener flujo por ID:", e.message);
        res.status(500).json(null);
    }
});

app.post("/api/save-flow", async (req, res) => {
    try {
        const { id, name, data, isMain } = req.body;

        if (!data) {
            return res.status(400).json({ error: "No hay data para guardar" });
        }

        let flow;

        if (id) {
            // 🔥 ACTUALIZA
            flow = await Flow.findByIdAndUpdate(
                id,
                { name, data, isMain },
                { new: true }
            );
        } else {
            // 🔥 CREA NUEVO
            if (id) {

    flow = await Flow.findByIdAndUpdate(
        id,
        { name, data, isMain },
        { new: true, runValidators: false }
    );

} else {

    const existing = await Flow.findOne({ name });

    if (existing) {
        flow = await Flow.findByIdAndUpdate(
            existing._id,
            { data, isMain },
            { new: true }
        );
    } else {
        flow = await Flow.create({
            name: name || "Main Flow",
            data,
            isMain: isMain || false
        });
    }
}
        }

        // 🔥 Si este flujo es principal, desactivar otros
        if (isMain) {
            await Flow.updateMany(
                { _id: { $ne: flow._id } },
                { isMain: false }
            );
        }

        res.json({
            success: true,
            flowId: flow._id
        });

    } catch (e) {
        console.error("❌ Error guardando flujo:", e);
        res.status(500).json({ error: "Error al guardar" });
    }
});

app.post('/api/activate-flow/:id', async (req, res) => {
    try {
        await Flow.updateMany({}, { isMain: false });
        await Flow.findByIdAndUpdate(req.params.id, { isMain: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/delete-flow/:id', async (req, res) => {
    try {
        const flow = await Flow.findById(req.params.id);
        if (flow && flow.name === "Main Flow") return res.status(400).send("No puedes eliminar el flujo principal");
        await Flow.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 1. Esta ruta llena la lista de la izquierda
app.get("/chats", async (req, res) => {
    try {
        const chats = await Message.aggregate([
            { $sort: { timestamp: 1 } }, 
            { $group: { _id: "$chatId", lastMessage: { $last: "$text" }, lastTime: { $last: "$timestamp" } } }, 
            { $sort: { lastTime: -1 } }
        ]);
        // Importante: Enviamos "id" para que el frontend lo reconozca
        res.json(chats.map(c => ({ 
            id: c._id, 
            lastMessage: { text: c.lastMessage || "Media" }, 
            timestamp: c.lastTime 
        })));
    } catch (e) { res.status(500).json([]); }
});

// 2. Esta ruta quita el "Cargando mensajes" y muestra la conversación
app.get("/chats/:chatId", async (req, res) => {
    try {
        const messages = await Message.find({ chatId: req.params.chatId }).sort({ timestamp: 1 });
        res.json(messages); 
    } catch (e) { res.status(500).json([]); }
});

// 3. Esta ruta permite que la IA indique que está "escribiendo"
app.post('/api/whatsapp-presence', async (req, res) => {
    const { chatId, status } = req.body;
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: chatId,
            sender_action: status 
        }, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
        res.json({ success: true });
    } catch (e) { res.status(200).json({ error: e.message }); }
});

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
            payload.type = "image";
            payload.image = { link: `https://${domain}${mediaUrl}`, caption: text || "" };
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

app.get("/api/download-flow", async (req, res) => {
    try {
        const flow = await Flow.findOne({ isMain: true });
        if (!flow) return res.status(404).send("No hay flujo guardado.");
        res.setHeader('Content-disposition', 'attachment; filename=flujo_nemo.json');
        res.setHeader('Content-type', 'application/json');
        res.send(JSON.stringify(flow.data, null, 4));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ========================= ENDPOINT DE IA (OPENAI) ========================= */
app.post('/api/ai-chat', async (req, res) => {

    const { message, chatId, contexto } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    const catalogoServicios = global.catalogoServicios || `...`;

    const nombresNodos = {
        "23": "Menú Principal de Redes (Instagram, TikTok, Facebook)",
        "12": "Sección de Planes de TikTok",
        "46": "Sección de Planes de Instagram",
        "13": "Sección de Planes de Facebook",
        "waiting_link": "Proceso de Pago: Esperando el link del perfil",
        "waiting_code": "Proceso de Pago: Esperando código de validación"
    };

    const ubicacionActual = nombresNodos[contexto] || "Inicio de la conversación";

    const intentCompraKeywords = [
        "quiero comprar",
        "como pago",
        "dame el plan",
        "cuesta",
        "precio",
        "servicio",
        "seguir seguidores",
        "comprar seguidores",
        "comprar likes"
    ];

    let detectCompra = false;

    try {
        detectCompra = intentCompraKeywords.some(word =>
            message.toLowerCase().includes(word)
        );
    } catch (e) {
        console.error("Detector compra error:", e.message);
    }

    let hintSistema = "";

    if (detectCompra) {
        hintSistema = `
El usuario muestra intención de compra.

Si está perdido:
→ Muestra [ACTION:MENU_REDES]

Nunca des precios directos.

Guíalo hacia seleccionar un plan del catálogo.`;
    }

    try {

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Eres el asistente virtual experto de 'aumentar-seguidores.com'.

UBICACIÓN ACTUAL DEL CLIENTE: ${ubicacionActual}

CATALOGO OFICIAL DE SERVICIOS:

${catalogoServicios}

${hintSistema}

REGLAS OBLIGATORIAS DE VENTA:
1. Nunca inventes precios.
2. Nunca generes valores fuera del catálogo.
3. Si el cliente pregunta por precios → muéstralo guiándolo al menú.
4. Si el cliente quiere comprar → usa el código [ACTION:MENU_REDES].
5. Si el cliente pregunta algo que no está en el catálogo → responde que solo vendes los servicios listados.
6. No negocies precios.
7. No generes ofertas nuevas.
8. Siempre invita a seleccionar una opción del catálogo para continuar.

ESTILO DE RESPUESTA:
- Montserrat style
- Responde corto y amigable
- No des precios
- Cierre: invita al menú [ACTION:MENU_REDES]

GATILLOS:
TikTok → [ACTION:TIKTOK]
Instagram → [ACTION:INSTAGRAM]
Facebook → [ACTION:FACEBOOK]

No menciones códigos dentro del texto.
`
                    },
                    { role: "user", content: message }
                ],
                max_tokens: 300,
                temperature: 0.5
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const aiText = response.data?.choices?.[0]?.message?.content;

        res.json({ text: aiText });

    } catch (error) {
        console.error("❌ Error con OpenAI:", error.message);
        res.status(500).json({ error: "Error al conectar con la IA" });
    }

});
/**
 * Función auxiliar para enviar mensajes de texto plano vía WhatsApp API
 */
async function enviarWhatsApp(to, text) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "text",
            text: { body: text }
        }, {
            headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
        });
    } catch (err) {
        console.error("❌ Error al enviarWhatsApp:", err.response?.data || err.message);
    }
}
module.exports = {
    processSequence,
    ejecutarIAsola,
    enviarWhatsApp
};