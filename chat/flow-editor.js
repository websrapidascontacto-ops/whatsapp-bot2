/* === INICIO Y CONFIGURACIÓN (WEBS RÁPIDAS - MONTSERRAT) === */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);
editor.reroute = true;
editor.zoom_max = 1.6;
editor.zoom_min = 0.5;

// Iniciamos el editor una sola vez para evitar conflictos
editor.start();

/* === ZOOM TOTAL AL PUNTERO (SIN CTRL) === */
container.addEventListener('wheel', function(e) {
    e.preventDefault(); 
    const delta = e.deltaY > 0 ? -1 : 1;
    const zoomSpeed = 0.05;
    const oldZoom = editor.zoom;
    let newZoom = oldZoom + (delta * zoomSpeed);

    if (newZoom > editor.zoom_max) newZoom = editor.zoom_max;
    if (newZoom < editor.zoom_min) newZoom = editor.zoom_min;

    if (oldZoom !== newZoom) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Cálculo para que el zoom siga la posición del mouse
        editor.pre_canvas_x += (x - editor.pre_canvas_x) * (1 - newZoom / oldZoom);
        editor.pre_canvas_y += (y - editor.pre_canvas_y) * (1 - newZoom / oldZoom);
        editor.zoom = newZoom;

        const map = container.querySelector('.drawflow-canvas');
        if(map) {
            map.style.transform = `translate(${editor.pre_canvas_x}px, ${editor.pre_canvas_y}px) scale(${newZoom})`;
        }
    }
}, { passive: false });

/* === LÓGICA DE POSICIONAMIENTO AUTOMÁTICO === */
let lastNodeX = 50;
let lastNodeY = 150;
const nodeWidth = 380; // Espacio que ocupa cada nodo + margen

function createNode(type, inputs, outputs, html, data = {}) {
    // 1. Creamos el nodo en la posición actual
    const nodeId = editor.addNode(type, inputs, outputs, lastNodeX, lastNodeY, type, data, html);
    
    // 2. Calculamos la posición del PRÓXIMO nodo
    lastNodeX += nodeWidth; 

    // 3. Límite de ancho: Si llega a 2000px, vuelve a la izquierda y baja 400px
    if (lastNodeX > 2000) { 
        lastNodeX = 50; 
        lastNodeY += 400; 
    }
    
    // Botón de cerrar y UX
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

/* === NODOS BÁSICOS === */
window.addTriggerNode = () => createNode("trigger", 0, 1, `<div class="node-wrapper"><div class="node-header header-trigger">⚡ Trigger</div><div class="node-body"><input type="text" class="form-control" df-val></div></div>`, { val: '' });
window.addMessageNode = () => createNode("message", 1, 1, `<div class="node-wrapper"><div class="node-header header-message">💬 Mensaje</div><div class="node-body"><textarea class="form-control" df-info></textarea></div></div>`, { info: '' });
window.addIANode = () => createNode("ia", 1, 1, `<div class="node-wrapper"><div class="node-header header-ia">🤖 IA</div><div class="node-body"><textarea class="form-control" df-info>Base: S/380. WhatsApp: 991138132</textarea></div></div>`, { info: '' });

/* === NODO LISTA Y FILAS DINÁMICAS === */
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
    
    createNode("whatsapp_list", 1, 1, html, { 
        list_title: '', 
        button_text: '', 
        row1: '', 
        desc1: '' 
    });
};

window.addRowDynamic = function(button) {
    const nodeElement = button.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const containerRows = nodeElement.querySelector('.items-container');
    const nodeData = editor.drawflow.drawflow.Home.data[nodeId].data;
    
    const count = containerRows.querySelectorAll(".row-group").length + 1;
    const keyRow = `row${count}`;
    const keyDesc = `desc${count}`;

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
    
    const inputDesc = document.createElement("input");
    inputDesc.className = "form-control";
    inputDesc.style.fontFamily = "Montserrat, sans-serif";
    inputDesc.style.fontSize = "11px";
    inputDesc.style.height = "28px";
    inputDesc.style.background = "#f0f0f0";
    inputDesc.style.color = "#333";
    inputDesc.placeholder = "Comentario opcional";
    inputDesc.setAttribute(`df-${keyDesc}`, "");

    inputRow.addEventListener('input', (e) => { nodeData[keyRow] = e.target.value; });
    inputDesc.addEventListener('input', (e) => { nodeData[keyDesc] = e.target.value; });

    group.appendChild(inputRow);
    group.appendChild(inputDesc);
    containerRows.appendChild(group);

    nodeData[keyRow] = "";
    nodeData[keyDesc] = "";
    
    editor.addNodeOutput(nodeId);
};

