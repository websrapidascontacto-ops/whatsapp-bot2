const container = document.getElementById("drawflow");
const editor = new Drawflow(container);
editor.reroute = true;

/* === CONFIGURACIÓN DE ZOOM CON SCROLL === */
editor.zoom_max = 1.6;
editor.zoom_min = 0.5;
editor.zoom_value = 0.1;

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

/* LISTA CORREGIDA: MÉTODO DE BÚSQUEDA DINÁMICA */
window.addListNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list">📝 Lista</div>
            <div class="node-body">
                <input type="text" class="form-control mb-1" df-list_title placeholder="Título">
                <input type="text" class="form-control mb-1" df-button_text placeholder="Botón">
                <div class="items-container">
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Fila 1">
                </div>
                <button class="btn btn-sm btn-success w-100 mt-2" onclick="addRowDynamic(this)">+ Fila</button>
            </div>
        </div>`;
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '' });
};

/* FUNCIÓN UNIVERSAL PARA AÑADIR FILAS */
/* FUNCIÓN UNIVERSAL PARA AÑADIR FILAS - CORREGIDA */
window.addRowDynamic = function(button) {
    const nodeElement = button.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const container = nodeElement.querySelector('.items-container');
    
    const nodeData = editor.drawflow.drawflow.Home.data[nodeId].data;
    
    const count = container.querySelectorAll("input").length + 1;
    const key = `row${count}`;

    // 1. Añadir salida física
    editor.addNodeOutput(nodeId);

    // 2. Crear el input
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.style.fontFamily = "Montserrat, sans-serif";
    input.placeholder = `Fila ${count}`;

    // --- LA LÍNEA CLAVE QUE TE FALTABA ---
    // Esto le dice a Drawflow: "Este input pertenece a la llave rowX"
    input.setAttribute(`df-${key}`, ""); 
    // -------------------------------------

    input.addEventListener('input', (e) => {
        nodeData[key] = e.target.value;
    });

    container.appendChild(input);

    nodeData[key] = "";
    
    // 3. Importante: Actualizar el editor para que registre el nuevo input df-*
    editor.updateConnectionNodes(`node-${nodeId}`);
};
window.saveFlow = function() {
    const data = editor.export();
    fetch('/api/save-flow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(() => alert("✅ Flujo Guardado"));
};

window.addEventListener('message', e => { if (e.data.type === 'LOAD_FLOW') editor.import(e.data.data); });

/* MEDIA NODE */
window.addMediaNode = () => {
    const nodeId = editor.node_id + 1;
    createNode("media", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header" style="background: #e67e22; color: white;">🖼️ Imagen Adjunta</div>
            <div class="node-body">
                <input type="file" class="form-control mb-2" onchange="uploadNodeFile(event, ${nodeId})">
                <input type="hidden" df-media_url id="path-${nodeId}">
                <div id="status-${nodeId}" style="font-size:11px; color:gray;">Esperando archivo...</div>
                <input type="text" class="form-control" df-caption placeholder="Pie de foto">
            </div>
        </div>`, { media_url: '', caption: '' });
};

window.uploadNodeFile = async (event, nodeId) => {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.getElementById(`status-${nodeId}`);
    const pathInput = document.getElementById(`path-${nodeId}`);
    status.innerText = "⏳ Subiendo...";
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch('/api/upload-node-media', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
            pathInput.value = data.url;
            status.innerText = "✅ Subido";
            const node = editor.drawflow.drawflow.Home.data[nodeId];
            if(node) node.data.media_url = data.url;
        }
    } catch (e) { status.innerText = "❌ Error"; }
};
function addNotifyNode() {
    // Calculamos la posición para que aparezca junto al anterior
    const pos_x = editor.pre_canvas_x + 50;
    const pos_y = editor.pre_canvas_y + 50;

    const html = `
        <div>
            <div class="title-box" style="font-family: 'Montserrat', sans-serif; background: #ff9800; color: white; padding: 8px; border-radius: 5px 5px 0 0; font-size: 12px; font-weight: bold;">
                🔔 Alerta Admin
            </div>
            <div class="box" style="padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 0 0 5px 5px;">
                <p style="font-family: 'Montserrat', sans-serif; font-size: 10px; margin-bottom: 5px; color: #666;">Aviso que recibirás:</p>
                <input type="text" df-info placeholder="Ej: Cliente quiere hablar" style="width: 100%; font-family: 'Montserrat'; border: 1px solid #ccc; padding: 5px; border-radius: 3px; font-size: 12px;">
            </div>
        </div>
    `;

    // Añadimos el nodo con 1 entrada y 1 salida
    editor.addNode('notify', 1, 1, pos_x, pos_y, 'notify', { info: '' }, html);
}
document.getElementById('import_file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const flowData = JSON.parse(e.target.result);
            
            // 1. Cargar los datos al editor visual
            editor.import(flowData);
            
            // 2. RECONSTRUCCIÓN DE FILAS DINÁMICAS
            // Recorremos todos los nodos cargados
            const nodes = flowData.drawflow.Home.data;
            Object.keys(nodes).forEach(nodeId => {
                const node = nodes[nodeId];
                if (node.name === "whatsapp_list") {
                    // Buscamos el botón de "+ Fila" de ese nodo específico
                    const btn = document.querySelector(`#node-${nodeId} .btn-success`);
                    if (btn) {
                        // Buscamos cuántas filas (row2, row3...) hay en los datos
                        // Empezamos desde i=2 porque la row1 ya viene en el HTML
                        let i = 2;
                        while (node.data[`row${i}`] !== undefined) {
                            // Ejecutamos la función de añadir fila
                            window.addRowDynamic(btn);
                            // Rellenamos el valor que acabamos de crear
                            const input = document.querySelector(`#node-${nodeId} [df-row${i}]`);
                            if (input) input.value = node.data[`row${i}`];
                            i++;
                        }
                    }
                }
            });

            alert("✅ Flujo cargado y filas reconstruidas.");
        } catch (err) {
            alert("❌ Error: El archivo no es un JSON de flujo válido.");
            console.error(err);
        }
    };
    reader.readAsText(file);
});