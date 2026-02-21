const container = document.getElementById("drawflow");
const editor = new Drawflow(container);
editor.reroute = true;

/* === CONFIGURACIÓN DE ZOOM CON SCROLL === */
editor.zoom_max = 1.6;
editor.zoom_min = 0.5;
editor.zoom_value = 0.1;
/* ======================================== */

editor.start();

let lastNodeX = 50;
let lastNodeY = 150;

function createNode(type, inputs, outputs, html, data = {}) {
    const nodeId = editor.addNode(type, inputs, outputs, lastNodeX, lastNodeY, type, data, html);
    lastNodeX += 380; if (lastNodeX > 1000) { lastNodeX = 50; lastNodeY += 400; }
    
    setTimeout(() => {
        const nodeElem = document.getElementById(`node-${nodeId}`);
        if (nodeElem) {
            const closeBtn = document.createElement("div");
            closeBtn.innerHTML = "×";
            closeBtn.className = "node-close-btn";
            closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
            nodeElem.appendChild(closeBtn);
        }
    }, 100);
    return nodeId;
}

window.addTriggerNode = () => createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><input type="text" class="form-control" df-val></div></div>`, { val: '' });
window.addMessageNode = () => createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><textarea class="form-control" df-info></textarea></div></div>`, { info: '' });
window.addIANode = () => createNode("ia", 1, 1, `<div class="node-wrapper"><div class="node-header header-ia">🤖 IA</div><div class="node-body"><textarea class="form-control" df-info>Base: S/380. WhatsApp: 991138132</textarea></div></div>`, { info: '' });

window.addListNode = function() {
    const nodeId = editor.node_id + 1;
    const html = `<div class="node-wrapper"><div class="node-header header-list">📝 Lista</div><div class="node-body"><input type="text" class="form-control mb-1" df-list_title placeholder="Título"><input type="text" class="form-control mb-1" df-button_text placeholder="Botón"><div id=\"list-items-${nodeId}\"><input type=\"text\" class=\"form-control mb-1\" df-row1></div><button class=\"btn btn-sm btn-success w-100\" onclick=\"addRow(${nodeId}, 'row')\">+ Fila</button></div></div>`;
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
    const node = editor.getNodeFromId(nodeId);
    if(node) node.data[`${prefix}${count}`] = "";
};

window.saveFlow = function() {
    const data = editor.export();
    fetch('/api/save-flow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(() => alert("✅ Flujo Guardado"));
};

window.addEventListener('message', e => { if (e.data.type === 'LOAD_FLOW') editor.import(e.data.data); });

/* NUEVO MÓDULO MEDIA ADJUNTA - PUNTO NEMO 2 */
window.addMediaNode = () => {
    const nodeId = editor.node_id + 1;
    createNode("media", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header" style="background: #e67e22; color: white; font-family: 'Montserrat', sans-serif;">🖼️ Imagen Adjunta</div>
            <div class="node-body">
                <label class="small" style="font-family: 'Montserrat', sans-serif;">Adjuntar archivo (Imagen):</label>
                <input type="file" class="form-control mb-2" onchange="uploadNodeFile(event, ${nodeId})">
                
                <input type="hidden" df-media_url id="path-${nodeId}">
                
                <div id="status-${nodeId}" style="font-size:11px; color:gray; margin-bottom:5px; font-family: 'Montserrat';">Esperando archivo...</div>

                <label class="small" style="font-family: 'Montserrat', sans-serif;">Pie de foto:</label>
                <input type="text" class="form-control" df-caption placeholder="Ej: Mira esta oferta">
            </div>
        </div>`, { media_url: '', caption: '' });
};

window.uploadNodeFile = async (event, nodeId) => {
    const file = event.target.files[0];
    if (!file) return;

    const status = document.getElementById(`status-${nodeId}`);
    const pathInput = document.getElementById(`path-${nodeId}`);
    
    status.innerText = "⏳ Subiendo archivo...";
    status.style.color = "#e67e22";

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch('/api/upload-node-media', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.url) {
            pathInput.value = data.url;
            status.innerText = "✅ Subido: " + file.name;
            status.style.color = "green";
            
            // Actualización directa de datos
            editor.drawflow.drawflow.Home.data[nodeId].data.media_url = data.url;
            console.log("💾 Nodo " + nodeId + " actualizado.");
        } else {
            throw new Error("No se recibió URL");
        }
    } catch (e) {
        console.error("Error upload:", e);
        status.innerText = "❌ Error al subir";
        status.style.color = "red";
    }
};