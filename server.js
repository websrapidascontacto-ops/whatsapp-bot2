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
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use("/uploads", express.static(uploadsPath));
app.use(express.static(chatPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(chatPath, 'index.html'));
});

/* ========================= MONGODB  ========================= */
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
    data: { type: Object, required: true },
    isMain: { type: Boolean, default: false }
}));

const PaymentWaiting = mongoose.model("PaymentWaiting", new mongoose.Schema({
    chatId: String,
    productId: String,
    amount: String,
    profileLink: String,
    active: { type: Boolean, default: false },
    waitingForLink: { type: Boolean, default: false }
}));

/* ========================= WEBSOCKET ========================= */
function broadcast(data) {
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify(data));
        }
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
            responseType: "arraybuffer"
        });

        const filePath = path.join(uploadsPath, fileName);
        fs.writeFileSync(filePath, response.data);

        return `/uploads/${fileName}`;
    } catch (e) {
        return null;
    }
}

/* ========================= WEBHOOK PRINCIPAL ========================= */
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

            let mediaUrl = null;

            if (msg.type === "image") {
                mediaUrl = await downloadMedia(msg.image.id, `${Date.now()}-${sender}.jpg`);
                incomingText = msg.image.caption || "📷 Imagen recibida";
            }

            const saved = await Message.create({
                chatId: sender,
                from: sender,
                text: incomingText,
                media: mediaUrl
            });

            broadcast({ type: "new_message", message: saved });

            try {

                const flowDoc =
                    await Flow.findOne({ isMain: true }) ||
                    await Flow.findOne({ name: "Main Flow" });

                if (flowDoc && incomingText) {

                    const nodes = flowDoc.data.drawflow.Home.data;
                    let targetNode = null;

                    /* ---- 1. LISTAS ---- */
                    const listNode = Object.values(nodes).find(n => {
                        if (n.name === "whatsapp_list") {
                            return Object.values(n.data).some(val =>
                                val?.toString().trim().toLowerCase() === incomingText.toLowerCase()
                            );
                        }
                        return false;
                    });

                    if (listNode) {
                        const rowKey = Object.keys(listNode.data).find(k =>
                            listNode.data[k]?.toString().toLowerCase() === incomingText.toLowerCase()
                        );

                        if (rowKey) {
                            const rowNum = rowKey.replace(/\D/g, "");
                            const conn = listNode.outputs[`output_${rowNum}`]?.connections?.[0];
                            if (conn) {
                                targetNode = nodes[conn.node];
                            }
                        }
                    }

                    /* ---- 2. TRIGGERS ---- */
                    if (!targetNode) {
                        targetNode = Object.values(nodes).find(n =>
                            n.name === "trigger" &&
                            n.data.val?.toLowerCase() === incomingText.toLowerCase()
                        );
                    }

                    if (targetNode) {

                        if (targetNode.name === "trigger") {
                            const nextNodeId = targetNode.outputs?.output_1?.connections?.[0]?.node;
                            if (nextNodeId) {
                                await processSequence(sender, nodes[nextNodeId], nodes);
                            }
                        } else {
                            await processSequence(sender, targetNode, nodes);
                        }

                        continue;
                    }
                }

                /* ---- 3. PAGO ---- */
                const waiting = await PaymentWaiting.findOne({
                    chatId: sender,
                    active: true
                });

                if (waiting && waiting.waitingForLink) {

                    const isLink =
                        incomingText.includes("http") ||
                        incomingText.includes(".com") ||
                        incomingText.includes("www.");

                    if (isLink) {

                        waiting.profileLink = incomingText;
                        waiting.waitingForLink = false;
                        await waiting.save();

                        await processSequence(sender, {
                            name: "message",
                            data: {
                                info:
                                    `✅ Link recibido correctamente. ✨\n\n` +
                                    `💳 Ahora, para finalizar, por favor envía el Yape por S/${waiting.amount} ` +
                                    `al numero 991138132 a nombre de Webs Rápidas. 🚀`
                            }
                        }, {});

                    } else {

                        await processSequence(sender, {
                            name: "message",
                            data: {
                                info: "⚠️ Por favor, envía un link válido para continuar. 🔗"
                            }
                        }, {});
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

    } else if (node.name === "media") {

        const mediaPath =
            node.data.url ||
            node.data.media_url ||
            node.data.info ||
            node.data.val;

        if (mediaPath) {

            const domain =
                process.env.RAILWAY_STATIC_URL ||
                "whatsapp-bot2-production-0129.up.railway.app";

            const cleanPath = mediaPath.startsWith("/uploads/")
                ? mediaPath
                : `/uploads/${mediaPath.split("/").pop()}`;

            payload.type = "image";
            payload.image = {
                link: `https://${domain}${cleanPath}`,
                caption: node.data.caption || ""
            };

            botText = "🖼️ Imagen enviada";
        }

    } else if (node.name === "notify") {

        const myNumber = "51933425911";

        axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: myNumber,
                type: "text",
                text: {
                    body:
                        `🔔 *AVISO:* El cliente ${to} llegó al nodo: _${node.data.info || "Alerta"}_`
                }
            },
            { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
        ).catch(e => console.error("Error notify:", e.message));

        if (node.outputs?.output_1?.connections?.[0]) {
            const nextNodeId = node.outputs.output_1.connections[0].node;
            return await processSequence(to, allNodes[nextNodeId], allNodes);
        }

        return;

    } else if (node.name === "whatsapp_list") {

        try {

            const rows = [];

            for (let i = 1; i <= 10; i++) {

                const rowTitle = node.data[`row${i}`];

                if (rowTitle && rowTitle.toString().trim() !== "") {

                    rows.push({
                        id: `row_${node.id}_${i}`,
                        title: rowTitle.toString().substring(0, 24).trim(),
                        description:
                            (node.data[`desc${i}`] || "")
                                .toString()
                                .substring(0, 72)
                                .trim()
                    });
                }
            }

            if (rows.length === 0) return;

            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                header: { type: "text", text: "Opciones Disponibles" },
                body: {
                    text: (node.data.body || "Selecciona una opción:")
                        .substring(0, 1024)
                },
                footer: { text: "Webs Rápidas 🚀" },
                action: {
                    button: (node.data.btn || "Ver Menú")
                        .substring(0, 20),
                    sections: [
                        { title: "Servicios", rows }
                    ]
                }
            };

            botText = "📋 Menú enviado";

        } catch (e) {
            console.error("Error lista:", e.message);
        }

    } else if (node.name === "payment_validation") {

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

        botText =
            `🚀 ¡Excelente elección!\n\n` +
            `🔗 Por favor pega aquí el *link* para procesar tu pedido. ✨`;

        payload.type = "text";
        payload.text = { body: botText };
    }

    try {

        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
        );

        const savedBot = await Message.create({
            chatId: to,
            from: "me",
            text: botText
        });

        broadcast({ type: "new_message", message: savedBot });

        if (node.name === "whatsapp_list") return;

        if (node.outputs?.output_1?.connections?.[0]) {

            const nextNodeId = node.outputs.output_1.connections[0].node;

            await new Promise(r => setTimeout(r, 1500));

            return await processSequence(
                to,
                allNodes[nextNodeId],
                allNodes
            );
        }

    } catch (err) {
        console.error(
            "❌ Error processSequence:",
            err.response?.data || err.message
        );
    }
}

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

                await PaymentWaiting.updateOne(
                    { _id: waiting._id },
                    { active: false }
                );

                await processSequence(waiting.chatId, {
                    name: "message",
                    data: {
                        info:
                            "✅ ¡Yape verificado! 🚀 Tu pedido ya está en proceso. ✨"
                    }
                }, {});

                return res.sendStatus(200);
            }
        }

    } catch (err) {
        console.error("❌ Error Yape:", err.message);
    }

    res.sendStatus(200);
});

