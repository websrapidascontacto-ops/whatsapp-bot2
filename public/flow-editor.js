const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = false;
editor.start();

/* ================= CONFIGURACIÓN DE ZOOM ================= */
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

/* ================= POSICIONAMIENTO DINÁMICO ================= */
let lastNodeX = 100;
let lastNodeY = 200;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; // Coloca el nuevo nodo al lado del anterior [Ajuste solicitado]
    return pos;
}

/* ================= FUNCIÓN DE SINCRONIZACIÓN (SOLUCIÓN AL ERROR VACÍO) ================= */
// Esta función vincula los inputs HTML con el motor de datos de Drawflow en tiempo real
window.updateNodeData = function(input, key) {
    const nodeElement = input.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const node = editor.getNodeFromId(nodeId);
    
    // Actualizamos el objeto data internamente
    node.data[key] = input.value;
    console.log(`✅ Datos actualizados en Nodo ${nodeId}: ${key} = "${input.value}"`);
};

/* ================= GUARDAR FLUJO ================= */
function saveFlow() {
    const flowData = editor.export();
    console.log("Enviando flujo al CRM...");
    window.parent.postMessage({ 
        type: 'SAVE_FLOW', 
        data: flowData 
    }, '*');
}

/* ================= CREACIÓN DE NODOS ================= */
function addCloseButton(nodeId) {
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;
    const close = document.createElement("div");
    close.innerHTML = "✕";
    close.className = "node-close-btn";
    close.onclick = (e) => {
        e.stopPropagation();
        editor.removeNodeId("node-" + nodeId);
        updateMinimap();
    };
    nodeElement.appendChild(close);
}

function addTriggerNode() {
    const pos = getNextPosition();
    // Añadimos oninput para capturar cada tecla en 'val'
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <input type="text" class="form-control" placeholder="Ej: Hola" 
                oninput="updateNodeData(this, 'val')">
            </div>
        </div>
    `;
    const id = editor.addNode("trigger", 0, 1, pos.x, pos.y, "trigger", { val: "" }, html);
    setTimeout(() => addCloseButton(id), 50);
    updateMinimap();
}

function addIANode() {
    const pos = getNextPosition();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <textarea class="form-control" rows="3" 
                oninput="updateNodeData(this, 'info')">Base: S/380. WhatsApp: 991138132. Website: https://www.websrapidas.com</textarea>
            </div>
        </div>
    `;
    const id = editor.addNode("ia", 1, 1, pos.x, pos.y, "ia", { info: "Base: S/380. WhatsApp: 991138132." }, html);
    setTimeout(() => addCloseButton(id), 50);
    updateMinimap();
}

function addMessageNode() {
    const pos = getNextPosition();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <textarea class="form-control" rows="3" placeholder="Tu respuesta..." 
                oninput="updateNodeData(this, 'info')"></textarea>
            </div>
        </div>
    `;
    const id = editor.addNode("message", 1, 1, pos.x, pos.y, "message", { info: "" }, html);
    setTimeout(() => addCloseButton(id), 50);
    updateMinimap();
}

function addMenuNode() {
    const pos = getNextPosition();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" placeholder="Título" oninput="updateNodeData(this, 'info')">
                <div class="menu-list">
                    <input type="text" class="form-control mb-1" placeholder="Opción 1" oninput="updateNodeData(this, 'option1')">
                </div>
                <button class="btn btn-outline-primary btn-sm w-100 mt-2" onclick="addOption(this)">+ Opción</button>
            </div>
        </div>
    `;
    const id = editor.addNode("menu", 1, 1, pos.x, pos.y, "menu", { info: "", option1: "" }, html);
    setTimeout(() => addCloseButton(id), 50);
    updateMinimap();
}

window.addOption = function(btn) {
    const nodeElement = btn.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const list = btn.parentElement.querySelector(".menu-list");
    const count = list.querySelectorAll("input").length + 1;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    // Vinculamos la nueva opción dinámicamente con su llave única
    input.oninput = function() { updateNodeData(this, 'option' + count); };
    
    list.appendChild(input);
    editor.addNodeOutput(nodeId); // Crea el punto de conexión visual para la nueva opción
};

/* ================= LÓGICA DE MINIMAPA ================= */
const minimap = document.getElementById("minimap");
const mapCanvas = document.createElement("div");
mapCanvas.style.position = "relative";
mapCanvas.style.width = "100%";
mapCanvas.style.height = "100%";
minimap.appendChild(mapCanvas);

const viewport = document.createElement("div");
viewport.style.position = "absolute";
viewport.style.border = "2px solid #2563eb";
viewport.style.background = "rgba(37,99,235,0.2)";
viewport.style.pointerEvents = "none";
mapCanvas.appendChild(viewport);

function updateMinimap() {
    mapCanvas.innerHTML = "";
    mapCanvas.appendChild(viewport);
    const scale = 0.1;
    container.querySelectorAll(".drawflow-node").forEach(node => {
        const clone = document.createElement("div");
        clone.style.position = "absolute";
        clone.style.width = node.offsetWidth * scale + "px";
        clone.style.height = node.offsetHeight * scale + "px";
        clone.style.left = node.offsetLeft * scale + "px";
        clone.style.top = node.offsetTop * scale + "px";
        clone.style.background = "#1e293b";
        clone.style.borderRadius = "4px";
        mapCanvas.appendChild(clone);
    });
    viewport.style.left = (-editor.precanvas_x * scale) + "px";
    viewport.style.top = (-editor.precanvas_y * scale) + "px";
    viewport.style.width = (container.clientWidth * scale) + "px";
    viewport.style.height = (container.clientHeight * scale) + "px";
}

/* ================= EVENTOS DE DRAWFLOW ================= */
editor.on("nodeCreated", updateMinimap);
editor.on("nodeRemoved", updateMinimap);
editor.on("nodeMoved", updateMinimap);
editor.on("zoom", updateMinimap);
editor.on("translate", updateMinimap);

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".btn-trigger").onclick = addTriggerNode;
    document.querySelector(".btn-ia").onclick = addIANode;
    document.querySelector(".btn-message").onclick = addMessageNode;
    document.querySelector(".btn-menu").onclick = addMenuNode;
    setTimeout(updateMinimap, 500);
});

// Cargar flujo desde el CRM
window.addEventListener('message', function(event) {
    if (event.data.type === 'LOAD_FLOW') {
        editor.import(event.data.data);
        updateMinimap();
    }
});