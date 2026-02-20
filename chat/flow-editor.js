/* ============================================================
   CONFIGURACIÓN INICIAL DE DRAWFLOW
   ============================================================ */
const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();

// Configuración de Zoom
editor.zoom_max = 2;
editor.zoom_min = 0.3;
editor.zoom_value = 0.1;

container.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (e.deltaY < 0) editor.zoom_in();
    else editor.zoom_out();
});

/* ============================================================
   SISTEMA DE POSICIONAMIENTO AUTOMÁTICO (UX)
   ============================================================ */
let lastNodeX = 50;
let lastNodeY = 150;

function getNextPosition() {
    const pos = { x: lastNodeX, y: lastNodeY };
    lastNodeX += 380; // Coloca la nueva caja a la derecha
    if (lastNodeX > 1400) { // Salto de línea si llega al borde
        lastNodeX = 50;
        lastNodeY += 450;
    }
    return pos;
}

/* ============================================================
   COMUNICACIÓN CON EL CRM (GUARDAR / CARGAR)
   ============================================================ */
function saveFlow() {
    const data = editor.export();
    console.log("Guardando flujo...", data);
    window.parent.postMessage({ type: 'SAVE_FLOW', data }, '*');
}

// Escuchar mensajes del padre (index.html)
window.addEventListener('message', (e) => {
    if (e.data.type === 'LOAD_FLOW' && e.data.data) {
        editor.import(e.data.data);
    }
});

// Pedir datos al servidor apenas cargue la página
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        window.parent.postMessage({ type: 'REQUEST_FLOW' }, '*');
    }, 500);
});

/* ============================================================
   FUNCIONES PARA CREAR NODOS
   ============================================================ */
function createNode(type, inputs, outputs, html, data = {}) {
    const pos = getNextPosition();
    const nodeId = editor.addNode(type, inputs, outputs, pos.x, pos.y, type, data, html);
    
    // Botón de eliminar nodo (Style UX)
    const nodeElem = document.getElementById(`node-${nodeId}`);
    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "×";
    closeBtn.className = "node-close-btn";
    closeBtn.onclick = () => editor.removeNodeId("node-" + nodeId);
    nodeElem.appendChild(closeBtn);
}

// 1. Nodo Trigger (Palabra Clave)
function addTriggerNode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-trigger">⚡ Trigger</div>
            <div class="node-body">
                <label>Palabra Clave:</label>
                <input type="text" class="form-control" df-val placeholder="Ej: hola">
            </div>
        </div>
    `;
    createNode("trigger", 0, 1, html);
}

// 2. Nodo Mensaje Simple
function addMessageNode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-message">💬 Mensaje</div>
            <div class="node-body">
                <label>Texto de respuesta:</label>
                <textarea class="form-control" df-info rows="3" placeholder="Escribe aquí..."></textarea>
            </div>
        </div>
    `;
    createNode("message", 1, 1, html);
}

// 3. Nodo Inteligencia Artificial ( Montserrat Style )
function addIANode() {
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-ia">🤖 IA Chatbot</div>
            <div class="node-body">
                <label>Instrucciones (Contexto):</label>
                <textarea class="form-control" df-info rows="3">Base: S/380. WhatsApp: 991138132. Web: websrapidas.com</textarea>
            </div>
        </div>
    `;
    createNode("ia", 1, 1, html);
}

// 4. Nodo Menú Numérico
function addMenuNode() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú Numérico</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título del menú">
                <div id="options-${nodeId}" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addMenuOption(${nodeId})">+ Añadir Opción</button>
            </div>
        </div>
    `;
    createNode("menu", 1, 1, html);
}

window.addMenuOption = function(nodeId) {
    const container = document.getElementById(`options-${nodeId}`);
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId); // Crea un nuevo punto de conexión
    
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-option${count}`, "");
    container.appendChild(input);
};

// 5. NUEVO: Nodo Lista de Botones (WhatsApp Interactive)
function addListNode() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list" style="background: #056162; color: white;">
                <i class="fa-solid fa-list-ul"></i> Lista de Botones
            </div>
            <div class="node-body">
                <label>Título de la Lista:</label>
                <input type="text" class="form-control mb-2" df-list_title placeholder="Ej: Nuestros Servicios">
                
                <label>Texto del Botón:</label>
                <input type="text" class="form-control mb-2" df-button_text placeholder="Ej: Ver opciones">

                <div id="list-items-${nodeId}" class="menu-options-list">
                    <label>Filas (Opciones):</label>
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Fila 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addListRow(${nodeId})">+ Añadir Fila</button>
            </div>
        </div>
    `;
    createNode("whatsapp_list", 1, 1, html);
}

window.addListRow = function(nodeId) {
    const container = document.getElementById(`list-items-${nodeId}`);
    const count = container.querySelectorAll("input").length + 1;
    editor.addNodeOutput(nodeId); // Crea salida para la nueva fila
    
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Fila " + count;
    input.setAttribute(`df-row${count}`, "");
    container.appendChild(input);
};

/* ============================================================
   VINCULACIÓN DE BOTONES DEL HEADER
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    // Si tus botones en el HTML no tienen onclick, los vinculamos aquí:
    const btnTrigger = document.querySelector(".btn-trigger");
    if(btnTrigger) btnTrigger.onclick = addTriggerNode;

    const btnIA = document.querySelector(".btn-ia");
    if(btnIA) btnIA.onclick = addIANode;

    const btnMsg = document.querySelector(".btn-message");
    if(btnMsg) btnMsg.onclick = addMessageNode;

    const btnMenu = document.querySelector(".btn-menu");
    if(btnMenu) btnMenu.onclick = addMenuNode;
    
    // El botón de lista debe existir en tu HTML para que esto funcione
    const btnList = document.querySelector(".btn-list");
    if(btnList) btnList.onclick = addListNode;
});