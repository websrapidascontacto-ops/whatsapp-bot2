/* === INICIO Y CONFIGURACIÓN (WEBS RÁPIDAS - MONTSERRAT) === */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);
editor.reroute = true;
editor.zoom_max = 1.6;
editor.zoom_min = 0.5;

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
const nodeWidth = 380;

function createNode(type, inputs, outputs, html, data = {}) {
    const nodeId = editor.addNode(type, inputs, outputs, lastNodeX, lastNodeY, type, data, html);
    lastNodeX += nodeWidth; 
    if (lastNodeX > 2000) { 
        lastNodeX = 50; 
        lastNodeY += 400; 
    }
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
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '', desc1: '' });
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
    // Asignar valor si ya existe (para carga)
    if(nodeData[keyRow]) inputRow.value = nodeData[keyRow];
    inputRow.addEventListener('input', (e) => { nodeData[keyRow] = e.target.value; });
    
    const inputDesc = document.createElement("input");
    inputDesc.className = "form-control";
    inputDesc.style.fontFamily = "Montserrat, sans-serif";
    inputDesc.style.fontSize = "11px";
    inputDesc.style.height = "28px";
    inputDesc.style.background = "#f0f0f0";
    inputDesc.style.color = "#333";
    inputDesc.placeholder = "Comentario opcional";
    // Asignar valor si ya existe (para carga)
    if(nodeData[keyDesc]) inputDesc.value = nodeData[keyDesc];
    inputDesc.addEventListener('input', (e) => { nodeData[keyDesc] = e.target.value; });

    group.appendChild(inputRow);
    group.appendChild(inputDesc);
    containerRows.appendChild(group);

    if (nodeData[keyRow] === undefined) nodeData[keyRow] = "";
    if (nodeData[keyDesc] === undefined) nodeData[keyDesc] = "";
    
    editor.addNodeOutput(nodeId);
};

/* === FUNCIÓN MAESTRA DE RECONSTRUCCIÓN (CORREGIDA) === */
function rebuildFlowData(flowData) {
    editor.clear();
    editor.import(flowData);

    // Esperamos a que el HTML se cree en el navegador
    setTimeout(() => {
        const nodes = flowData.drawflow.Home.data;
        Object.keys(nodes).forEach(nodeId => {
            const node = nodes[nodeId];
            
            if (node.name === "whatsapp_list") {
                const nodeElement = document.getElementById(`node-${nodeId}`);
                if (!nodeElement) return;

                const btnAdd = nodeElement.querySelector('.btn-success');
                const containerRows = nodeElement.querySelector('.items-container');
                
                // 1. Sincronizar Fila 1 (La que ya existe por defecto)
                const firstRow = containerRows.querySelectorAll('.row-group:first-child input');
                if (firstRow[0]) firstRow[0].value = node.data.row1 || "";
                if (firstRow[1]) firstRow[1].value = node.data.desc1 || "";

                // 2. Crear y llenar el resto de filas (row2, row3...)
                let i = 2;
                while (node.data[`row${i}`] !== undefined) {
                    // Creamos la fila visualmente
                    window.addRowDynamic(btnAdd); 
                    
                    // Buscamos los inputs que se acaban de crear
                    const allGroups = containerRows.querySelectorAll('.row-group');
                    const currentGroup = allGroups[i - 1]; // i-1 porque el array empieza en 0
                    
                    if (currentGroup) {
                        const inputs = currentGroup.querySelectorAll('input');
                        // Inyectamos el texto del JSON directamente al HTML
                        if (inputs[0]) inputs[0].value = node.data[`row${i}`] || "";
                        if (inputs[1]) inputs[1].value = node.data[`desc${i}`] || "";
                    }
                    i++;
                }
            }
        });
        
        // Refrescar las conexiones para que no se vean cortadas
        editor.updateConnectionNodes('node-' + Object.keys(nodes)[0]);
        console.log("✅ Reconstrucción de listas completada");
    }, 500); 
}

