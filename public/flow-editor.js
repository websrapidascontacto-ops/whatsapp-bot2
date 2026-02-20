const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = false;
editor.start();

/* ================= ZOOM ================= */
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

/* ================= POSICIONAMIENTO ================= */
let lastNodeX = 100;
let lastNodeY = 200;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; 
    return pos;
}

/* ================= GUARDAR ================= */
function saveFlow() {
    const flowData = editor.export();
    // Enviamos el objeto al padre (index.html)
    window.parent.postMessage({ type: 'SAVE_FLOW', data: flowData }, '*');
}

/* ================= NODOS ================= */
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

function createNode(type, inputs, outputs, html) {
    const pos = getNextPosition();
    const id = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, {}, html);
    setTimeout(() => addCloseButton(id), 50);
    updateMinimap();
}

function addTriggerNode() {
    createNode("trigger", 0, 1, `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <input type="text" class="form-control" placeholder="Ej: hola" df-val>
            </div>
        </div>
    `);
}

function addIANode() {
    createNode("ia", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <textarea class="form-control" rows="3" df-info>Base: S/380. WhatsApp: 991138132.</textarea>
            </div>
        </div>
    `);
}

function addMessageNode() {
    createNode("message", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <textarea class="form-control" rows="3" df-info></textarea>
            </div>
        </div>
    `);
}

function addMenuNode() {
    createNode("menu", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú (Lista)</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" placeholder="Título del menú" df-info>
                <div class="menu-list">
                    <input type="text" class="form-control mb-1" placeholder="Opción 1" df-option1>
                </div>
                <button class="btn btn-outline-primary btn-sm w-100 mt-2" onclick="addOption(this)">+ Opción</button>
            </div>
        </div>
    `);
}

window.addOption = function(btn) {
    const list = btn.parentElement.querySelector(".menu-list");
    const optionCount = list.querySelectorAll("input").length + 1;
    const nodeId = btn.closest(".drawflow-node").id.replace("node-", "");
    
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control mb-1";
    input.placeholder = `Opción ${optionCount}`;
    const attrName = `option${optionCount}`;
    input.setAttribute(`df-${attrName}`, ""); 

    // FUERZA EL GUARDADO: Sin esto, Drawflow no registra los inputs nuevos
    input.addEventListener('input', (e) => {
        editor.updateNodeDataFromId(nodeId, { [attrName]: e.target.value });
    });

    list.appendChild(input);
    editor.addNodeOutput(nodeId);
};

/* ================= MINIMAPA ================= */
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
        clone.style.width = (node.offsetWidth * scale) + "px";
        clone.style.height = (node.offsetHeight * scale) + "px";
        clone.style.left = (node.offsetLeft * scale) + "px";
        clone.style.top = (node.offsetTop * scale) + "px";
        clone.style.background = "#1e293b";
        clone.style.borderRadius = "4px";
        mapCanvas.appendChild(clone);
    });
}

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

window.addEventListener('message', function(event) {
    if (event.data.type === 'LOAD_FLOW') {
        editor.import(event.data.data);
        updateMinimap();
    }
});