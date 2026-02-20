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

/* ================= GUARDAR (CORREGIDO) ================= */
function saveFlow() {
    // 1. Extraemos manualmente los valores de los inputs antes de exportar
    const nodes = editor.drawflow.drawflow.Home.data;
    for (const id in nodes) {
        const nodeElement = document.getElementById('node-' + id);
        if (nodeElement) {
            const input = nodeElement.querySelector('input, textarea');
            if (input) {
                // Si es Trigger guardamos en 'val', si es mensaje en 'info'
                const key = nodes[id].name === 'trigger' ? 'val' : 'info';
                editor.updateNodeDataFromId(id, { [key]: input.value });
            }
        }
    }

    // 2. Exportamos la data ya con textos
    const flowData = editor.export();
    
    // 3. Enviamos al CRM
    window.parent.postMessage({ 
        type: 'SAVE_FLOW', 
        data: flowData 
    }, '*');
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
            <div class="node-body"><input type="text" class="form-control" placeholder="Ej: hola"></div>
        </div>
    `);
}

function addIANode() {
    createNode("ia", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <textarea class="form-control" rows="3">Base: S/380. WhatsApp: 991138132.</textarea>
            </div>
        </div>
    `);
}

function addMessageNode() {
    createNode("message", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body"><textarea class="form-control" rows="3" placeholder="Tu respuesta..."></textarea></div>
        </div>
    `);
}

/* ================= MINIMAPA Y EVENTOS ================= */
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
    viewport.style.left = (-editor.precanvas_x * scale) + "px";
    viewport.style.top = (-editor.precanvas_y * scale) + "px";
    viewport.style.width = (container.clientWidth * scale) + "px";
    viewport.style.height = (container.clientHeight * scale) + "px";
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
    setTimeout(updateMinimap, 500);
});

window.addEventListener('message', function(event) {
    if (event.data.type === 'LOAD_FLOW') {
        editor.import(event.data.data);
        updateMinimap();
    }
});