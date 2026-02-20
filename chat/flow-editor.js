/* ============================================================
   CONFIGURACIÓN INICIAL DE DRAWFLOW
   ============================================================ */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.5;

/* ============================================================
   MOTOR DE CREACIÓN DE NODOS
   ============================================================ */
let lastNodeX = 50;
let lastNodeY = 150;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; 
    if (lastNodeX > 1400) { lastNodeX = 50; lastNodeY += 450; }
    return pos;
}

function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
    setTimeout(() => {
        const nodeElem = document.getElementById(`node-${nodeId}`);
        if (nodeElem) {
            const closeBtn = document.createElement("div");
            closeBtn.innerHTML = "×";
            closeBtn.className = "node-close-btn";
            closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
            nodeElem.appendChild(closeBtn);
        }
    }, 50);
    return nodeId;
}

/* ============================================================
   FUNCIONES DE NODOS
   ============================================================ */
window.addTriggerNode = () => {
    createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><label class="small">Palabra Clave:</label><input type="text" class="form-control" df-val placeholder="Ej: hola"></div></div>`, { val: '' });
};

window.addMessageNode = () => {
    createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><label class="small">Texto:</label><textarea class="form-control" df-info rows="3"></textarea></div></div>`, { info: '' });
};

window.addIANode = () => {
    createNode("ia", 1, 1, `<div class="node-wrapper"><div class="node-header header-ia">🤖 IA Chatbot</div><div class="node-body"><label class="small">Contexto:</label><textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132</textarea></div></div>`, { info: '' });
};

window.addMenuNode = function() {
    const nodeId = editor.node_id;
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú Numérico</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título del Menú">
                <div id="menu-items-${nodeId}">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addRow(${nodeId}, 'option')">+ Opción</button>
            </div>
        </div>`;
    createNode("menu", 1, 1, html, { info: '', option1: '' });
};

window.addListNode = function() {
    const nodeId = editor.node_id;
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list">📝 Lista WhatsApp</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-list_title placeholder="Título de la Lista">
                <input type="text" class="form-control mb-2" df-button_text placeholder="Texto del Botón">
                <div id="list-items-${nodeId}">
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Fila 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addRow(${nodeId}, 'row')">+ Fila</button>
            </div>
        </div>`;
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '' });
};

window.addRow = (nodeId, prefix) => {
    const container = document.getElementById(prefix === 'row' ? `list-items-${nodeId}` : `menu-items-${nodeId}`);
    if(!container) return;
    
    const count = container.querySelectorAll("input").length + 1;
    if(count > 10) return alert("Máximo 10 opciones");

    editor.addNodeOutput(nodeId);
    
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = (prefix === 'row' ? "Fila " : "Opción ") + count;
    input.setAttribute(`df-${prefix}${count}`, "");
    container.appendChild(input);
    
    // Sincronizar data interna para evitar que el JSON se guarde sin estas propiedades
    const node = editor.getNodeFromId(nodeId);
    node.data[`${prefix}${count}`] = "";
};

window.saveFlow = function() {
    const data = editor.export();
    window.parent.postMessage({ type: 'SAVE_FLOW', data }, '*');
};

window.addEventListener('message', (e) => {
    if (e.data.type === 'LOAD_FLOW' && e.data.data) {
        editor.import(e.data.data);
    }
});