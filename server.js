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
// Esquema actualizado
const PaymentWaiting = mongoose.model("PaymentWaiting", new mongoose.Schema({
    chatId: String,
    productId: String,
    amount: String,
    profileLink: String,
    yapeCode: String, // <--- NUEVO: Para guardar el código que el cliente escriba
    active: { type: Boolean, default: true },
    waitingForLink: { type: Boolean, default: false },
    waitingForCode: { type: Boolean, default: false } // <--- NUEVO: Para saber que esperamos el código
}));

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
    name: { type: String, required: true, unique: true },
    data: { type: Object, required: true },
    isMain: { type: Boolean, default: false } 
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

/* ========================= WEBHOOK PRINCIPAL (WHATSAPP) ========================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200); // Respondemos a Meta de inmediato para evitar reenvíos

    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return;

    for (const msg of value.messages) {
        const sender = msg.from;
        let incomingText = (
            msg.text?.body || 
            msg.interactive?.list_reply?.title || 
            msg.interactive?.button_reply?.title || 
            ""
        ).trim();

        let mediaPath = null;

        // Manejo de imágenes entrantes
        if (msg.type === "image") {
            try {
                const mediaId = msg.image.id;
                const fileName = `whatsapp_${Date.now()}.jpg`;
                mediaPath = await downloadMedia(mediaId, fileName);
                if (!incomingText) incomingText = msg.image.caption || "📷 Imagen recibida";
            } catch (err) { console.error("❌ Error imagen:", err.message); }
        }

        if (incomingText || mediaPath) {
            // 1. Guardar mensaje en BD
            const savedIncoming = await Message.create({ 
                chatId: sender, from: sender, text: incomingText, media: mediaPath 
            });

            // 2. Avisar al CRM (WebSocket)
            broadcast({ 
                type: "new_message", 
                message: { ...savedIncoming._doc, id: savedIncoming.chatId } 
            });

            // 3. Lógica de Estado de Pago (Waiting)
            const waiting = await PaymentWaiting.findOne({ chatId: sender, active: true });

            if (waiting) {
                // PASO 1: Recibir el Link
                if (waiting.waitingForLink) {
                    const isLink = incomingText.includes("http") || incomingText.includes(".com") || incomingText.includes("www.");
                    
                    if (isLink) {
                        waiting.profileLink = incomingText;
                        waiting.waitingForLink = false;
                        waiting.waitingForCode = true; 
                        await waiting.save();

                        const mensajePago = `✅ *Link recibido correctamente.* ✨\n\n💰 *Datos para el pago* 💰\n\n📱 *Yape:* 981514479\n👉 *Nombre:* Lorena M\n💵 *Monto:* S/${waiting.amount}\n\n--- \n\n⚠️ *INSTRUCCIONES IMPORTANTES* ⚠️\n\n1️⃣ Realiza el pago en tu App Yape.\n2️⃣ Al terminar, busca en tu comprobante de yape el **"Código de Seguridad"** (son 3 dígitos).\n3️⃣ Escribe esos **3 números aquí abajo** para activar tu pedido.\n\n🚫 No envíes capturas, el sistema solo necesita los 3 dígitos. 🚀`;

                        await processSequence(sender, { name: "message", data: { info: mensajePago } }, {});
                        await processSequence(sender, { 
                            name: "image", 
                            data: { 
                                url: "https://whatsapp-bot2-production.up.railway.app/assets/ayuda-yape.jpg",
                                caption: "💡 Aquí te muestro dónde encontrar los 3 dígitos en tu comprobante de Yape 👇" 
                            } 
                        }, {});
                    } else {
                        await processSequence(sender, { name: "message", data: { info: "⚠️ Por favor, envía un link válido. 🔗" } }, {});
                    }
                    continue; 
                }

                // PASO 2: Recibir el Código de 3 dígitos
                if (waiting.waitingForCode) {
                    const cleanNumber = incomingText.replace(/\D/g, ''); 
                    
                    if (cleanNumber.length === 3) {
                        await PaymentWaiting.updateOne({ _id: waiting._id }, { 
                            yapeCode: cleanNumber, 
                            waitingForCode: false 
                        });
                        
                        await processSequence(sender, { name: "message", data: { info: `⏳ Código *${cleanNumber}* recibido. Iniciando validación...` } }, {});
                        
                        const sendProgress = (ms, text) => {
                            setTimeout(async () => {
                                const check = await PaymentWaiting.findById(waiting._id);
                                if (check && check.active) {
                                    await processSequence(sender, { name: "message", data: { info: text } }, {});
                                }
                            }, ms);
                        };

                        sendProgress(2500, "🔍 Verificando transacción con el banco... 30%");
                        sendProgress(5500, "⚙️ Procesando datos del servicio... 75%");
                        sendProgress(8500, "⏳ Casi listo, esperando la confirmación final de Yape... 📥");
                    } else {
                        await processSequence(sender, { 
                            name: "message", 
                            data: { info: "⚠️ Por favor, ingresa los *3 dígitos* del código de seguridad que esta en la constancia de tu yape. 📑" } 
                        }, {});

                        await processSequence(sender, { 
                            name: "image", 
                            data: { 
                                url: "https://whatsapp-bot2-production.up.railway.app/assets/ayuda-yape.jpg",
                                caption: "Aquí puedes ver dónde encontrar los 3 dígitos. 👇😊" 
                            } 
                        }, {});
                    }
                    continue;
                }
            }

            // --- LÓGICA DE FLUJOS Y IA (AUTÓNOMA) ---
            const flowDoc = await Flow.findOne({ isMain: true });
            let flowProcessed = false;

            if (flowDoc && incomingText) {
                const nodes = flowDoc.data.drawflow.Home.data;
                
                // Buscar si es un Trigger (Palabra clave)
                let targetNode = Object.values(nodes).find(n =>
                    n.name === "trigger" &&
                    n.data.val?.toLowerCase() === incomingText.toLowerCase()
                );

                // Si no es trigger, buscar en Listas de WhatsApp
                if (!targetNode) {
                    const listNode = Object.values(nodes).find(n => {
                        if (n.name === "whatsapp_list") {
                            return Object.keys(n.data).some(key =>
                                key.startsWith('row') &&
                                n.data[key]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
                            );
                        }
                        return false;
                    });

                    if (listNode) {
                        const rowKey = Object.keys(listNode.data).find(k =>
                            k.startsWith('row') &&
                            listNode.data[k]?.toString().trim().toLowerCase() === incomingText.toLowerCase()
                        );
                        if (rowKey) {
                            const rowNum = rowKey.replace("row", "");
                            const connection = listNode.outputs[`output_${rowNum}`]?.connections?.[0];
                            if (connection) targetNode = nodes[connection.node];
                        }
                    }
                }

                // Ejecutar el nodo si se encontró
                if (targetNode) {
                    flowProcessed = true;
                    if (targetNode.name === "trigger") {
                        const nextNodeId = targetNode.outputs?.output_1?.connections?.[0]?.node;
                        if (nextNodeId) await processSequence(sender, nodes[nextNodeId], nodes);
                    } else {
                        await processSequence(sender, targetNode, nodes);
                    }
                }
            }

            // --- DISPARO DE IA SI NADA DE LO ANTERIOR SE EJECUTÓ ---
            if (!flowProcessed) {
                console.log(`🤖 Disparando IA autónoma para: ${sender}`);
                if (typeof ejecutarIAsola === "function") {
                    // No usamos await aquí para que el webhook termine rápido
                    ejecutarIAsola(sender, incomingText).catch(e => console.error("Error IA:", e));
                }
            }
        }
    }
});

/* ========================= WEBHOOK YAPE (EXTERNO - RECIBE DE MACRODROID) ========================= */
app.post("/webhook-yape", async (req, res) => {
    const { texto } = req.body; 
    console.log("📩 Notificación Yape Recibida:", texto);
    if (!texto) return res.sendStatus(200);

    const matchCod = texto.match(/seguridad es:\s?(\d{3})/i) || texto.match(/\b\d{3}\b/);
    const codigoNotificacion = matchCod ? (matchCod[1] || matchCod[0]) : null;

    if (codigoNotificacion) {
        let waiting = null;
        console.log(`🔎 Buscando código ${codigoNotificacion}...`);

        // Aumentamos a 30 intentos (1 minuto de espera total)
        for (let i = 0; i < 30; i++) {
            // Buscamos cualquier registro que tenga ese código y esté activo
            waiting = await PaymentWaiting.findOne({ 
                yapeCode: codigoNotificacion, 
                active: true 
            }).sort({ _id: -1 });

            if (waiting) break; 
            
            if (i % 5 === 0) console.log(`⏳ Esperando al cliente... (Intento ${i+1}/60)`);
            await new Promise(r => setTimeout(r, 2000)); 
        }

        if (waiting) {
            console.log("✅ ¡Match encontrado! Procesando pedido...");
            // Desactivamos para evitar duplicados
            await PaymentWaiting.updateOne({ _id: waiting._id }, { active: false });

            try {
                const productRes = await WooCommerce.get(`products/${waiting.productId}`);
                const product = productRes.data;
                const serviceId = product.meta_data.find(m => m.key === "bulk_service_id")?.value;
                const bulkQty = product.meta_data.find(m => m.key === "bulk_quantity")?.value;

                const wpResponse = await WooCommerce.post("orders", {
                    payment_method: "bacs",
                    payment_method_title: "Yape Automático ✅",
                    status: "processing", 
                    billing: { phone: waiting.chatId },
                    line_items: [{
                        product_id: parseInt(waiting.productId),
                        quantity: 1,
                        meta_data: [
                            { key: "_ltb_id", value: serviceId },
                            { key: "_ltb_qty", value: bulkQty },
                            { key: "Link del perfil", value: waiting.profileLink },
                            { key: "Código Yape", value: codigoNotificacion }
                        ]
                    }]
                });

                await processSequence(waiting.chatId, { 
                    name: "message", 
                    data: { info: `✅ *¡PAGO VERIFICADO!* 🚀\n\nTu pedido #${wpResponse.data.id} ha sido activado con éxito. ¡Gracias por confiar en Aumentar Seguidores! ✨` } 
                }, {});
// --- ESTO ES LO QUE AGREGAMOS (AL FINAL DEL BLOQUE DE ÉXITO) ---
                axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: "51933425911",
                    type: "text",
                    text: { body: `🔔 *VENTA EXITOSA* 💰\n\nOrden: #${wpResponse.data.id}\nCliente: ${waiting.chatId}\nMonto: S/${waiting.amount}\nLink: ${waiting.profileLink}` }
                }, { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }).catch(e => {});
                // --- FIN DEL AGREGADO ---
                
            } catch (err) { 
                console.error("❌ Error WordPress:", err.response?.data || err.message); 
            }
        } else {
            console.log(`❌ Tiempo agotado para el código ${codigoNotificacion}.`);
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
    else if (node.name === "payment_validation") {
            await PaymentWaiting.findOneAndUpdate(
                { chatId: to },
                { 
                    productId: node.data.product_id, 
                    amount: node.data.amount, 
                    active: true, 
                    waitingForLink: true,
                    waitingForCode: false,
                    yapeCode: null 
                },
                { upsert: true }
            );
            // Mensaje inicial solicitando el link
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
    } catch (err) { console.error("❌ Error en processSequence:", err.message); }
}

/* ========================= WEBHOOK YAPE (VALIDACIÓN POR CÓDIGO) ========================= */
app.post("/webhook-yape", async (req, res) => {
    const { texto } = req.body; 
    console.log("📩 Notificación Yape:", texto);

    if (!texto) return res.sendStatus(200);

    try {
        const matchCod = texto.match(/seguridad es:\s?(\d{3})/i) || texto.match(/\b\d{3}\b/);
        const codigoNotificacion = matchCod ? matchCod[1] || matchCod[0] : null;

        // Buscamos el monto (S/ 5, S/ 10.00, etc)
        const matchMonto = texto.match(/S\/\s?(\d+(\.\d{1,2})?)/i);
        const montoNotificacion = matchMonto ? matchMonto[1] : null;

        if (codigoNotificacion) {
            // Buscamos al cliente que coincida con el código
            const waiting = await PaymentWaiting.findOne({ 
                yapeCode: codigoNotificacion, 
                active: true 
            });

            if (waiting) {
                // 1. Desactivamos inmediatamente para evitar que el bot repita mensajes
                await PaymentWaiting.updateOne({ _id: waiting._id }, { 
                    active: false,
                    waitingForCode: false 
                });

                console.log("✅ Match encontrado. Procesando Pedido SMM...");

                // 2. Obtener data del producto para sacar los IDs del SMM
                const productRes = await WooCommerce.get(`products/${waiting.productId}`);
                const product = productRes.data;
                
                // Buscamos los metadatos que el plugin LTB (SMM) necesita
                const serviceId = product.meta_data.find(m => m.key === "bulk_service_id")?.value;
                const bulkQty = product.meta_data.find(m => m.key === "bulk_quantity")?.value;

                // 3. Crear pedido en WooCommerce (Estado: processing dispara el SMM)
                await WooCommerce.post("orders", {
                    payment_method: "bacs",
                    payment_method_title: "Yape Automático ✅",
                    status: "processing", 
                    billing: { phone: waiting.chatId },
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

                // 4. Notificar en Rila (Panel)
                const msgBot = await Message.create({ 
                    chatId: waiting.chatId, 
                    from: "bot", 
                    text: `✅ ¡Pago validado! S/${montoNotificacion || waiting.amount}. Pedido enviado al SMM.` 
                });
                broadcast({ type: "new_message", message: msgBot });

                // 5. Mensaje de éxito final al WhatsApp del cliente
                await processSequence(waiting.chatId, { 
                    name: "message", 
                    data: { info: `✅ *¡Pago verificado con éxito!* ✨\n\nHemos recibido tu Yape. Tu pedido ya está siendo procesado por el sistema. ¡Gracias por tu compra! 🚀` } 
                }, {});

            } else {
                console.log("⚠️ Código recibido pero no hay cliente activo esperando este código.");
            }
        }
    } catch (err) {
        console.error("❌ Error Webhook Yape:", err.message);
    }
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
        const finalName = name || `Flujo_${Date.now()}`;
        if (id && mongoose.Types.ObjectId.isValid(id)) {
            await Flow.findByIdAndUpdate(id, { name: finalName, data });
            res.json({ success: true, id });
        } else {
            const existing = await Flow.findOne({ name: finalName });
            const safeName = existing ? `${finalName}_${Date.now()}` : finalName;
            const newFlow = await Flow.create({ name: safeName, data, isMain: false });
            res.json({ success: true, id: newFlow._id });
        }
    } catch (e) { 
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

app.post("/api/import-flow", express.json({limit: '50mb'}), async (req, res) => {
    try {
        const flowData = req.body;
        await Flow.findOneAndUpdate({ name: "Main Flow" }, { data: flowData }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ========================= ENDPOINT DE IA (OPENAI) ========================= */
app.post('/api/ai-chat', async (req, res) => {
    const { message, chatId } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Eres el asistente virtual experto de 'aumentar-seguidores.com'. Tu misión es resolver dudas sobre el servicio y dirigir al cliente hacia la compra usando los botones del chat.

INFORMACIÓN LEGAL Y REGLAS (Estrictas):
1. NATURALEZA: Solo aumentamos la "Apariencia" visual. NO garantizamos interacción.
2. REQUISITOS: Cuenta PÚBLICA obligatoria. No pedimos contraseñas.
3. REEMBOLSOS: NO hay reembolsos una vez realizado el depósito.
4. GARANTÍA: Solo si cae más del 10% y el servicio incluye Refill.
5. TIEMPOS: El tiempo estimado de entrega es de MENOS DE 1 HORA después de validar el pago. 🚀

ESTILO:
- Responde de forma CORTA, amigable y usa iconos (🚀, ✨, 🛡️).
- Usa fuente Montserrat si es posible.
- No des precios, invita a usar el menú de abajo. 👇
6. Si preguntan por redes específicas, usa estos códigos al final:
   TikTok: [ACTION:TIKTOK]
   Instagram: [ACTION:INSTAGRAM]
   Facebook: [ACTION:FACEBOOK]`
                },
                { role: "user", content: message }
            ],
            max_tokens: 150,
            temperature: 0.5
        }, {
            headers: { 
                'Authorization': `Bearer ${apiKey}`, 
                'Content-Type': 'application/json' 
            }
        });

        const aiText = response.data.choices[0].message.content;
        res.json({ text: aiText });

    } catch (error) {
        console.error("❌ Error OpenAI:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error al conectar con la IA" });
    }
});

/* ========================= FUNCIÓN AUTÓNOMA (24/7) ========================= */
// Importante: Esta función debe llamarse igual que en tu webhook (ejecutarIAsola)
async function ejecutarIAsola(chatId, textoUsuario) {
    try {
        console.log(`🤖 IA trabajando para ${chatId}...`);
        
        // Llamada interna al endpoint de arriba
        const response = await axios.post(`http://127.0.0.1:${process.env.PORT || 3000}/api/ai-chat`, {
            message: textoUsuario,
            chatId: chatId
        });

        const data = response.data;

        if (data.text) {
            let textoIA = data.text;

            // Limpiar códigos de acción para que no los vea el cliente
            textoIA = textoIA.replace(/\[ACTION:\w+\]/gi, "").trim();

            // 1. ENVIAR A WHATSAPP DIRECTO (META)
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp",
                to: chatId,
                type: "text",
                text: { body: textoIA }
            }, {
                headers: { 
                    'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            // 2. Guardar en Base de Datos
            const savedBot = await Message.create({ 
                chatId: chatId, from: "bot", text: textoIA 
            });

            // 3. Avisar al CRM por WebSocket
            broadcast({ 
                type: "new_message", 
                message: { ...savedBot._doc, id: chatId } 
            });

            console.log(`✅ IA respondió sola a ${chatId}`);
        }
    } catch (e) {
        console.error("❌ Error en ejecutarIAsola:", e.message);
    }
}

/* ========================= INICIO DEL SERVIDOR (SIEMPRE AL FINAL) ========================= */
server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("🚀 Servidor en línea y IA configurada");
});