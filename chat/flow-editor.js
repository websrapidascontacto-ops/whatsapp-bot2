let isImportingFlow = false;
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

window.addRowDynamic = function(button, initialData = null) {
    const nodeElement = button.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const containerRows = nodeElement.querySelector('.items-container');
    const nodeData = editor.getNodeFromId(nodeId).data;
    
    const count = containerRows.querySelectorAll(".row-group").length + 1;
    const keyRow = `row${count}`;
    const keyDesc = `desc${count}`;

    const group = document.createElement("div");
    group.className = "row-group mb-2";
    group.style.cssText = "border-bottom: 1px solid #444; padding-bottom: 8px; margin-top: 10px;";

    group.innerHTML = `
        <input type="text" class="form-control mb-1" style="font-family: Montserrat;" placeholder="Fila ${count}" df-${keyRow}>
        <input type="text" class="form-control" style="font-family: Montserrat; font-size: 11px; height: 28px; background: #f0f0f0; color: #333;" placeholder="Comentario" df-${keyDesc}>
    `;

    containerRows.appendChild(group);

    // SI HAY DATOS INICIALES (Carga de flujo)
    if(initialData) {
        const inputRow = group.querySelector(`[df-${keyRow}]`);
        const inputDesc = group.querySelector(`[df-${keyDesc}]`);
        inputRow.value = initialData.row;
        inputDesc.value = initialData.desc;
        
        // Sincronizamos con el motor de Drawflow
        nodeData[keyRow] = initialData.row;
        nodeData[keyDesc] = initialData.desc;
    } else {
        // SI ES UNA FILA NUEVA (Click del usuario)
        editor.addNodeOutput(nodeId);
    }
};
let currentEditingFlowId = null; // Variable global para saber qué estamos editando

/* === MEDIA NODE (CORREGIDO) === */
window.addMediaNode = () => {
    // Primero creamos el nodo (Drawflow nos da el ID real)
    const nodeId = createNode("media", 1, 1, `
        <div class="node-wrapper">
            <div class="node-header" style="background: #e67e22; color: white;">🖼️ Imagen Adjunta</div>
            <div class="node-body">
                <input type="file" class="form-control mb-2" onchange="uploadNodeFile(event, this)">
                <input type="hidden" df-media_url id="path-temp">
                <div class="status-msg" style="font-size:11px; color:gray;">Esperando archivo...</div>
                <input type="text" class="form-control" df-caption placeholder="Pie de foto">
            </div>
        </div>`, { media_url: '', caption: '' });
};

// Actualiza uploadNodeFile para recibir 'this' (el input)
window.uploadNodeFile = async (event, inputElement) => {
    const file = event.target.files[0];
    if (!file) return;

    // Obtenemos el ID real del nodo padre
    const nodeElement = inputElement.closest('.drawflow-node');
    const nodeId = nodeElement.id.replace('node-', '');
    const status = nodeElement.querySelector('.status-msg');
    
    status.innerText = "⏳ Subiendo...";
    status.style.color = "#e67e22";

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch('/api/upload-node-media', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.url) {
            // Guardamos directamente en la data del motor
            editor.updateNodeDataFromId(nodeId, { 
                ...editor.getNodeFromId(nodeId).data, 
                media_url: data.url 
            });

            status.innerText = "✅ Imagen vinculada";
            status.style.color = "#2ecc71";
        }
    } catch (e) { 
        status.innerText = "❌ Error";
        status.style.color = "#ff4b2b";
    }
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
                                const rowInp = document.querySelector(`#node-${nodeId} [df-row${i}]`);
                                if (rowInp) rowInp.value = node.data[`row${i}`];
                                const descInp = document.querySelector(`#node-${nodeId} [df-desc${i}]`);
                                if (descInp) descInp.value = node.data[`desc${i}`] || "";
                                i++;
                            }
                        }
                    }
                });
            }, 200);
        } catch (err) { console.error("Error al importar:", err); }
    };
    reader.readAsText(file);
});

