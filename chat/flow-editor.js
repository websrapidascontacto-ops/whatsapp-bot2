/* ============================================================
   CONFIGURACIÓN INICIAL DE DRAWFLOW
   ============================================================ */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();

// Configuración de Zoom
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
    lastNodeX += 380; // Coloca la nueva caja a la derecha
    if (lastNodeX > 1400) { // Salto de línea si llega al borde
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
    console.log("Guardando flujo...", data);
    window.parent.postMessage({ type: 'SAVE_FLOW', data }, '*');
};

window.addEventListener('message', (e) => {
    if (e.data.type === 'LOAD_FLOW' && e.data.data) {
        editor.import(e.data.data);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        window.parent.postMessage({ type: 'REQUEST_FLOW' }, '*');
    }, 500);
});

/* ============================================================
   FUNCIONES PARA CREAR NODOS
   ============================================================ */
function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
    // Botón de eliminar nodo (Style UX)
    const nodeElem = document.getElementById(`node-${nodeId}`);
    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "×";
    closeBtn.className = "node-close-btn";
    closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
    nodeElem.appendChild(closeBtn);
}

// 1. Nodo Trigger
window.addTriggerNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <label>Palabra Clave:</label>
                <input type="text" class="form-control" df-val placeholder="Ej: hola">
            </div>
        </div>`;
    createNode("trigger", 0, 1, html);
};

// 2. Nodo Mensaje
window.addMessageNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <label>Texto:</label>
                <textarea class="form-control" df-info rows="3"></textarea>
            </div>
        </div>`;
    createNode("message", 1, 1, html);
};

// 3. Nodo IA
window.addIANode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <label>Contexto:</label>
                <textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132</textarea>
            </div>
        </div>`;
    createNode("ia", 1, 1, html);
};

// 4. Nodo Menú Numérico
window.addMenuNode = function() {
    const nodeId = editor.getNextId();
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
    createNode("menu", 1, 1, html);
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

// 5. NUEVO: Nodo Lista de WhatsApp
window.addListNode = function() {
    const nodeId = editor.getNextId();
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
                <div id="list-items-${nodeId}" class="menu-options-list">
                    <label class="small text-muted">Filas:</label>
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addListRow(${nodeId})">+ Añadir Fila</button>
            </div>
        </div>`;
    createNode("whatsapp_list", 1, 1, html);
};

window.addListRow = function(nodeId) {
    const container = document.getElementById(`list-items-${nodeId}`);
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
    // Vincular botones del header si existen
    const btnTrigger = document.querySelector(".btn-trigger");
    if(btnTrigger) btnTrigger.onclick = window.addTriggerNode;

    const btnIA = document.querySelector(".btn-ia");
    if(btnIA) btnIA.onclick = window.addIANode;

    const btnMsg = document.querySelector(".btn-message");
    if(btnMsg) btnMsg.onclick = window.addMessageNode;

    const btnMenu = document.querySelector(".btn-menu");
    if(btnMenu) btnMenu.onclick = window.addMenuNode;
    
    const btnList = document.querySelector(".btn-list");
    if(btnList) btnList.onclick = window.addListNode;
});