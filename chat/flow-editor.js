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
        editor.updateZoom();
    }
}, { passive: false });

/* === LÓGICA DE POSICIONAMIENTO AUTOMÁTICO === */
let lastNodeX = 50;
let lastNodeY = 150;
const nodeWidth = 380; // Espacio que ocupa cada nodo + margen

function createNode(type, inputs, outputs, html, data = {}) {
    // 1. Creamos el nodo en la posición actual
    const nodeId = editor.addNode(type, inputs, outputs, lastNodeX, lastNodeY, type, data, html);
    
    // 2. Calculamos la posición del PRÓXIMO nodo (Siempre al lado del anterior)
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
    inputRow.addEventListener('input', (e) => { nodeData[keyRow] = e.target.value; });

    const inputDesc = document.createElement("input");
    inputDesc.className = "form-control";
    inputDesc.style.fontFamily = "Montserrat, sans-serif";
    inputDesc.style.fontSize = "11px";
    inputDesc.style.height = "28px";
    inputDesc.style.background = "#f0f0f0";
    inputDesc.style.color = "#333";
    inputDesc.placeholder = "Comentario opcional";
    inputDesc.addEventListener('input', (e) => { nodeData[keyDesc] = e.target.value; });

    group.appendChild(inputRow);
    group.appendChild(inputDesc);
    containerRows.appendChild(group);

    // Inicializamos las llaves para que existan al exportar
    nodeData[keyRow] = "";
    nodeData[keyDesc] = "";
    
    editor.updateConnectionNodes(`node-${nodeId}`);
};

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
}

/* === IMPORTAR ARCHIVO LOCAL (CORREGIDO SIN FETCH) === */
document.getElementById('import_file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // Convertimos el archivo a objeto JS
            const flowData = JSON.parse(e.target.result);
            
            // IMPORTANTE: Usamos la función local, no un fetch al servidor
            rebuildFlowData(flowData);
            
            alert("✅ Flujo e ítems importados con éxito localmente.");
        } catch (err) { 
            console.error("Error al procesar JSON:", err);
            alert("❌ Error: El archivo no es un JSON válido."); 
        }
    };
    reader.readAsText(file);
});

/* === FUNCIÓN MAESTRA DE RECONSTRUCCIÓN (DIBUJA LAS FILAS) === */
function rebuildFlowData(flowData) {
    // 1. Limpiar y cargar estructura base
    editor.clear();
    editor.import(flowData);

    // 2. Esperar a que Drawflow cree los elementos en el HTML
    setTimeout(() => {
        const nodes = flowData.drawflow.Home.data;
        Object.keys(nodes).forEach(nodeId => {
            const node = nodes[nodeId];
            
            if (node.name === "whatsapp_list") {
                const nodeElement = document.getElementById(`node-${nodeId}`);
                if (!nodeElement) return;

                const btnAdd = nodeElement.querySelector('.btn-success');
                const containerRows = nodeElement.querySelector('.items-container');
                
                // Llenar Fila 1 (ya existe)
                const firstRowInputs = containerRows.querySelectorAll('.row-group:first-child input');
                if (firstRowInputs[0]) firstRowInputs[0].value = node.data.row1 || "";
                if (firstRowInputs[1]) firstRowInputs[1].value = node.data.desc1 || "";

                // Reconstruir Filas 2 en adelante
                let i = 2;
                while (node.data[`row${i}`] !== undefined) {
                    if (window.addRowDynamic) {
                        window.addRowDynamic(btnAdd); // Simula el click para crear el HTML
                        
                        const allRows = containerRows.querySelectorAll('.row-group');
                        const currentGroup = allRows[i - 1]; 
                        
                        if (currentGroup) {
                            const inputs = currentGroup.querySelectorAll('input');
                            if (inputs[0]) inputs[0].value = node.data[`row${i}`];
                            if (inputs[1]) inputs[1].value = node.data[`desc${i}`] || "";
                        }
                    }
                    i++;
                }
            }
        });
        editor.updateZoom(); // Refrescar visualmente
    }, 450); 
}

/* === BOTÓN TRIGGER Y PAGO === */
window.addButtonTriggerNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #9b59b6; color: white; font-family: 'Montserrat';">🔘 Botón en Chat</div><div class="node-body"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Texto que verá el usuario:</p><input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Catálogo" style="font-family: 'Montserrat';"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Palabra que activa (Trigger):</p><input type="text" class="form-control" df-trigger_val placeholder="Ej: catalogo" style="font-family: 'Montserrat';"></div></div>`;
    createNode("button_trigger", 1, 1, html, { button_text: '', trigger_val: '' });
};

window.addPaymentValidationNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #2ecc71; color: white; font-family: 'Montserrat'; padding: 10px; border-radius: 8px 8px 0 0;"><i class="fa-solid fa-cash-register"></i> Validar Pago SMM</div><div class="node-body" style="padding: 12px; background: #fff; font-family: 'Montserrat';"><label style="font-size: 10px; font-weight: bold; color: #555;">ID PRODUCTO WOO:</label><input type="text" class="form-control mb-2" df-product_id placeholder="Ej: 125" style="font-size: 12px;"><label style="font-size: 10px; font-weight: bold; color: #555;">MONTO EXACTO (S/):</label><input type="text" class="form-control" df-amount placeholder="Ej: 20.00" style="font-size: 12px;"><p style="font-size: 9px; color: #888; margin-top: 8px;">* El bot esperará el comprobante tras este nodo.</p></div></div>`;
    createNode('payment_validation', 1, 1, html, { product_id: '', amount: '' });
};

/* === GESTIÓN DE MIS FLUJOS (MODAL ÚNICO) === */
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
        let finalData = responseData.drawflow ? responseData : (responseData.data || responseData);
        rebuildFlowData(finalData);
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

/* === ESCUCHA DE MENSAJES DESDE EL CRM === */
window.addEventListener('message', e => { 
    if (e.data.type === 'LOAD_FLOW' || e.data.type === 'IMPORT_CLEAN') {
        rebuildFlowData(e.data.data);
    }
});