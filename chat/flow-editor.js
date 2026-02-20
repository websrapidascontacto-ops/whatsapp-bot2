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

container.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

/* ============================================================
   SISTEMA DE POSICIONAMIENTO AUTOMÁTICO (UX)
   ============================================================ */
let lastNodeX = 50;
let lastNodeY = 150;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; 
    if (lastNodeX > 1400) {
        lastNodeX = 50;
        lastNodeY += 450;
    }
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
   FUNCIONES PARA CREAR NODOS
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

window.addTriggerNode = function() {
    createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><label>Palabra Clave:</label><input type="text" class="form-control" df-val placeholder="Ej: hola"></div></div>`);
};

window.addMessageNode = function() {
    createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><label>Texto:</label><textarea class="form-control" df-info rows="3"></textarea></div></div>`);
};

window.addIANode = function() {
    createNode("ia", 1, 1, `<div class="node-wrapper"><div class="node-header header-ia">🤖 IA Chatbot</div><div class="node-body"><label>Contexto:</label><textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132</textarea></div></div>`);
};

// --- CORRECCIÓN DE ID EN MENÚ ---
window.addMenuNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú Numérico</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título">
                <div id="options-TEMP_ID" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addMenuOption(TEMP_ID)">+ Opción</button>
            </div>
        </div>`;
    const nodeId = createNode("menu", 1, 1, html);
    // Reemplazamos el ID temporal por el real generado
    const nodeElem = document.getElementById(`node-${nodeId}`);
    nodeElem.innerHTML = nodeElem.innerHTML.replace(/TEMP_ID/g, nodeId);
};

window.addMenuOption = function(nodeId) {
    const container = document.getElementById(`options-${nodeId}`);
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-option${count}`, "");
    container.appendChild(input);
};

// --- CORRECCIÓN DE ID EN LISTA (SOLUCIÓN AL ERROR) ---
window.addListNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list" style="background: #056162; color: white;">
                <i class="fa-solid fa-list-ul"></i> Lista Interactiva
            </div>
            <div class="node-body">
                <label class="small text-muted">Cuerpo del mensaje:</label>
                <input type="text" class="form-control mb-2" df-list_title placeholder="Ej: Elige un plan">
                <label class="small text-muted">Texto del Botón:</label>
                <input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Servicios">
                <div id="list-items-TEMP_ID" class="menu-options-list">
                    <label class="small text-muted">Filas:</label>
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addListRow(TEMP_ID)">+ Añadir Fila</button>
            </div>
        </div>`;
    
    const nodeId = createNode("whatsapp_list", 1, 1, html);
    
    // Aquí está el truco: actualizamos el HTML del nodo con su ID real después de crearlo
    const nodeElem = document.getElementById(`node-${nodeId}`);
    nodeElem.innerHTML = nodeElem.innerHTML.replace(/TEMP_ID/g, nodeId);
};

window.addListRow = function(nodeId) {
    const container = document.getElementById(`list-items-${nodeId}`);
    if(!container) return;
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-row${count}`, "");
    container.appendChild(input);
};

/* ============================================================
   VINCULACIÓN INICIAL
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    const btns = {
        ".btn-trigger": window.addTriggerNode,
        ".btn-ia": window.addIANode,
        ".btn-message": window.addMessageNode,
        ".btn-menu": window.addMenuNode,
        ".btn-list": window.addListNode
    };
    for (let s in btns) {
        let b = document.querySelector(s);
        if (b) b.onclick = btns[s];
    }
});