/* === GUARDAR Y CARGAR (CORREGIDO) === */
window.saveFlow = function() {
    const nodes = editor.drawflow.drawflow.Home.data;
    Object.keys(nodes).forEach(id => {
        const el = document.getElementById(`node-${id}`);
        if (el) {
            el.querySelectorAll('input, textarea').forEach(input => {
                const dfAttr = Array.from(input.attributes).find(a => a.name.startsWith('df-'));
                if (dfAttr) {
                    const key = dfAttr.name.replace('df-', '');
                    nodes[id].data[key] = input.value;
                }
            });
        }
    });

    const data = editor.export();
    console.log("Exportando datos:", data);

    fetch('/api/save-flow', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data) 
    })
    .then(response => {
        if (response.ok) {
            alert("✅ Flujo Guardado correctamente");
        } else {
            alert("❌ Error al guardar en el servidor");
        }
    })
    .catch(err => {
        console.error("Error en Fetch:", err);
    });
};

window.addEventListener('message', e => { 
    if (e.data.type === 'LOAD_FLOW') editor.import(e.data.data); 
});

/* === MEDIA NODE === */
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

/* === NOTIFY NODE === */
window.addNotifyNode = function() {
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
    createNode('notify', 1, 1, html, { info: '' });
};

/* === IMPORTAR ARCHIVO Y RECONSTRUIR FILAS === */
document.getElementById('import_file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const flowData = JSON.parse(e.target.result);
            editor.import(flowData);
            
            setTimeout(() => {
                const nodes = flowData.drawflow.Home.data;
                Object.keys(nodes).forEach(nodeId => {
                    const node = nodes[nodeId];
                    if (node.name === "whatsapp_list") {
                        const btn = document.querySelector(`#node-${nodeId} .btn-success`);
                        if (btn) {
                            let i = 2;
                            while (node.data[`row${i}`] !== undefined) {
                                window.addRowDynamic(btn);
                                const inputRow = document.querySelector(`#node-${nodeId} [df-row${i}]`);
                                if (inputRow) inputRow.value = node.data[`row${i}`];

                                const inputDesc = document.querySelector(`#node-${nodeId} [df-desc${i}]`);
                                if (inputDesc) inputDesc.value = node.data[`desc${i}`] || "";
                                i++;
                            }
                        }
                    }
                });
            }, 200);

        } catch (err) {
            console.error("Error al importar:", err);
        }
    };
    reader.readAsText(file);
});

/* === NODO BOTÓN DE ACTIVACIÓN === */
window.addButtonTriggerNode = () => {
    const html = `
        <div class="node-wrapper">
            <div class="node-header" style="background: #9b59b6; color: white; font-family: 'Montserrat';">🔘 Botón en Chat</div>
            <div class="node-body">
                <p style="font-size: 10px; color: #666; margin-bottom: 5px;">Texto que verá el usuario:</p>
                <input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Catálogo" style="font-family: 'Montserrat';">
                
                <p style="font-size: 10px; color: #666; margin-bottom: 5px;">Palabra que activa (Trigger):</p>
                <input type="text" class="form-control" df-trigger_val placeholder="Ej: catalogo" style="font-family: 'Montserrat';">
            </div>
        </div>`;
    
    createNode("button_trigger", 1, 1, html, { button_text: '', trigger_val: '' });
};

/* === VALIDACIÓN DE PAGO === */
window.addPaymentValidationNode = () => {
    const html = `
        <div class="node-wrapper">
            <div class="node-header" style="background: #2ecc71; color: white; font-family: 'Montserrat'; padding: 10px; border-radius: 8px 8px 0 0;">
                <i class="fa-solid fa-cash-register"></i> Validar Pago SMM
            </div>
            <div class="node-body" style="padding: 12px; background: #fff; font-family: 'Montserrat';">
                <label style="font-size: 10px; font-weight: bold; color: #555;">ID PRODUCTO WOO:</label>
                <input type="text" class="form-control mb-2" df-product_id placeholder="Ej: 125" style="font-size: 12px;">
                
                <label style="font-size: 10px; font-weight: bold; color: #555;">MONTO EXACTO (S/):</label>
                <input type="text" class="form-control" df-amount placeholder="Ej: 20.00" style="font-size: 12px;">
                
                <p style="font-size: 9px; color: #888; margin-top: 8px;">* El bot esperará el comprobante tras este nodo.</p>
            </div>
        </div>`;
    createNode('payment_validation', 1, 1, html, { product_id: '', amount: '' });
};