/* === BOTÓN TRIGGER Y PAGO === */
window.addButtonTriggerNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #9b59b6; color: white; font-family: 'Montserrat';">🔘 Botón en Chat</div><div class="node-body"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Texto que verá el usuario:</p><input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver Catálogo" style="font-family: 'Montserrat';"><p style="font-size: 10px; color: #666; margin-bottom: 5px;">Palabra que activa (Trigger):</p><input type="text" class="form-control" df-trigger_val placeholder="Ej: catalogo" style="font-family: 'Montserrat';"></div></div>`;
    createNode("button_trigger", 1, 1, html, { button_text: '', trigger_val: '' });
};

window.addPaymentValidationNode = () => {
    const html = `<div class="node-wrapper"><div class="node-header" style="background: #2ecc71; color: white; font-family: 'Montserrat'; padding: 10px; border-radius: 8px 8px 0 0;"><i class="fa-solid fa-cash-register"></i> Validar Pago SMM</div><div class="node-body" style="padding: 12px; background: #fff; font-family: 'Montserrat';"><label style="font-size: 10px; font-weight: bold; color: #555;">ID PRODUCTO WOO:</label><input type="text" class="form-control mb-2" df-product_id placeholder="Ej: 125" style="font-size: 12px;"><label style="font-size: 10px; font-weight: bold; color: #555;">MONTO EXACTO (S/):</label><input type="text" class="form-control" df-amount placeholder="Ej: 20.00" style="font-size: 12px;"><p style="font-size: 9px; color: #888; margin-top: 8px;">* El bot esperará el comprobante tras este nodo.</p></div></div>`;
    createNode('payment_validation', 1, 1, html, { product_id: '', amount: '' });
};


/* --- FUNCIONES DE GESTIÓN DE FLUJOS --- */