/* ========================= APIS RESTO ========================= */

app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ isMain: true });
    res.json(flow ? flow.data : null);
});

app.post("/api/save-flow", async (req, res) => {
    try {

        const { id, name, data } = req.body;
        const finalName = name || "Main Flow";
        const shouldBeMain = (finalName === "Main Flow");

        if (shouldBeMain) {
            await Flow.updateMany({}, { isMain: false });
        }

        let updatedFlow = await Flow.findOneAndUpdate(
            { name: finalName },
            { data, isMain: shouldBeMain },
            { new: true, upsert: true }
        );

        res.json({ success: true, id: updatedFlow._id });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/chats", async (req, res) => {

    const chats = await Message.aggregate([
        { $sort: { timestamp: 1 } },
        {
            $group: {
                _id: "$chatId",
                lastMessage: { $last: "$text" },
                lastTime: { $last: "$timestamp" }
            }
        },
        { $sort: { lastTime: -1 } }
    ]);

    res.json(chats);
});

app.get("/messages/:chatId", async (req, res) => {
    const messages = await Message
        .find({ chatId: req.params.chatId })
        .sort({ timestamp: 1 });

    res.json(messages);
});

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsPath),
        filename: (req, file, cb) =>
            cb(null, Date.now() + "-" + file.originalname)
    })
});

app.post("/api/upload-node-media",
    upload.single("file"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({ error: "No hay archivo" });
        }

        res.json({ url: `/uploads/${req.file.filename}` });
    }
);

app.post("/send-message", async (req, res) => {

    const { to, text, mediaUrl } = req.body;

    try {

        let payload = { messaging_product: "whatsapp", to };

        if (mediaUrl) {

            payload.type = "image";
            payload.image = {
                link:
                    `https://${process.env.RAILWAY_STATIC_URL || req.get("host")}${mediaUrl}`,
                caption: text || ""
            };

        } else {

            payload.type = "text";
            payload.text = { body: text };
        }

        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
        );

        const saved = await Message.create({
            chatId: to,
            from: "me",
            text: text || "📷 Imagen",
            media: mediaUrl
        });

        broadcast({ type: "new_message", message: saved });

        res.json({ success: true });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("🚀 Server Punto Nemo Estable - Todo restaurado ✨");
});
/* ========================= CONFIGURACIÓN DE RUTAS ESTATICAS ========================= */
// Asegúrate de que esta carpeta coincida con el nombre en tu proyecto



app.use("/uploads", express.static(uploadsPath));


// RUTA RAIZ: Para que al abrir la URL cargue el index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(chatPath, "index.html"));
});

/* ========================= APIS PARA QUE CARGUEN LOS FLUJOS ========================= */

// 1. Obtener el flujo principal (Para el bot)
app.get("/api/get-flow", async (req, res) => {
    const flow = await Flow.findOne({ isMain: true }) || await Flow.findOne({ name: "Main Flow" });
    res.json(flow ? flow.data : null);
});

// 2. LISTAR todos los flujos (Para que aparezcan en tu panel de control)
app.get("/api/get-flows", async (req, res) => {
    try {
        const flows = await Flow.find({}, { name: 1, isMain: 1 });
        res.json(flows);
    } catch (e) {
        res.status(500).json([]);
    }
});


// 3. Cargar un flujo específico por ID
app.get("/api/get-flow-by-id/:id", async (req, res) => {
    try {
        const flow = await Flow.findById(req.params.id);
        res.json(flow ? flow.data : null);
    } catch (e) {
        res.status(500).json(null);
    }
});
