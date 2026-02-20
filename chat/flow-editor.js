const container = document.getElementById("drawflow");
const editor = new Drawflow(container);
editor.reroute = true;
editor.start();

let lastNodeX = 50;
let lastNodeY = 150;

function createNode(type, inputs, outputs, html, data = {}) {
    const nodeId = editor.addNode(type, inputs, outputs, lastNodeX, lastNodeY, type, data, html);
    lastNodeX += 380; if (lastNodeX > 1000) { lastNodeX = 50; lastNodeY += 400; }
    return nodeId;
}

window.addTriggerNode = () => createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><input type="text" class="form-control" df-val></div></div>`, { val: '' });

window.addMessageNode = () => createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><textarea class="form-control" df-info></textarea></div></div>`, { info: '' });

window.addListNode = function() {
    const nodeId = editor.node_id + 1;
    const html = `<div class="node-wrapper"><div class="node-header header-list">📝 Lista</div><div class="node-body"><input type="text" class="form-control mb-1" df-list_title placeholder="Título"><input type="text" class="form-control mb-1" df-button_text placeholder="Botón"><div id="list-items-${nodeId}"><input type="text" class="form-control mb-1" df-row1></div><button class="btn btn-sm btn-success w-100" onclick="addRow(${nodeId}, 'row')">+ Fila</button></div></div>`;
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '' });
};

window.addRow = (nodeId, prefix) => {
    const container = document.getElementById(prefix === 'row' ? `list-items-${nodeId}` : `menu-items-${nodeId}`);
    if(!container) return;
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.setAttribute(`df-${prefix}${count}`, "");
    container.appendChild(input);
    
    // Actualizar data interna
    const node = editor.getNodeFromId(nodeId);
    if(node) node.data[`${prefix}${count}`] = "";
};

window.saveFlow = function() {
    const data = editor.export();
    fetch('/api/save-flow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(() => alert("✅ Flujo Guardado"));
};

window.addEventListener('message', e => { if (e.data.type === 'LOAD_FLOW') editor.import(e.data.data); });