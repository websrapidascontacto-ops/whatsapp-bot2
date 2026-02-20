const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();

/* ================= CONFIGURACIÓN ZOOM ================= */
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

/* ================= POSICIONAMIENTO AUTOMÁTICO ================= */
let lastNodeX = 50;
let lastNodeY = 100;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 350; // Desplazamiento a la derecha para el siguiente cuadro
    if (lastNodeX > 1500) { // Si llega muy lejos, baja una fila
        lastNodeX = 50;
        lastNodeY += 400;
    }
    return pos;
}

/* ================= COMUNICACIÓN CON EL CRM ================= */
function saveFlow() {
    const flowData = editor.export();
    // Enviamos los datos al index.html (padre) para que los guarde en Mongo
    window.parent.postMessage({ 
        type: 'SAVE_FLOW', 
        data: flowData 
    }, '*');
}

// Escuchar cuando el CRM envía datos para cargar el flujo
window.addEventListener('message', function(event) {
    if (event.data.type === 'LOAD_FLOW' && event.data.data) {
        editor.import(event.data.data);
        updateMinimap();
    }
});

// Al cargar el documento, pedir al servidor los datos guardados
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        window.parent.postMessage({ type: 'REQUEST_FLOW' }, '*');
    }, 500);
});

/* ================= CREACIÓN DE NODOS ================= */
function createNode(type, inputs, outputs, html) {
    const pos = getNextPosition();
    const id = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, {}, html);
    
    // Botón de eliminar nodo
    const nodeElement = document.getElementById(`node-${id}`);
    const close = document.createElement("div");
    close.innerHTML = "✕";
    close.className = "node-close-btn";
    close.onclick = () => editor.removeNodeId("node-" + id);
    nodeElement.appendChild(close);
    
    updateMinimap();
}

function addTriggerNode() {
    createNode("trigger", 0, 1, `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <p class="small text-muted">Palabra clave para iniciar:</p>
                <input type="text" class="form-control" df-val placeholder="Ej: hola">
            </div>
        </div>
    `);
}

function addIANode() {
    createNode("ia", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <p class="small text-muted">Contexto de la IA:</p>
                <textarea class="form-control" df-info rows="3">Base: S/380. Web: websrapidas.com</textarea>
            </div>
        </div>
    `);
}

function addMessageNode() {
    createNode("message", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <p class="small text-muted">Respuesta directa:</p>
                <textarea class="form-control" df-info rows="3" placeholder="Tu mensaje aquí..."></textarea>
            </div>
        </div>
    `);
}

function addMenuNode() {
    const id = editor.getNextId();
    createNode("menu", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título del menú">
                <div class="menu-list" id="list-${id}">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-outline-primary btn-sm w-100 mt-2" onclick="addOptionToNode(${id})">+ Opción</button>
            </div>
        </div>
    `);
}

window.addOptionToNode = function(nodeId) {
    const list = document.getElementById(`list-${nodeId}`);
    const optionCount = list.querySelectorAll("input").length + 1;
    
    // Añadimos salida en el nodo de Drawflow
    editor.addNodeOutput(nodeId);
    
    // Añadimos el input visual
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control mb-1";
    input.setAttribute(`df-option${optionCount}`, "");
    input.placeholder = `Opción ${optionCount}`;
    list.appendChild(input);
};

/* ================= MINIMAPA ================= */
function updateMinimap() {
    const minimap = document.getElementById("minimap");
    minimap.innerHTML = "";
    const scale = 0.1;
    
    container.querySelectorAll(".drawflow-node").forEach(node => {
        const dot = document.createElement("div");
        dot.style.position = "absolute";
        dot.style.width = "20px";
        dot.style.height = "15px";
        dot.style.left = (node.offsetLeft * scale) + "px";
        dot.style.top = (node.offsetTop * scale) + "px";
        dot.style.background = "var(--primary)";
        dot.style.borderRadius = "2px";
        minimap.appendChild(dot);
    });
}

editor.on("nodeCreated", updateMinimap);
editor.on("nodeMoved", updateMinimap);