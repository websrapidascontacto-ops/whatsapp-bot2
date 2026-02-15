let conexiones = [];
let nodos = [];
let editorIniciado = false;
let puertoOrigen = null;

// Variables para mover el canvas
let isDraggingCanvas = false;
let startX, startY;
let scrollLeft, scrollTop;

// Variables para zoom
let zoomLevel = 1;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

function startEditor() {
  if (editorIniciado) return;
  editorIniciado = true;

  const container = document.getElementById('flow-editor-container');

  container.innerHTML = `
    <div class="flow-header">
      <span>Editor de Flujos</span>
      <div>
        <button class="btn btn-sm btn-light" onclick="crearNodo('trigger')">+ Trigger</button>
        <button class="btn btn-sm btn-light" onclick="crearNodo('mensaje')">+ Mensaje</button>
        <button class="btn btn-sm btn-light" onclick="crearNodo('media')">+ Multimedia</button>
        <button class="btn btn-sm btn-light" onclick="crearNodo('menu')">+ Menú</button>
        <button class="btn btn-sm btn-success" onclick="guardarFlujo()">Guardar</button>
        <button class="btn btn-sm btn-danger" onclick="cerrarEditor()">Cerrar</button>
      </div>
    </div>
    <div id="canvas-wrapper">
      <svg id="svg-canvas"></svg>
      <div id="canvas-area"></div>
      <div id="zoom-controls">
        <button class="btn btn-sm btn-light" onclick="zoomIn()">+</button>
        <button class="btn btn-sm btn-light" onclick="zoomOut()">-</button>
      </div>
    </div>
  `;

  const canvasWrapper = document.getElementById('canvas-wrapper');
  const canvasArea = document.getElementById('canvas-area');

  // Hacer que el canvas sea draggable (scroll)
  canvasWrapper.onmousedown = (e) => {
    if (e.target.id === 'canvas-area' || e.target.tagName === 'SVG') {
      isDraggingCanvas = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = canvasWrapper.scrollLeft;
      scrollTop = canvasWrapper.scrollTop;
      canvasWrapper.style.cursor = 'grabbing';
    }
  };

  document.onmousemove = (e) => {
    if (!isDraggingCanvas) return;
    const x = e.clientX - startX;
    const y = e.clientY - startY;
    canvasWrapper.scrollLeft = scrollLeft - x;
    canvasWrapper.scrollTop = scrollTop - y;
  };

  document.onmouseup = () => {
    isDraggingCanvas = false;
    canvasWrapper.style.cursor = 'default';
  };

  // Zoom con scroll del mouse
  canvasWrapper.onwheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  cargarFlujo();
}

// Funciones de zoom
function zoomIn() {
  zoomLevel = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
  aplicarZoom();
}

function zoomOut() {
  zoomLevel = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
  aplicarZoom();
}

function aplicarZoom() {
  const canvasArea = document.getElementById('canvas-area');
  const svgCanvas = document.getElementById('svg-canvas');
  canvasArea.style.transform = `scale(${zoomLevel})`;
  canvasArea.style.transformOrigin = '0 0';
  svgCanvas.style.transform = `scale(${zoomLevel})`;
  svgCanvas.style.transformOrigin = '0 0';
  dibujarConexiones();
}

function cerrarEditor() {
  document.getElementById('flow-editor-container').style.display = 'none';
}

