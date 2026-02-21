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
/* LISTA CORREGIDA CON COMENTARIOS */
window.addListNode = function() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list" style="font-family: 'Montserrat', sans-serif;">📝 Lista</div>
            <div class="node-body">
                <input type="text" class="form-control mb-1" df-list_title placeholder="Título de la lista" style="font-family: 'Montserrat';">
                <input type="text" class="form-control mb-1" df-button_text placeholder="Texto del Botón" style="font-family: 'Montserrat';">
                
                <div class="items-container">
                    <div class="row-group mb-2" style="border-bottom: 1px solid #444; padding-bottom: 8px; margin-top: 10px;">
                        <input type="text" class="form-control mb-1" df-row1 placeholder="Fila 1 (Título)" style="font-family: 'Montserrat';">
                        <input type="text" class="form-control" df-desc1 placeholder="Comentario (Opcional)" style="font-family: 'Montserrat'; font-size: 11px; height: 28px; background: #f0f0f0; color: #333;">
                    </div>
                </div>
                
                <button class="btn btn-sm btn-success w-100 mt-2" onclick="addRowDynamic(this)" style="font-family: 'Montserrat';">+ Añadir Fila</button>
            </div>
        </div>`;
    
    // Inicializamos row1 y desc1 vacíos en la data
    createNode("whatsapp_list", 1, 1, html, { 
        list_title: '', 
        button_text: '', 
        row1: '', 
        desc1: '' 
    });
};

/* FUNCIÓN UNIVERSAL PARA AÑADIR FILAS - CORREGIDA */
window.addRowDynamic = function(button) {
    const nodeElement = button.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const container = nodeElement.querySelector('.items-container');
    const nodeData = editor.drawflow.drawflow.Home.data[nodeId].data;
    
    const count = container.querySelectorAll(".row-group").length + 1;
    const keyRow = `row${count}`;
    const keyDesc = `desc${count}`;

    const currentOutputs = Object.keys(editor.drawflow.drawflow.Home.data[nodeId].outputs).length;
    if (count > currentOutputs) {
        editor.addNodeOutput(nodeId);
    }

    const group = document.createElement("div");
    group.className = "row-group mb-2";
    group.style.borderBottom = "1px solid #444";
    group.style.paddingBottom = "8px";
    group.style.marginTop = "10px";

    const inputRow = document.createElement("input");
    inputRow.className = "form-control mb-1";
    inputRow.style.fontFamily = "Montserrat, sans-serif";
    inputRow.placeholder = `Fila ${count} (Título)`;
    inputRow.setAttribute(`df-${keyRow}`, "");
    inputRow.addEventListener('input', (e) => { nodeData[keyRow] = e.target.value; });

    const inputDesc = document.createElement("input");
    inputDesc.className = "form-control";
    inputDesc.style.fontFamily = "Montserrat, sans-serif";
    inputDesc.style.fontSize = "11px";
    inputDesc.style.height = "28px";
    inputDesc.style.background = "#f0f0f0";
    inputDesc.style.color = "#333";
    inputDesc.placeholder = "Comentario opcional";
    inputDesc.setAttribute(`df-${keyDesc}`, "");
    inputDesc.addEventListener('input', (e) => { nodeData[keyDesc] = e.target.value; });

    group.appendChild(inputRow);
    group.appendChild(inputDesc);
    container.appendChild(group);

    nodeData[keyRow] = "";
    nodeData[keyDesc] = "";
    
    editor.updateConnectionNodes(`node-${nodeId}`);
}; // Aquí termina correctamente addRowDynamic

// === FUNCIÓN DE GUARDAR (FUERA DE OTRAS FUNCIONES) ===
window.saveFlow = function() {
    const data = editor.export();
    console.log("Exportando datos:", data);

    fetch('/api/save-flow', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data) 
    })
    .then(response => {
        if (response.ok) {
            alert("✅ Flujo Guardado correctamente (Títulos y Comentarios)");
        } else {
            alert("❌ Error al guardar en el servidor");
        }
    })
    .catch(err => {
        console.error("Error en Fetch:", err);
        alert("❌ Error de conexión con el servidor");
    });
};

window.addEventListener('message', e => { 
    if (e.data.type === 'LOAD_FLOW') editor.import(e.data.data); 
});

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
            
            // 2. RECONSTRUCCIÓN DE FILAS Y COMENTARIOS
            setTimeout(() => {
                const nodes = flowData.drawflow.Home.data;
                Object.keys(nodes).forEach(nodeId => {
                    const node = nodes[nodeId];
                    
                    if (node.name === "whatsapp_list") {
                        const btn = document.querySelector(`#node-${nodeId} .btn-success`);
                        
                        if (btn) {
                            let i = 2;
                            while (node.data[`row${i}`] !== undefined) {
                                // Creamos visualmente el grupo (Título + Comentario)
                                window.addRowDynamic(btn);
                                
                                // Rellenamos el Título
                                const inputRow = document.querySelector(`#node-${nodeId} [df-row${i}]`);
                                if (inputRow) {
                                    inputRow.value = node.data[`row${i}`];
                                }

                                // Rellenamos el Comentario (desc)
                                const inputDesc = document.querySelector(`#node-${nodeId} [df-desc${i}]`);
                                if (inputDesc) {
                                    inputDesc.value = node.data[`desc${i}`] || "";
                                }
                                i++;
                            }

                            // No olvidar rellenar el comentario de la Fila 1 (que ya existe por defecto)
                            const desc1 = document.querySelector(`#node-${nodeId} [df-desc1]`);
                            if (desc1 && node.data.desc1) {
                                desc1.value = node.data.desc1;
                            }
                        }
                    }
                });
                alert("✅ Flujo cargado con comentarios correctamente.");
            }, 150);

        } catch (err) {
            alert("❌ Error: El archivo no es un JSON de flujo válido.");
            console.error("Error al importar:", err);
        }
    };
    reader.readAsText(file);
});