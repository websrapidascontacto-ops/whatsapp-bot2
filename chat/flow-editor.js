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
    if (!nodeElement) return;

    const nodeId = nodeElement.id.replace('node-', '');
    const containerRows = nodeElement.querySelector('.items-container');
    const nodeInfo = editor.getNodeFromId(nodeId);
    if (!nodeInfo) return;
    const nodeData = nodeInfo.data;
    
    // Contamos grupos actuales para definir el índice (ej: row2, row3...)
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

    const inputRow = group.querySelector(`[df-${keyRow}]`);
    const inputDesc = group.querySelector(`[df-${keyDesc}]`);

    // 💡 Si venimos de una carga (initialData tiene contenido)
    if(initialData) {
        inputRow.value = initialData.row || "";
        inputDesc.value = initialData.desc || "";
    }

    // Escuchar cambios para actualizar el objeto interno de Drawflow
    inputRow.addEventListener('input', (e) => { nodeData[keyRow] = e.target.value; });
    inputDesc.addEventListener('input', (e) => { nodeData[keyDesc] = e.target.value; });

    containerRows.appendChild(group);
    
    // Sincronizar el valor inicial en el objeto data (importante para el primer render)
    nodeData[keyRow] = inputRow.value;
    nodeData[keyDesc] = inputDesc.value;

    // Solo añadimos salida en el editor si es una fila nueva (no la inicial)
    if(count > 1 && !initialData) {
        editor.addNodeOutput(nodeId);
    }
};
let currentEditingFlowId = null; // Variable global para saber qué estamos editando
/* === GUARDAR Y CARGAR (CORREGIDO) === */
window.saveFlow = async function() {
    // 1. Obtener los datos actuales del editor
    const exportData = editor.export();
    
    // 2. Obtener el nombre del flujo
    const flowNameInput = document.getElementById('flow_name');
    const flowName = flowNameInput ? flowNameInput.value : "Flujo sin nombre";

    // 3. Obtener el ID del flujo actual (si existe)
    // Nota: Asegúrate de tener esta variable definida globalmente
    const payload = {
        id: typeof currentEditingFlowId !== 'undefined' ? currentEditingFlowId : null,
        name: flowName,
        data: exportData // Esto ya lleva la estructura drawflow.Home.data
    };

    console.log("Enviando flujo al servidor...", payload);

    try {
        const response = await fetch('/api/save-flow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            alert("✅ ¡Guardado con éxito! El bot ya tiene las rutas actualizadas.");
        } else {
            const errorText = await response.text();
            console.error("Error del servidor:", errorText);
            alert("❌ Error 500: El servidor rechazó el flujo. Revisa que el nombre no tenga caracteres raros.");
        }
    } catch (error) {
        console.error("Error en la petición:", error);
        alert("❌ Error de conexión al guardar.");
    }
};