function crearNodo(tipo, data = null) {
  const canvas = document.getElementById('canvas-area');

  const nodo = document.createElement('div');
  nodo.className = 'nodo';
  nodo.dataset.id = data?.id || 'nodo_' + Date.now();
  nodo.dataset.tipo = tipo;
  nodo.style.left = data?.x || '200px';
  nodo.style.top = data?.y || '150px';

  let titulo = '';
  let body = '';

  if (tipo === 'trigger') {
    titulo = 'Trigger';
    body = `<input class="form-control form-control-sm contenido" placeholder="Palabra clave" value="${data?.contenido || ''}">`;
  }

  if (tipo === 'mensaje') {
    titulo = 'Mensaje';
    body = `<textarea class="form-control form-control-sm contenido" placeholder="Mensaje">${data?.contenido || ''}</textarea>`;
  }

  if (tipo === 'media') {
    titulo = 'Multimedia';
    body = `
      <select class="form-select form-select-sm tipo-media">
        <option value="imagen">Imagen</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
        <option value="pdf">PDF</option>
      </select>
      <input type="file" class="form-control form-control-sm mt-2">
    `;
  }

  if (tipo === 'menu') {
    titulo = 'Menú';
    body = `
      <input class="form-control form-control-sm mb-2 contenido" placeholder="Pregunta">
      <div class="opciones"></div>
      <button class="btn btn-sm btn-outline-primary w-100 mt-2" onclick="agregarOpcion(this)">+ Agregar Opción</button>
    `;
  }

  nodo.innerHTML = `
    <div class="nodo-header ${tipo}">
      ${titulo}
    </div>
    <div class="nodo-body">
      ${body}
    </div>
    <div class="port port-in"></div>
    <div class="port port-out"></div>
  `;

  hacerDraggable(nodo);
  configurarPuertos(nodo);

  canvas.appendChild(nodo);
  nodos.push(nodo);
}

function agregarOpcion(btn) {
  const cont = btn.parentElement.querySelector('.opciones');
  const div = document.createElement('div');
  div.className = 'd-flex align-items-center mb-1';
  div.innerHTML = `
    <input class="form-control form-control-sm me-2 opcion-texto" placeholder="Opción">
    <div class="port port-out"></div>
  `;
  cont.appendChild(div);
}

function configurarPuertos(nodo) {
  nodo.querySelectorAll('.port').forEach(port => {
    port.onmousedown = () => puertoOrigen = port;
    port.onmouseup = () => {
      if (puertoOrigen && port.classList.contains('port-in')) {
        conexiones.push({
          desde: puertoOrigen.parentElement.dataset.id,
          hacia: nodo.dataset.id
        });
        puertoOrigen = null;
        dibujarConexiones();
      }
    };
  });
}

function dibujarConexiones() {
  const svg = document.getElementById('svg-canvas');
  svg.innerHTML = '';

  conexiones.forEach((c, index) => {
    const n1 = document.querySelector(`[data-id='${c.desde}']`);
    const n2 = document.querySelector(`[data-id='${c.hacia}']`);
    if (!n1 || !n2) return;

    const x1 = n1.offsetLeft + n1.offsetWidth;
    const y1 = n1.offsetTop + n1.offsetHeight / 2;
    const x2 = n2.offsetLeft;
    const y2 = n2.offsetTop + n2.offsetHeight / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${x1+100},${y1} ${x2-100},${y2} ${x2},${y2}`);
    path.setAttribute("stroke", "#000");
    path.setAttribute("fill", "transparent");
    path.setAttribute("stroke-width", "2");

    svg.appendChild(path);

    // Botón X
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const btn = document.createElement('div');
    btn.className = 'btn-del-line';
    btn.style.left = midX + 'px';
    btn.style.top = midY + 'px';
    btn.innerHTML = '×';
    btn.onclick = () => {
      conexiones.splice(index, 1);
      dibujarConexiones();
    };

    document.getElementById('canvas-wrapper').appendChild(btn);
  });
}

function hacerDraggable(el) {
  let offsetX, offsetY;
  el.onmousedown = function(e) {
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;

    document.onmousemove = function(e) {
      el.style.left = e.clientX - offsetX + 'px';
      el.style.top = e.clientY - offsetY + 'px';
      dibujarConexiones();
    };

    document.onmouseup = function() {
      document.onmousemove = null;
    };
  };
}

function guardarFlujo() {
  const data = {
    nodos: [],
    conexiones
  };

  document.querySelectorAll('.nodo').forEach(n => {
    data.nodos.push({
      id: n.dataset.id,
      tipo: n.dataset.tipo,
      x: n.style.left,
      y: n.style.top,
      contenido: n.querySelector('.contenido')?.value || ''
    });
  });

  fetch('/api/guardar-flujo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(() => alert("Flujo guardado"));
}

function cargarFlujo() {
  fetch('/api/cargar-flujo')
    .then(r => r.json())
    .then(data => {
      conexiones = data.conexiones || [];
      data.nodos.forEach(n => crearNodo(n.tipo, n));
      setTimeout(dibujarConexiones, 200);
    });
}
