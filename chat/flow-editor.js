const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();

/* ================= POSICIONAMIENTO LÓGICO ================= */
let lastNodeX = 50;
let lastNodeY = 150;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; // Coloca la nueva caja a la derecha
    if (lastNodeX > 1400) { // Salto de línea si se llena el ancho
        lastNodeX = 50;
        lastNodeY += 400;
    }
    return pos;
}

/* ================= FUNCIONES DE NODOS ================= */
function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
    // Botón de eliminar con estilo
    const nodeElem = document.getElementById(`node-${nodeId}`);
    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "×";
    closeBtn.className = "node-close-btn";
    closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
    nodeElem.appendChild(closeBtn);
}

function addTriggerNode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <label>Palabra Clave:</label>
                <input type="text" class="form-control" df-val placeholder="Ej: hola">
            </div>
        </div>
    `;
    createNode("trigger", 0, 1, html);
}

function addMessageNode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <label>Respuesta:</label>
                <textarea class="form-control" df-info rows="3" placeholder="Hola, ¿en qué ayudo?"></textarea>
            </div>
        </div>
    `;
    createNode("message", 1, 1, html);
}

function addIANode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chat</div>
            <div class="node-body">
                <label>Instrucciones IA:</label>
                <textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132. Web: websrapidas.com</textarea>
            </div>
        </div>
    `;
    createNode("ia", 1, 1, html);
}

function addMenuNode() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título del menú">
                <div id="options-${nodeId}" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addOption(${nodeId})">+ Opción</button>
            </div>
        </div>
    `;
    createNode("menu", 1, 1, html);
}

window.addOption = function(nodeId) {
    const container = document.getElementById(`options-${nodeId}`);
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-option${count}`, "");
    container.appendChild(input);
};

/* ================= GUARDAR Y CARGAR ================= */
function saveFlow() {
    const data = editor.export();
    window.parent.postMessage({ type: 'SAVE_FLOW', data }, '*');
}

// Escuchar carga de datos desde el CRM
window.addEventListener('message', (e) => {
    if (e.data.type === 'LOAD_FLOW' && e.data.data) {
        editor.import(e.data.data);
    }
});

// Solicitar datos al iniciar
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        window.parent.postMessage({ type: 'REQUEST_FLOW' }, '*');
    }, 500);
});