/* === GUARDAR Y CARGAR === */
window.saveFlow = async function() {
    const exportData = editor.export();
    const flowName = document.getElementById('flow_name')?.value || "Main Flow";

    const payload = {
        id: window.currentEditingFlowId || null,
        name: flowName,
        data: exportData
    };

    try {
        const response = await fetch('/api/save-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            window.currentEditingFlowId = result.id;
            alert("✅ Guardado en base de datos. ¡Triggers actualizados!");
        } else {
            alert("❌ Error al guardar: " + result.error);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("❌ Error de conexión con Railway.");
    }
};

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
            if(editor.drawflow.drawflow.Home.data[nodeId]) {
                editor.drawflow.drawflow.Home.data[nodeId].data.media_url = data.url;
            }
        }
    } catch (e) { status.innerText = "❌ Error"; }
};

/* === NOTIFY NODE === */
window.addNotifyNode = function() {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #ff9800; color: white; padding: 8px; border-radius: 5px 5px 0 0; font-size: 12px; font-weight: bold;">🔔 Alerta Admin</div><div class="node-body" style="padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 0 0 5px 5px;"><p style="font-family: 'Montserrat', sans-serif; font-size: 10px; margin-bottom: 5px; color: #666;">Aviso que recibirás:</p><input type="text" df-info placeholder="Ej: Cliente quiere hablar" style="width: 100%; font-family: 'Montserrat'; border: 1px solid #ccc; padding: 5px; border-radius: 3px; font-size: 12px;"></div></div>`;
    createNode('notify', 1, 1, html, { info: '' });
};

/* === IMPORTAR ARCHIVO LOCAL === */
document.getElementById('import_file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const flowData = JSON.parse(e.target.result);
            rebuildFlowData(flowData);
            alert("✅ Flujo e ítems importados con éxito.");
        } catch (err) { 
            console.error("Error al importar:", err);
            alert("❌ Error al importar JSON."); 
        }
    };
    reader.readAsText(file);
});

/* === BOTONES Y VALIDACIÓN (SIN CAMBIOS EN TU LÓGICA) === */
window.addButtonTriggerNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #9b59b6; color: white; font-family: 'Montserrat';">🔘 Botón en Chat</div><div class="node-body"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Texto que verá el usuario:</p><input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Catálogo" style="font-family: 'Montserrat';"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Palabra que activa (Trigger):</p><input type="text" class="form-control" df-trigger_val placeholder="Ej: catalogo" style="font-family: 'Montserrat';"></div></div>`;
    createNode("button_trigger", 1, 1, html, { button_text: '', trigger_val: '' });
};

window.addPaymentValidationNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #2ecc71; color: white; font-family: 'Montserrat'; padding: 10px; border-radius: 8px 8px 0 0;"><i class="fa-solid fa-cash-register"></i> Validar Pago SMM</div><div class="node-body" style="padding: 12px; background: #fff; font-family: 'Montserrat';"><label style="font-size: 10px; font-weight: bold; color: #555;">ID PRODUCTO WOO:</label><input type="text" class="form-control mb-2" df-product_id placeholder="Ej: 125" style="font-size: 12px;"><label style="font-size: 10px; font-weight: bold; color: #555;">MONTO EXACTO (S/):</label><input type="text" class="form-control" df-amount placeholder="Ej: 20.00" style="font-size: 12px;"><p style="font-size: 9px; color: #888; margin-top: 8px;">* El bot esperará el comprobante tras este nodo.</p></div></div>`;
    createNode('payment_validation', 1, 1, html, { product_id: '', amount: '' });
};

