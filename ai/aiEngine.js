const LAST_AI_CALL = new Map();

function canCallAI(chatId) {
    const now = Date.now();
    const last = LAST_AI_CALL.get(chatId);

    if (last && now - last < 4000) return false;

    LAST_AI_CALL.set(chatId, now);
    return true;
}
const axios = require("axios");

/*
========================================================
IA ENGINE INTELIGENTE - MODO VENDEDOR AUTÓNOMO
========================================================
*/

async function ejecutarIAsola(chatId, textoUsuario, models) {

    try {

        const {
            Message,
            enviarWhatsApp,
            Flow,
            processSequence,
            UserStatus
        } = models || {};

        if (!Message || !enviarWhatsApp || !Flow || !processSequence) return;

/*
========================================================
CONTEXTO CONVERSACIONAL PERSISTENTE
========================================================
*/

const status = await UserStatus.findOne({ chatId });

const contextoNodo = status ? status.lastNodeId : null;

let hintSistema = "";

if (contextoNodo) {

    const mapaContexto = {
        "23": `
El cliente está viendo el menú principal.

Si pregunta por servicios → usa [ACTION:MENU_REDES]
`,
        "12": `
Cliente en sección TikTok.

Si quiere comprar → muéstrale planes TikTok.
`,
        "46": `
Cliente en sección Instagram.

Si quiere comprar → muéstrale planes Instagram.
`,
        "13": `
Cliente en sección Facebook.

Si quiere comprar → muéstrale planes Facebook.
`,
        "payment_validation": `
Cliente en proceso de pago.

Solo guíalo a enviar:
→ Link del perfil
→ Código de seguridad
`
    };

    hintSistema = mapaContexto[contextoNodo] || "";
}
const intentCompraKeywords = [
    "comprar",
    "precio",
    "plan",
    "seguidores",
    "likes",
    "vistas",
    "servicio",
    "quiero"
];

const esIntencionCompra = intentCompraKeywords.some(word =>
    textoUsuario.toLowerCase().includes(word)
);
        /*
        ===============================
        LLAMADA A TU API IA
        ===============================
        */

        const response = await axios.post(
            "https://whatsapp-bot2-production.up.railway.app/api/ai-chat",
            {
    message: textoUsuario,
    chatId,
    contexto: contextoNodo,
    hint: hintSistema
},
            {
                timeout: 30000
            }
        );

        const data = response.data;

        if (!data?.text) return;

        let textoIA = data.text;

        /*
        ===============================
        ROUTING POR ACCIONES
        ===============================
        */

        const actions = {
            MENU_REDES: "23",
            TIKTOK: "12",
            INSTAGRAM: "46",
            FACEBOOK: "13"
        };

        let targetNodeId = null;

        for (const key in actions) {

            if (textoIA.includes(`[ACTION:${key}]`)) {

                targetNodeId = actions[key];

                textoIA = textoIA
                    .replace(`[ACTION:${key}]`, "")
                    .trim();
            }
        }

        /*
        ===============================
        ENVIAR RESPUESTA WHATSAPP
        ===============================
        */

        if (textoIA) {
            await enviarWhatsApp(chatId, textoIA);
        }

        /*
        ===============================
        ENCAMINAR FLUJO SI EXISTE ACTION
        ===============================
        */

        if (targetNodeId) {

            const flowDoc = await Flow.findOne({ isMain: true });

            if (!flowDoc) return;

            const nodes = flowDoc.data.drawflow.Home.data;

            const node = nodes[targetNodeId];

            if (node) {
                await processSequence(chatId, node, nodes);
            }

            return;
        }

        /*
        ===============================
        GUARDAR CONVERSACIÓN BOT
        ===============================
        */

        await Message.create({
            chatId,
            from: "bot",
            text: textoIA
        });

    } catch (err) {
        console.error("❌ IA Engine Error:", err.message);
    }
}

module.exports = {
    ejecutarIAsola
};
