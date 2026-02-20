const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = false;
editor.start();

/* ================= ZOOM ================= */

editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

let lastNodeX = 100;
let lastNodeY = 200;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380;
    return pos;
}

/* ================= DATA SYNC (FIX CRÍTICO) ================= */

window.updateNodeData = function(nodeId, key, value) {
    const node = editor.getNodeFromId(nodeId);
    if (!node.data) node.data = {};
    node.data[key] = value;

    editor.updateNodeDataFromId(nodeId, node.data);
};

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
    const id = editor.getNextId();
    createNode("trigger", 0, 1, `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <input type="text" class="form-control"
                placeholder="Ej: hola"
                oninput="updateNodeData(${id}, 'val', this.value)">
            </div>
        </div>
    `);
}

function addIANode() {
    const id = editor.getNextId();
    createNode("ia", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <textarea class="form-control" rows="3"
                oninput="updateNodeData(${id}, 'info', this.value)">
Base: S/380. WhatsApp: 991138132.
                </textarea>
            </div>
        </div>
    `);
}

function addMessageNode() {
    const id = editor.getNextId();
    createNode("message", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <textarea class="form-control" rows="3"
                placeholder="Tu respuesta..."
                oninput="updateNodeData(${id}, 'info', this.value)"></textarea>
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
                <input type="text" class="form-control mb-2"
                placeholder="Título"
                oninput="updateNodeData(${id}, 'info', this.value)">

                <div class="menu-list" id="list-${id}">
                    <input type="text" class="form-control mb-1"
                    placeholder="Opción 1"
                    oninput="updateNodeData(${id}, 'option1', this.value)">
                </div>

                <button class="btn btn-outline-primary btn-sm w-100 mt-2"
                onclick="addOption(${id})">+ Opción</button>
            </div>
        </div>
    `);
}

window.addOption = function(nodeId) {
    const list = document.getElementById(`list-${nodeId}`);
    const optionCount = list.querySelectorAll("input").length + 1;

    editor.addNodeOutput(nodeId);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control mb-1";
    input.placeholder = `Opción ${optionCount}`;
    input.oninput = (e) =>
        updateNodeData(nodeId, `option${optionCount}`, e.target.value);

    list.appendChild(input);
};

/* ================= SAVE FLOW (FIX IMPORTANTE) ================= */

function saveFlow() {

    const nodes = editor.drawflow.drawflow.Home.data;

    Object.keys(nodes).forEach(id => {
        const node = editor.getNodeFromId(id);
        editor.updateNodeDataFromId(id, node.data);
    });

    const flowData = editor.export();

    fetch("/api/save-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flowData)
    });

    alert("✅ Flujo guardado correctamente");
}

/* ================= MINIMAP ================= */

function updateMinimap() {
    const minimap = document.getElementById("minimap");
    minimap.innerHTML = "";

    const mapCanvas = document.createElement("div");
    mapCanvas.style.position = "relative";
    mapCanvas.style.width = "100%";
    mapCanvas.style.height = "100%";

    minimap.appendChild(mapCanvas);

    const scale = 0.1;

    container.querySelectorAll(".drawflow-node").forEach(node => {
        const clone = document.createElement("div");
        clone.style.position = "absolute";
        clone.style.width = node.offsetWidth * scale + "px";
        clone.style.height = node.offsetHeight * scale + "px";
        clone.style.left = node.offsetLeft * scale + "px";
        clone.style.top = node.offsetTop * scale + "px";
        clone.style.background = "#2563eb";
        clone.style.borderRadius = "4px";
        mapCanvas.appendChild(clone);
    });
}

editor.on("nodeCreated", updateMinimap);
editor.on("nodeRemoved", updateMinimap);
editor.on("nodeMoved", updateMinimap);

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".btn-trigger").onclick = addTriggerNode;
    document.querySelector(".btn-ia").onclick = addIANode;
    document.querySelector(".btn-message").onclick = addMessageNode;
    document.querySelector(".btn-menu").onclick = addMenuNode;
});