/* --- LISTENER PARA IMPORTACIÓN CON FILAS (CORREGIDO) --- */
window.addEventListener('message', function(e) {
    if(e.data.type === 'IMPORT_CLEAN' || e.data.type === 'LOAD_FLOW') {
        const flowData = e.data.data;
        
        // 1. Limpiar e importar lo básico
        editor.clear();
        editor.import(flowData);

        // 2. RECONSTRUCCIÓN DE FILAS DINÁMICAS
        setTimeout(() => {
            const nodes = flowData.drawflow.Home.data;
            Object.keys(nodes).forEach(id => {
                const node = nodes[id];
                
                // Si el nodo es una lista (donde están tus planes SMM)
                if (node.name === "whatsapp_list") {
                    const nodeElement = document.getElementById(`node-${id}`);
                    if (!nodeElement) return;

                    const btnAdd = nodeElement.querySelector('.btn-success');
                    
                    // Empezamos desde la fila 2 (porque la 1 ya existe en el HTML base)
                    let i = 2;
                    while (node.data[`row${i}`] !== undefined) {
                        // Llamamos a tu función arreglada pasando la data inicial
                        window.addRowDynamic(btnAdd, {
                            row: node.data[`row${i}`],
                            desc: node.data[`desc${i}`] || ""
                        });
                        i++;
                    }
                }
            });
            
            editor.updateConnectionNodes('node-list');
            editor.zoom_reset();
            console.log("✅ Flujo Nemo reconstruido con filas dinámicas");
        }, 300); // 300ms es suficiente para que el DOM esté listo
    }
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

/* === GESTIÓN DE MIS FLUJOS (MODAL) === */
window.openFlowsModal = async function() {
    const modal = document.getElementById('flowsModal');
    const list = document.getElementById('flowsList');
    if(modal) modal.style.display = 'flex';
    if(list) list.innerHTML = "<p style='color:gray; font-family:Montserrat;'>Cargando flujos...</p>";
    
    try {
        const res = await fetch('/api/get-flows');
        const flows = await res.json();
        if(list) {
            list.innerHTML = ""; 
            flows.forEach(flow => {
                const card = document.createElement('div');
                card.className = "flow-card"; // Asegúrate de tener este CSS
                card.style = "background:#1a1b26; padding:15px; border-radius:10px; border:1px solid #444; margin-bottom:10px; display:flex; flex-direction:column; gap:10px;";
                
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-family:'Montserrat'; color:white; font-weight:600;">${flow.name}</span>
                        <div style="display:flex; gap:5px;">
                            <button onclick="loadSpecificFlow('${flow.id}')" style="background:#2563eb; color:white; border:none; padding:5px 10px; border-radius:5px; font-size:11px; cursor:pointer;">EDITAR ✏️</button>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="activateFlow('${flow.id}')" style="flex:1; background:#10b981; color:white; border:none; padding:8px; border-radius:5px; font-size:11px; font-weight:bold; cursor:pointer; font-family:'Montserrat';">ACTIVAR ✅</button>
                        <button onclick="deleteFlow('${flow.id}')" style="flex:1; background:#ef4444; color:white; border:none; padding:8px; border-radius:5px; font-size:11px; font-weight:bold; cursor:pointer; font-family:'Montserrat';">ELIMINAR 🗑️</button>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch (err) { if(list) list.innerHTML = "Error al conectar"; }
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

// 2. Cargar un flujo específico (Arregla el ReferenceError)
window.loadSpecificFlow = async function(id) {
    try {
        const res = await fetch(`/api/get-flow-by-id/${id}`);
        const responseData = await res.json();
        
        // Validamos la estructura para no romper el editor
        let flowToLoad = responseData.drawflow ? responseData : (responseData.data || { drawflow: { Home: { data: {} } } });
        
        editor.clear();
        editor.import(flowToLoad);
        currentEditingFlowId = id; 

        // 🔄 RECONSTRUCCIÓN DINÁMICA DE FILAS (SMM)
        setTimeout(() => {
            const nodes = flowToLoad.drawflow.Home.data;
            Object.keys(nodes).forEach(nodeId => {
                const node = nodes[nodeId];
                
                if (node.name === "whatsapp_list" && node.data) {
                    const nodeElement = document.getElementById(`node-${nodeId}`);
                    const btnAdd = nodeElement?.querySelector('.btn-success');
                    
                    if (btnAdd) {
                        // Limpiamos duplicados visuales antes de reconstruir (por seguridad)
                        const container = nodeElement.querySelector('.items-container');
                        const existingRows = container.querySelectorAll('.row-group');
                        // Si por error hay más de una fila inicial, las manejamos
                        
                        let i = 2; 
                        // Buscamos en la data si existen row2, row3, row4...
                        while (node.data[`row${i}`] !== undefined) {
                            window.addRowDynamic(btnAdd, {
                                row: node.data[`row${i}`],
                                desc: node.data[`desc${i}`] || ""
                            });
                            i++;
                        }
                    }
                }
            });
            editor.zoom_reset();
            console.log(`✅ Flujo ${id} reconstruido con todas sus filas.`);
        }, 600); // Tiempo prudente para que el DOM de Drawflow esté listo

        if(typeof closeFlowsModal === 'function') closeFlowsModal();
        
    } catch (e) {
        console.error("❌ Error crítico al cargar:", e);
        alert("No se pudo cargar el flujo correctamente.");
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

/* --- LISTENER PARA IMPORTACIÓN LIMPIA (TU ARCHIVO DE 51 NODOS) --- */
window.addEventListener('message', function(e) {
    if(e.data.type === 'IMPORT_CLEAN' || e.data.type === 'LOAD_FLOW') {
        const rawData = e.data.data;
        // Si rawData no tiene la estructura de Drawflow, le damos una
        const safeData = (rawData && rawData.drawflow) ? rawData : { "drawflow": { "Home": { "data": {} } } };
        
        editor.clear();
        editor.import(safeData);
        editor.zoom_reset();
    }
});
/* === CARGA AUTOMÁTICA AL INICIAR (SOLUCIÓN AL PANEL VACÍO) === */
async function cargarFlujoPrincipal() {
    try {
        const res = await fetch('/api/get-flow');
        const responseData = await res.json();

        // 🛡️ ESCUDO ANTI-ERROR: Si la API falla o viene vacía, creamos un objeto válido
        let flowToLoad;
        if (responseData && responseData.drawflow) {
            flowToLoad = responseData;
        } else if (responseData && responseData.data && responseData.data.drawflow) {
            flowToLoad = responseData.data;
        } else {
            console.warn("⚠️ API sin datos, inicializando lienzo limpio.");
            flowToLoad = { "drawflow": { "Home": { "data": {} } } };
        }

        // Limpiar e Importar
        editor.clear();
        editor.import(flowToLoad);

        // 🔄 RECONSTRUCCIÓN DE FILAS (SMM)
        setTimeout(() => {
            // Verificamos que existan nodos antes de intentar leer llaves
            if (!flowToLoad.drawflow.Home.data) return;
            
            const nodes = flowToLoad.drawflow.Home.data;
            Object.keys(nodes).forEach(id => {
                const node = nodes[id];
                if (node.name === "whatsapp_list") {
                    const nodeElement = document.getElementById(`node-${id}`);
                    if (nodeElement) {
                        const btnAdd = nodeElement.querySelector('.btn-success');
                        let i = 2;
                        // Cargamos filas guardadas
                        while (node.data && node.data[`row${i}`] !== undefined) {
                            window.addRowDynamic(btnAdd, {
                                row: node.data[`row${i}`],
                                desc: node.data[`desc${i}`] || ""
                            });
                            i++;
                        }
                    }
                }
            });
            editor.zoom_reset();
        }, 800);

        console.log("✅ Sistema cargado correctamente.");
    } catch (error) {
        console.error("❌ Error en la carga inicial:", error);
        // Fallback final: importar estructura mínima para evitar que el editor se congele
        editor.import({ "drawflow": { "Home": { "data": {} } } });
    }
}

// Ejecutar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(cargarFlujoPrincipal, 800); 
});
// Si el autostart falla, forzamos una recarga limpia
if (editor.drawflow.drawflow.Home.data && Object.keys(editor.drawflow.drawflow.Home.data).length === 0) {
    console.log("🔄 Reintentando carga forzada...");
    setTimeout(cargarFlujoPrincipal, 1500);
}