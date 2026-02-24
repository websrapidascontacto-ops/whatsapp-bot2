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

/* ========================= WEBHOOK PRINCIPAL ========================= */
app.post("/webhook", async (req, res) => {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages) {
        for (const msg of value.messages) {
            const sender = msg.from;
            let incomingText = (msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "").trim();
            let mediaUrl = null;

            if (msg.type === "image") {
                mediaUrl = await downloadMedia(msg.image.id, `${Date.now()}-${sender}.jpg`);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

<<<<<<< HEAD
            const saved = await Message.create({ chatId: sender, from: sender, text: incomingText, media: mediaUrl });
            broadcast({ type: "new_message", message: saved });
            
            try {
                const flowDoc = await Flow.findOne({ name: "Main Flow" });
                if (flowDoc && incomingText) {
                    const nodes = flowDoc.data.drawflow.Home.data;

                    // --- 1. LISTA (Prioridad) ---
                    const activeListNode = Object.values(nodes).find(n => {
                        if (n.name !== "whatsapp_list") return false;
                        return Object.values(n.data).some(v => v && v.toString().toLowerCase() === incomingText.toLowerCase());
                    });

                    if (activeListNode) {
                        const rowKey = Object.keys(activeListNode.data).find(k => 
                            activeListNode.data[k] && activeListNode.data[k].toString().toLowerCase() === incomingText.toLowerCase()
                        );
                        if (rowKey) {
                            const outNum = rowKey.replace(/\D/g, ""); 
                            const conn = activeListNode.outputs[`output_${outNum}`]?.connections[0];
                            if (conn) {
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
=======
            if (incomingText || mediaPath) {
                const savedIncoming = await Message.create({ 
                    chatId: sender, 
                    from: sender, 
                    text: incomingText, 
                    media: mediaPath 
                });
                broadcast({ type: "new_message", message: savedIncoming });
            }

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
                            data: { info: `✅ Link recibido correctamente. ✨\n\n💳 Ahora, para finalizar, por favor envía el Yape por S/${waiting.amount}. al numero 981514479 a nombre de Lorena M. El sistema se activará automáticamente al recibir la notificación. 🚀` } 
                        }, {});
                    } else {
                        await processSequence(sender, { 
                            name: "message", 
                            data: { info: "⚠️ Por favor, envía un link válido de tu perfil o publicación para continuar con tu pedido. 🔗" } 
                        }, {});
>>>>>>> 345e92536f42aee91d0104c4fa8a32495d2326ca
                    }
                }
            } catch (err) { 
                console.error("❌ Error Webhook Logic:", err.message); 
            }
<<<<<<< HEAD
=======

            const flowDoc = await Flow.findOne({ isMain: true }); 
            if (flowDoc && incomingText) {
                const nodes = flowDoc.data.drawflow.Home.data;

                // 1. Primero buscamos si es un TRIGGER (ej: "Hola")
                let targetNode = Object.values(nodes).find(n => 
                    n.name === "trigger" && 
                    n.data.val?.toLowerCase() === incomingText.toLowerCase()
                );

                // 2. Si no es un trigger, buscamos si es una respuesta a una LISTA
                if (!targetNode) {
                    const listNode = Object.values(nodes).find(n => {
                        if (n.name === "whatsapp_list") {
                            return Object.values(n.data).some(val => val?.toString().trim().toLowerCase() === incomingText.toLowerCase());
                        }
                        return false;
                    });

                    if (listNode) {
                        const rowKey = Object.keys(listNode.data).find(k => listNode.data[k]?.toString().toLowerCase() === incomingText.toLowerCase());
                        const rowNum = rowKey.replace("row", "");
                        const nextId = listNode.outputs[`output_${rowNum}`]?.connections?.[0]?.node;
                        if (nextId) targetNode = nodes[nextId];
                    }
                }

                // 3. Ejecutar el nodo encontrado
                if (targetNode) {
                    if (targetNode.name === "trigger") {
                        const nextNodeId = targetNode.outputs?.output_1?.connections?.[0]?.node;
                        if (nextNodeId) await processSequence(sender, nodes[nextNodeId], nodes);
                    } else {
                        await processSequence(sender, targetNode, nodes);
                    }
                }
            }
>>>>>>> 1e9601b85258c29d6f61576b052a7302d1f7e87e
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
<<<<<<< HEAD
    return; // Si no hay conexión, se detiene aquí.
}
    else if (node.name === "whatsapp_list") {
        try {
            const rows = Object.keys(node.data)
                .filter(k => k.startsWith("row") && node.data[k])
                .map((k, i) => {
                    // Extraemos el número de la fila (ej: de "row1" sacamos "1")
                    const rowNum = k.replace("row", "");
                    // Buscamos su pareja de descripción (desc1, desc2...)
                    const descriptionText = node.data[`desc${rowNum}`] || "";

                    return { 
                        id: `row_${node.id}_${i}`, 
                        title: node.data[k].toString().substring(0, 24),
                        // AGREGAMOS LA DESCRIPCIÓN AQUÍ:
                        description: descriptionText.toString().substring(0, 72) 
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
=======
    /* ========================= CORRECCIÓN DE LISTA FILTRADA ========================= */
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
                footer: { text: "Webs Rápidas 🚀" },
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
    else if (node.name === "payment_validation") {
            await PaymentWaiting.findOneAndUpdate(
                { chatId: to },
                { productId: node.data.product_id, amount: node.data.amount, active: true, waitingForLink: true },
                { upsert: true }
            );
            botText = `🚀 ¡Excelente elección!\n\n🔗 Para procesar tu pedido, por favor pega aquí el *link de tu cuenta o publicación* donde enviaremos el servicio. ✨`;
            payload.type = "text";
            payload.text = { body: botText };
>>>>>>> 1e9601b85258c29d6f61576b052a7302d1f7e87e
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

<<<<<<< HEAD
/* ========================= APIS Y SUBIDAS ========================= */
=======
/* ========================= WEBHOOK YAPE ========================= */
app.post("/webhook-yape", async (req, res) => {
    const { texto } = req.body; 
    if (!texto) return res.sendStatus(200);
    try {
        const activeWaitings = await PaymentWaiting.find({ active: true });
        const montoRecibido = texto.match(/\d+/)?.[0]; 
        for (const waiting of activeWaitings) {
            const montoEsperado = waiting.amount.match(/\d+/)?.[0]; 
            if (montoRecibido && montoRecibido === montoEsperado) {
                await PaymentWaiting.updateOne({ _id: waiting._id }, { active: false });
                const productRes = await WooCommerce.get(`products/${waiting.productId}`);
                const product = productRes.data;
                const serviceId = product.meta_data.find(m => m.key === "bulk_service_id")?.value;
                const bulkQty = product.meta_data.find(m => m.key === "bulk_quantity")?.value;
                await WooCommerce.post("orders", {
                    payment_method: "bacs", payment_method_title: "Yape Automático ✅", status: "processing",
                    billing: { phone: waiting.chatId },
                    line_items: [{ 
                        product_id: waiting.productId, quantity: 1,
                        meta_data: [
                            { key: "_ltb_id", value: serviceId },
                            { key: "_ltb_qty", value: bulkQty },
                            { key: "Link del perfil", value: waiting.profileLink },
                            { key: "Link del Perfil", value: waiting.profileLink }
                        ]
                    }],
                    customer_note: `🤖 Pedido automático vía WhatsApp. Link: ${waiting.profileLink}`
                });
                await processSequence(waiting.chatId, { 
                    name: "message", 
                    data: { info: "✅ ¡Yape verificado! 🚀 Tu pedido ya está en proceso en el sistema central. ✨" } 
                }, {});
                return res.sendStatus(200);
            }
        }
    } catch (err) { console.error("❌ Error Integración LTB:", err.message); }
    res.sendStatus(200);
});

/* ========================= APIS DE FLUJOS Y CHAT ========================= */

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ isMain: true });
    res.json(flow ? flow.data : null);
});

app.get("/api/get-flow-by-id/:id", async (req, res) => {
    try {
        const flow = await Flow.findById(req.params.id);
        res.json(flow ? flow.data : null);
    } catch (e) { res.status(500).json(null); }
});

app.get('/api/get-flows', async (req, res) => {
    try {
        const flows = await Flow.find({});
        res.json(flows.map(f => ({ id: f._id, name: f.name, active: f.isMain })));
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/save-flow', async (req, res) => {
    try {
        const { id, name, data } = req.body;
        const finalName = name || "Main Flow";

        // Si es el flujo principal, nos aseguramos de que sea el único isMain
        const shouldBeMain = (finalName === "Main Flow");

        if (shouldBeMain) {
            await Flow.updateMany({}, { isMain: false });
        }

        let updatedFlow;
        if (id && mongoose.Types.ObjectId.isValid(id)) {
            updatedFlow = await Flow.findByIdAndUpdate(
                id, 
                { name: finalName, data, isMain: shouldBeMain }, 
                { new: true, upsert: true }
            );
        } else {
            // Buscamos por nombre para evitar duplicar el "Main Flow"
            updatedFlow = await Flow.findOneAndUpdate(
                { name: finalName },
                { data, isMain: shouldBeMain },
                { new: true, upsert: true }
            );
        }

        console.log(`✅ Flujo "${finalName}" guardado correctamente.`);
        res.json({ success: true, id: updatedFlow._id });
    } catch (e) { 
        console.error("❌ Error al guardar flujo:", e.message);
        res.status(500).json({ error: e.message }); 
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

>>>>>>> 1e9601b85258c29d6f61576b052a7302d1f7e87e
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

<<<<<<< HEAD
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
=======
>>>>>>> 1e9601b85258c29d6f61576b052a7302d1f7e87e
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
<<<<<<< HEAD
        res.json({ success: true, message: "Flujo importado correctamente" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
=======
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("🚀 Server Punto Nemo Estable - Todo restaurado");
>>>>>>> 1e9601b85258c29d6f61576b052a7302d1f7e87e
});