/* === GESTIÓN DE MIS FLUJOS (MODAL) === */
window.openFlowsModal = async function() {
    const modal = document.getElementById('flowsModal');
    const list = document.getElementById('flowsList');
    if(modal) modal.style.display = 'flex';
    list.innerHTML = "<p style='color:white;'>Cargando flujos...</p>";
    
    try {
        const res = await fetch('/api/get-flows');
        const flows = await res.json();
        list.innerHTML = ""; 
        flows.forEach(f => {
            const div = document.createElement('div');
            div.style = "background:#1a1b26; padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333;";
            div.innerHTML = `
                <span style="color:white; font-family:'Montserrat';">${f.name}</span>
                <div style="display:flex; gap:5px;">
                    <button onclick="loadSpecificFlow('${f.id}')" style="background:#2563eb; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Cargar</button>
                    <button onclick="deleteFlow('${f.id}')" style="background:#ff4b2b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🗑️</button>
                </div>`;
            list.appendChild(div);
        });
    } catch (e) { list.innerHTML = "Error al conectar"; }
};

window.closeFlowsModal = () => { document.getElementById('flowsModal').style.display = 'none'; };

window.loadSpecificFlow = async function(id) {
    try {
        const res = await fetch(`/api/get-flow-by-id/${id}`);
        const responseData = await res.json();
        const dataToImport = responseData.drawflow ? responseData : (responseData.data || responseData);
        rebuildFlowData(dataToImport);
        closeFlowsModal();
        alert("✅ Cargado correctamente");
    } catch (e) { alert("❌ Error al cargar"); }
};

window.deleteFlow = async function(id) {
    if(!confirm("¿Eliminar flujo?")) return;
    try {
        const res = await fetch(`/api/delete-flow/${id}`, { method: 'DELETE' });
        if(res.ok) { alert("🗑️ Eliminado"); openFlowsModal(); }
    } catch (e) { alert("❌ Error"); }
};

/* === ESCUCHA DE MENSAJES === */
window.addEventListener('message', e => { 
    if (e.data.type === 'LOAD_FLOW' || e.data.type === 'IMPORT_CLEAN') {
        rebuildFlowData(e.data.data);
    }
});

/* === FUNCIÓN MAESTRA DE RECONSTRUCCIÓN (CORREGIDA PARA FILAS) === */
function rebuildFlowData(flowData) {
    editor.clear();
    editor.import(flowData);

    // Timeout de 500ms para asegurar que el DOM de Drawflow existe
    setTimeout(() => {
        const nodes = flowData.drawflow.Home.data;
        Object.keys(nodes).forEach(nodeId => {
            const node = nodes[nodeId];
            
            if (node.name === "whatsapp_list") {
                const nodeElement = document.getElementById(`node-${nodeId}`);
                if (!nodeElement) return;

                const containerRows = nodeElement.querySelector('.items-container');
                if (!containerRows) return;

                // Limpiar filas por defecto para evitar duplicados
                containerRows.innerHTML = '';

                // Recorrer el objeto data del JSON para reconstruir cada fila
                let i = 1;
                while (node.data[`row${i}`] !== undefined) {
                    const rowVal = node.data[`row${i}`];
                    const descVal = node.data[`desc${i}`] || "";

                    const group = document.createElement("div");
                    group.className = "row-group mb-2";
                    group.style = "border-bottom: 1px solid #444; padding-bottom: 8px; margin-top: 10px;";

                    group.innerHTML = `
                        <input type="text" class="form-control mb-1" value="${rowVal}" placeholder="Fila ${i}" style="font-family: 'Montserrat';">
                        <input type="text" class="form-control" value="${descVal}" placeholder="Comentario" style="font-family: 'Montserrat'; font-size: 11px; height: 28px; background: #f0f0f0; color: #333;">
                    `;

                    // Asignar eventos para que si editas el texto se guarde en el nodo
                    const inputs = group.querySelectorAll('input');
                    const currentIdx = i;
                    inputs[0].addEventListener('input', (e) => { 
                        editor.drawflow.drawflow.Home.data[nodeId].data[`row${currentIdx}`] = e.target.value; 
                    });
                    inputs[1].addEventListener('input', (e) => { 
                        editor.drawflow.drawflow.Home.data[nodeId].data[`desc${currentIdx}`] = e.target.value; 
                    });

                    containerRows.appendChild(group);
                    i++;
                }
            }
        });
        editor.updateConnectionNodes('node-list');
    }, 500);
}