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
   FUNCIONES DE CREACIÓN DE NODOS
   ============================================================ */
function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
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

window.addMenuNode = function() {
    const nodeId = editor.getNextId(); // Obtenemos el ID antes de crear el HTML
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú Numérico</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título">
                <div id="options-${nodeId}" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addMenuOption(${nodeId})">+ Opción</button>
            </div>
        </div>`;
    createNode("menu", 1, 1, html, { info: '', option1: '' });
};

window.addMenuOption = (nodeId) => {
    const container = document.getElementById(`options-${nodeId}`);
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-option${count}`, "");
    container.appendChild(input);
    editor.updateNodeValueById(nodeId); // Sincroniza con Drawflow
};

// --- MÓDULO DE LISTA ARREGLADO ---
window.addListNode = function() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list">
                <i class="fa-solid fa-list-ul"></i> Lista Interactiva
            </div>
            <div class="node-body">
                <label class="small text-muted">Título del Menú:</label>
                <input type="text" class="form-control mb-2" df-list_title placeholder="Ej: Nuestros Servicios">
                <label class="small text-muted">Texto del Botón:</label>
                <input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Opciones">
                <div id="list-items-${nodeId}" class="menu-options-list">
                    <label class="small text-muted">Opciones (Filas):</label>
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addListRow(${nodeId})">+ Añadir Fila</button>
            </div>
        </div>`;
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '' });
};

window.addListRow = (nodeId) => {
    const container = document.getElementById(`list-items-${nodeId}`);
    if(!container) return;
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-row${count}`, "");
    container.appendChild(input);
    editor.updateNodeValueById(nodeId);
};