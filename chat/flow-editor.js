/* ============================================================
   CONFIGURACIÓN INICIAL DE DRAWFLOW
   ============================================================ */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.deltaY < 0 ? editor.zoom_in() : editor.zoom_out();
});

/* ============================================================
   SISTEMA DE POSICIONAMIENTO AUTOMÁTICO
   ============================================================ */
let lastNodeX = 50;
let lastNodeY = 150;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; 
    if (lastNodeX > 1400) { lastNodeX = 50; lastNodeY += 450; }
    return pos;
}

/* ============================================================
   COMUNICACIÓN Y GUARDADO
   ============================================================ */
window.saveFlow = function() {
    const data = editor.export();
    window.parent.postMessage({ type: 'SAVE_FLOW', data }, '*');
};

window.addEventListener('message', (e) => {
    if (e.data.type === 'LOAD_FLOW' && e.data.data) {
        editor.import(e.data.data);
    }
});

/* ============================================================
   FUNCIONES DE CREACIÓN DE NODOS BASE
   ============================================================ */
function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
    // Botón de cerrar para todos los nodos
    const nodeElem = document.getElementById(`node-${nodeId}`);
    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "×";
    closeBtn.className = "node-close-btn";
    closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
    nodeElem.appendChild(closeBtn);
    return nodeId;
}

window.addTriggerNode = () => {
    createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><label>Palabra Clave:</label><input type="text" class="form-control" df-val placeholder="Ej: hola"></div></div>`);
};

window.addMessageNode = () => {
    createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><label>Texto:</label><textarea class="form-control" df-info rows="3"></textarea></div></div>`);
};

window.addIANode = () => {
    createNode("ia", 1, 1, `<div class="node-wrapper"><div class="node-header header-ia">🤖 IA Chatbot</div><div class="node-body"><label>Contexto:</label><textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132</textarea></div></div>`);
};