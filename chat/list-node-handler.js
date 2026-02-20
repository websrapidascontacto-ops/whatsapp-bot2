/* ============================================================
   HANDLER EXCLUSIVO PARA NODOS DINÁMICOS (LISTAS Y MENÚS)
   ============================================================ */

window.addListNode = function() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-list"><i class="fa-solid fa-list-ul"></i> Lista WhatsApp</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-list_title placeholder="Título del Menú">
                <input type="text" class="form-control mb-2" df-button_text placeholder="Texto del Botón">
                <div id="list-items-${nodeId}" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-row1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addDynamicRow(${nodeId}, 'row')">+ Añadir Fila</button>
            </div>
        </div>`;
    createNode("whatsapp_list", 1, 1, html, { list_title: '', button_text: '', row1: '' });
};

window.addMenuNode = function() {
    const nodeId = editor.getNextId();
    const html = `
        <div class="node-wrapper">
            <div class="node-header header-menu">📋 Menú Numérico</div>
            <div class="node-body">
                <input type="text" class="form-control mb-2" df-info placeholder="Título">
                <div id="menu-items-${nodeId}" class="menu-options-list">
                    <input type="text" class="form-control mb-1" df-option1 placeholder="Opción 1">
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="addDynamicRow(${nodeId}, 'option')">+ Opción</button>
            </div>
        </div>`;
    createNode("menu", 1, 1, html, { info: '', option1: '' });
};

window.addDynamicRow = (nodeId, prefix) => {
    const type = prefix === 'row' ? 'list' : 'menu';
    const container = document.getElementById(`${type}-items-${nodeId}`);
    if(!container) return;
    
    const count = container.querySelectorAll("input").length + 1;
    if(count > 10) return alert("Máximo 10 opciones permitidas");

    editor.addNodeOutput(nodeId);
    const input = document.createElement("input");
    input.className = "form-control mb-1";
    input.placeholder = "Opción " + count;
    input.setAttribute(`df-${prefix}${count}`, "");
    container.appendChild(input);
    
    // Sincronizar con el motor de Drawflow
    if(editor.updateNodeValueById) editor.updateNodeValueById(nodeId);
};