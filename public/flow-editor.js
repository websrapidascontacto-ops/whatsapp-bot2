const container = document.getElementById("drawflow");
const editor = new Drawflow(container);

editor.reroute = true;
editor.start();

editor.zoom_max = 1.6;
editor.zoom_min = 0.4;
editor.zoom_value = 0.1;

let lastNodeX = 150;
let lastNodeY = 120;
const horizontalSpacing = 380;

/* =========================
   ZOOM CON SCROLL
========================= */

container.addEventListener("wheel", function (e) {
  e.preventDefault();
  if (e.deltaY < 0) {
    editor.zoom_in();
  } else {
    editor.zoom_out();
  }
});

/* =========================
   VALIDAR DELAY
========================= */

function validateDelay(input) {
  if (parseInt(input.value) < 3) {
    input.value = 3;
  }
}

/* =========================
   X PEGADA A LA LINEA (SVG REAL)
========================= */

function addSvgDelete(connection) {
  const path = connection.querySelector("path");
  if (!path) return;

  const svg = connection.querySelector("svg");
  if (!svg) return;

  const old = svg.querySelector(".svg-delete");
  if (old) old.remove();

  const length = path.getTotalLength();
  const midpoint = path.getPointAtLength(length / 2);

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("svg-delete");
  group.style.cursor = "pointer";

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", midpoint.x);
  circle.setAttribute("cy", midpoint.y);
  circle.setAttribute("r", 10);
  circle.setAttribute("fill", "#ef4444");

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", midpoint.x);
  text.setAttribute("y", midpoint.y + 4);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "12");
  text.setAttribute("fill", "white");
  text.setAttribute("font-weight", "bold");
  text.textContent = "✕";

  group.appendChild(circle);
  group.appendChild(text);

  group.addEventListener("click", function () {
    connection.remove();
  });

  svg.appendChild(group);
}

function refreshConnections() {
  const connections = container.querySelectorAll(".connection");
  connections.forEach(conn => addSvgDelete(conn));
}

editor.on("connectionCreated", () => setTimeout(refreshConnections, 50));
editor.on("nodeMoved", () => setTimeout(refreshConnections, 50));
editor.on("zoom", () => setTimeout(refreshConnections, 50));

/* =========================
   POSICION AUTOMATICA
========================= */

function getNextPosition() {
  const x = lastNodeX;
  const y = lastNodeY;
  lastNodeX += horizontalSpacing;
  return { x, y };
}

/* =========================
   BOTON CERRAR MODULO
========================= */

function addCloseButton(nodeId) {
  const node = document.querySelector(`#node-${nodeId}`);
  if (!node) return;

  const close = document.createElement("div");
  close.innerHTML = "✕";
  close.className = "node-close-btn";

  close.onclick = (e) => {
    e.stopPropagation();
    editor.removeNodeId("node-" + nodeId);
  };

  node.appendChild(close);
}

/* =========================
   FILE SYSTEM
========================= */

function triggerFileInput(btn) {
  const input = btn.parentElement.querySelector("input[type='file']");
  input.click();
}

function handleFiles(input) {
  const list = input.parentElement.querySelector(".file-list");

  Array.from(input.files).forEach(file => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerText = file.name;
    list.appendChild(item);
  });

  input.value = "";
}

/* =========================
   EVITAR DRAG EN INPUTS
========================= */

editor.on("nodeSelected", function(){
  container.querySelectorAll("button, input, textarea").forEach(el=>{
    el.onmousedown = function(e){
      e.stopPropagation();
    };
  });
});

/* =========================
   CREAR NODOS
========================= */

function addTriggerNode() {
  const pos = getNextPosition();

  const id = editor.addNode(
    "trigger",
    0,
    1,
    pos.x,
    pos.y,
    "trigger",
    {},
    `
    <div>
      <div class="node-header header-trigger">Trigger</div>
      <div class="node-body">
        <input type="text" placeholder="Palabra clave">

        <div class="delay-inline">
          Tiempo:
          <div class="delay-input-wrapper">
            <input type="number" value="3" min="3" onchange="validateDelay(this)">
            <span>seg</span>
          </div>
        </div>

      </div>
    </div>
    `
  );

  setTimeout(() => addCloseButton(id), 50);
}

function addMessageNode() {
  const pos = getNextPosition();

  const id = editor.addNode(
    "message",
    1,
    1,
    pos.x,
    pos.y,
    "message",
    {},
    `
    <div>
      <div class="node-header header-message">Mensaje</div>
      <div class="node-body">
        <textarea rows="4" placeholder="Escribe el mensaje"></textarea>

        <div class="delay-inline">
          Tiempo:
          <div class="delay-input-wrapper">
            <input type="number" value="3" min="3" onchange="validateDelay(this)">
            <span>seg</span>
          </div>
        </div>

      </div>
    </div>
    `
  );

  setTimeout(() => addCloseButton(id), 50);
}

function addFilesNode() {
  const pos = getNextPosition();

  const id = editor.addNode(
    "files",
    1,
    1,
    pos.x,
    pos.y,
    "files",
    {},
    `
    <div>
      <div class="node-header header-files">Archivo</div>
      <div class="node-body">

        <div class="file-upload-container">
          <button type="button" class="file-btn" onclick="triggerFileInput(this)">
            + Añadir archivo
          </button>

          <input type="file" multiple style="display:none" onchange="handleFiles(this)">
          <div class="file-list"></div>
        </div>

        <div class="delay-inline">
          Tiempo:
          <div class="delay-input-wrapper">
            <input type="number" value="3" min="3" onchange="validateDelay(this)">
            <span>seg</span>
          </div>
        </div>

      </div>
    </div>
    `
  );

  setTimeout(() => addCloseButton(id), 50);
}

function addMenuNode() {
  const pos = getNextPosition();

  const id = editor.addNode(
    "menu",
    1,
    1,
    pos.x,
    pos.y,
    "menu",
    {},
    `
    <div>
      <div class="node-header header-menu">Menú</div>
      <div class="node-body">
        <div class="menu-options">
          <input type="text" placeholder="Opción 1">
          <input type="text" placeholder="Opción 2">
        </div>

        <button class="add-option-btn" onclick="addMenuOption(this)">
          + Agregar opción
        </button>

        <div class="delay-inline">
          Tiempo:
          <div class="delay-input-wrapper">
            <input type="number" value="3" min="3" onchange="validateDelay(this)">
            <span>seg</span>
          </div>
        </div>

      </div>
    </div>
    `
  );

  setTimeout(() => addCloseButton(id), 50);
}

function addMenuOption(btn) {
  const container = btn.parentElement.querySelector(".menu-options");
  const count = container.querySelectorAll("input").length + 1;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Opción " + count;

  container.appendChild(input);
}

/* =========================
   BOTONES LATERALES (FIX)
========================= */

document.querySelector(".btn-trigger").addEventListener("click", addTriggerNode);
document.querySelector(".btn-message").addEventListener("click", addMessageNode);
document.querySelector(".btn-files").addEventListener("click", addFilesNode);
document.querySelector(".btn-menu").addEventListener("click", addMenuNode);