// 1. Abrir el modal y cargar la lista
window.openFlowsModal = async function() {
    document.getElementById('flowsModal').style.display = 'flex';
    const list = document.getElementById('flowsList');
    list.innerHTML = '<p style="color:white;">Cargando...</p>';
    
    try {
        const res = await fetch('/api/get-flows');
        const flows = await res.json();
        list.innerHTML = "";
        flows.forEach(f => {
            const div = document.createElement('div');
            div.className = "flow-card";
            div.style = "background:#1a1b26; padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333;";
            div.innerHTML = `
                <span style="color:white; font-weight:500;">${f.name}</span>
                <div style="display:flex; gap:5px;">
                    <button onclick="loadSpecificFlow('${f.id}')" style="background:#2563eb; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Cargar</button>
                    <button onclick="deleteFlow('${f.id}')" style="background:#ff4b2b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🗑️</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) { list.innerHTML = '<p style="color:red;">Error al cargar flujos</p>'; }
}

// 2. Cargar un flujo específico (VERSIÓN CORREGIDA)
window.loadSpecificFlow = async function(id) {
    try {
        const res = await fetch(`/api/get-flow-by-id/${id}`);
        const responseData = await res.json();

        if (!responseData || !responseData.data) {
            console.warn("⚠ Flujo inválido");
            editor.import({ drawflow: { Home: { data: {} } } });
            return;
        }

        editor.clear();

        // 🔥 IMPORTAMOS SOLO data
        editor.import(responseData.data);

        currentEditingFlowId = responseData._id;

        setTimeout(() => {
            reconstruirFilas(responseData.data);
        }, 500);

    } catch (e) {
        console.error("❌ Error crítico al cargar:", e);
    }
};

// 3. Borrar flujo (Arregla el error 404 de la ruta)
window.deleteFlow = async function(id) {
    if(!confirm("¿Eliminar este flujo permanentemente?")) return;
    try {
        // CORRECCIÓN: La ruta debe ser /api/delete-flow/id
        const res = await fetch(`/api/delete-flow/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("🗑️ Eliminado");
            openFlowsModal(); // Recarga la lista
        }
    } catch (e) { alert("❌ Error al eliminar"); }
}

/* --- LISTENER PARA IMPORTACIÓN LIMPIA --- */
window.addEventListener('message', function(e) {
    if (e.data.type === 'IMPORT_CLEAN' || e.data.type === 'LOAD_FLOW') {
        const rawData = e.data.data;
        // Si no hay datos válidos, evitamos llamar a editor.import
        if (!rawData || !rawData.drawflow) {
            editor.clear();
            return;
        }
        setTimeout(() => editor.zoom_reset(), 100);
    }
});
/* === CARGA Y SINCRONIZACIÓN DEFINITIVA (WEBS RÁPIDAS) === */




// Carga inicial automática al abrir el editor
async function cargarFlujoPrincipal() {
    if (isImportingFlow) return;
isImportingFlow = true;
try {

        const res = await fetch('/api/get-flow');
        const data = await res.json();

        console.log("🔥 DATA RECIBIDA DEL BACKEND:", data);

        if (!data || !data.drawflow) {
            console.warn("⚠ Flujo vacío o inválido");
            return;
        }

        editor.clear();

        /* 🔥 CLONACIÓN SEGURA */
        const safeData = JSON.parse(JSON.stringify(data));

        /* 🔥 SANITIZAR NODOS */
        Object.values(safeData.drawflow.Home.data).forEach(node => {

            if (!node.inputs || node.inputs === null)
                node.inputs = {};

            if (!node.outputs || node.outputs === null)
                node.outputs = {};

        });

        editor.import(safeData);

requestAnimationFrame(() => {
    setTimeout(() => {
        editor.zoom_reset();
        editor.dispatchEvent(new Event('change'));
    }, 250);
});

        /* 🔥 Reconstrucción visual después del render */
        requestAnimationFrame(() => {
            setTimeout(() => {
                reconstruirFilas(safeData);
            }, 200);
        });

        console.log("✅ Flujo cargado correctamente");

    } catch (error) {
        console.error("❌ Error cargando flujo:", error);
    }
    isImportingFlow = false;
}
// Único punto de entrada
document.addEventListener('DOMContentLoaded', () => {
    // 800ms es el tiempo perfecto para que Montserrat y Drawflow carguen
    setTimeout(cargarFlujoPrincipal, 800); 
});
// ================= GUARDAR FLUJO =================
window.saveFlow = async function() {
    try {
        const exportedData = editor.export();
        const flowName = document.getElementById("flow_name")?.value || "Sin nombre";

        const res = await fetch("/api/save-flow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: currentEditingFlowId || null,
                name: flowName,
                data: exportedData,
                isMain: true
            })
        });

        const result = await res.json();

        if (result.success) {
            currentEditingFlowId = result.flowId;
            alert("✅ Flujo guardado correctamente");
        } else {
            alert("❌ No se pudo guardar");
        }

    } catch (e) {
        console.error("Error guardando flujo:", e);
        alert("Error al guardar flujo");
    }
};
function reconstruirFilas(flowData) {
    if (!flowData?.drawflow?.Home?.data) return;

    const nodes = flowData.drawflow.Home.data;

    Object.keys(nodes).forEach(nodeId => {
        const node = nodes[nodeId];

        if (node.name === "whatsapp_list") {

            const nodeElement = document.getElementById(`node-${nodeId}`);
            if (!nodeElement) return;

            const btnAdd = nodeElement.querySelector('.btn-success');
            if (!btnAdd) return;

            let i = 2;

            while (node.data[`row${i}`] !== undefined) {

                window.addRowDynamic(btnAdd, {
                    row: node.data[`row${i}`],
                    desc: node.data[`desc${i}`] || ""
                });

                i++;
            }
        }
    });

    console.log("✅ Filas reconstruidas correctamente");
}
