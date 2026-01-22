document.addEventListener("DOMContentLoaded", function () {
  var canvas = document.getElementById("canvas");
  var layersRoot = document.getElementById("layers");
  var propsFieldset = document.getElementById("props-fieldset");
  var propWidth = document.getElementById("prop-width");
  var propHeight = document.getElementById("prop-height");
  var propBg = document.getElementById("prop-bg");
  var propTextRow = document.getElementById("prop-text-row");
  var propText = document.getElementById("prop-text");
  var rectBtn = document.getElementById("create-rect");
  var textBtn = document.getElementById("create-text");

  if (!canvas) return;

  var MIN_W = 40;
  var MIN_H = 24;
  var KEY_STEP = 5;

  var resize = {
    active: false,
    pointerId: null,
    id: null,
    dir: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startRight: 0,
    startBottom: 0,
    hostId: null,
  };

  var drag = {
    active: false,
    pointerId: null,
    id: null,
    offsetX: 0,
    offsetY: 0,
  };

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getElementModelById(id) {
    var els = window.AppState.elements;
    for (var i = 0; i < els.length; i += 1) {
      if (els[i].id === id) return els[i];
    }
    return null;
  }

  function setElementPosition(id, x, y) {
    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (node) {
      node.style.left = toPx(x);
      node.style.top = toPx(y);
    }

    var model = getElementModelById(id);
    if (model) {
      model.x = x;
      model.y = y;
    }
  }

  function getPointerInCanvas(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      rect: rect,
    };
  }

  function applyZIndices() {
    var els = window.AppState.elements;
    for (var i = 0; i < els.length; i += 1) {
      var node = canvas.querySelector('[data-element-id="' + els[i].id + '"]');
      if (node) node.style.zIndex = String(i + 1);
    }
  }

  function getLayerLabel(model) {
    if (!model) return "Element";
    if (model.type === "text") return "Text";
    return "Rectangle";
  }

  function renderLayers() {
    if (!layersRoot) return;

    var selectedId = window.AppState.ui.selectedId;
    var els = window.AppState.elements;
    layersRoot.innerHTML = "";

    for (var i = els.length - 1; i >= 0; i -= 1) {
      var model = els[i];
      var row = document.createElement("div");
      row.className = "layer-item" + (model.id === selectedId ? " is-active" : "");
      row.dataset.id = model.id;

      var label = document.createElement("div");
      label.className = "layer-item__label";
      label.textContent = getLayerLabel(model) + " • " + model.id;

      var actions = document.createElement("div");
      actions.className = "layer-item__actions";

      var up = document.createElement("button");
      up.type = "button";
      up.className = "layer-btn";
      up.dataset.action = "forward";
      up.dataset.id = model.id;
      up.textContent = "Up";

      var down = document.createElement("button");
      down.type = "button";
      down.className = "layer-btn";
      down.dataset.action = "backward";
      down.dataset.id = model.id;
      down.textContent = "Down";

      actions.appendChild(up);
      actions.appendChild(down);
      row.appendChild(label);
      row.appendChild(actions);
      layersRoot.appendChild(row);
    }
  }

  function getElementIndexById(id) {
    var els = window.AppState.elements;
    for (var i = 0; i < els.length; i += 1) {
      if (els[i].id === id) return i;
    }
    return -1;
  }

  function swapElements(i, j) {
    var els = window.AppState.elements;
    var t = els[i];
    els[i] = els[j];
    els[j] = t;
  }

  function moveLayerForward(id) {
    var i = getElementIndexById(id);
    if (i < 0) return;
    if (i >= window.AppState.elements.length - 1) return;
    swapElements(i, i + 1);
    applyZIndices();
    renderLayers();
  }

  function moveLayerBackward(id) {
    var i = getElementIndexById(id);
    if (i <= 0) return;
    swapElements(i, i - 1);
    applyZIndices();
    renderLayers();
  }

  function toHexColor(v) {
    if (!v) return "";
    if (typeof v !== "string") return "";
    var s = v.trim();
    if (s[0] === "#" && (s.length === 7 || s.length === 4)) return s;
    return "";
  }

  function getSelectedModel() {
    var id = window.AppState.ui.selectedId;
    if (!id) return null;
    return getElementModelById(id);
  }

  function syncPropertiesPanel() {
    if (!propsFieldset) return;

    var model = getSelectedModel();
    if (!model) {
      propsFieldset.disabled = true;
      if (propWidth) propWidth.value = "";
      if (propHeight) propHeight.value = "";
      if (propBg) propBg.value = "";
      if (propText) propText.value = "";
      if (propTextRow) propTextRow.hidden = true;
      return;
    }

    propsFieldset.disabled = false;
    if (propWidth) propWidth.value = String(Math.round(model.width));
    if (propHeight) propHeight.value = String(Math.round(model.height));

    var bg = model.styles && model.styles.backgroundColor ? model.styles.backgroundColor : "";
    var hex = toHexColor(bg);
    if (propBg) propBg.value = hex || "#000000";

    if (propTextRow) propTextRow.hidden = model.type !== "text";
    if (model.type === "text" && propText) propText.value = model.text || "";
    if (model.type !== "text" && propText) propText.value = "";
  }

  function setElementSize(id, w, h) {
    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (node) {
      node.style.width = toPx(w);
      node.style.height = toPx(h);
    }

    var model = getElementModelById(id);
    if (model) {
      model.width = w;
      model.height = h;
    }
  }

  function applyPropertySize(kind, raw) {
    var model = getSelectedModel();
    if (!model) return;

    var n = Number(raw);
    if (!isFinite(n)) return;
    var v = Math.max(0, Math.round(n));

    var rect = canvas.getBoundingClientRect();
    var canvasW = rect.width;
    var canvasH = rect.height;

    var maxW = Math.max(MIN_W, canvasW - model.x);
    var maxH = Math.max(MIN_H, canvasH - model.y);

    var w = model.width;
    var h = model.height;
    if (kind === "width") w = clamp(v, MIN_W, maxW);
    if (kind === "height") h = clamp(v, MIN_H, maxH);
    setElementSize(model.id, w, h);
    syncResizeHandles();
  }

  function applyPropertyBg(value) {
    var model = getSelectedModel();
    if (!model) return;
    if (!model.styles) model.styles = {};
    model.styles.backgroundColor = value;
    var node = canvas.querySelector('[data-element-id="' + model.id + '"]');
    if (node) node.style.backgroundColor = value;
  }

  function applyPropertyText(value) {
    var model = getSelectedModel();
    if (!model) return;
    if (model.type !== "text") return;
    model.text = value;
    var node = canvas.querySelector('[data-element-id="' + model.id + '"]');
    if (node) node.textContent = value;
  }

  if (propWidth) {
    propWidth.addEventListener("input", function (e) {
      applyPropertySize("width", e.target.value);
    });
  }

  if (propHeight) {
    propHeight.addEventListener("input", function (e) {
      applyPropertySize("height", e.target.value);
    });
  }

  if (propBg) {
    propBg.addEventListener("input", function (e) {
      applyPropertyBg(e.target.value);
    });
  }

  if (propText) {
    propText.addEventListener("input", function (e) {
      applyPropertyText(e.target.value);
    });
  }

  function removeResizeHandles() {
    var current = canvas.querySelectorAll(".ll-resize-handle");
    for (var i = 0; i < current.length; i += 1) {
      current[i].remove();
    }
    resize.hostId = null;
  }

  function addResizeHandles(node, id) {
    var dirs = ["tl", "tr", "bl", "br"];
    for (var i = 0; i < dirs.length; i += 1) {
      var h = document.createElement("div");
      h.className = "ll-resize-handle";
      h.dataset.dir = dirs[i];
      node.appendChild(h);
    }
    resize.hostId = id;
  }

  function syncResizeHandles() {
    var id = window.AppState.ui.selectedId;
    if (!id) {
      if (resize.hostId) removeResizeHandles();
      return;
    }

    if (resize.hostId === id) return;
    if (resize.hostId) removeResizeHandles();

    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (!node) return;
    addResizeHandles(node, id);
  }

  function startResize(e, id, dir) {
    var model = getElementModelById(id);
    if (!model) return;

    var p = getPointerInCanvas(e);
    resize.active = true;
    resize.pointerId = e.pointerId;
    resize.id = id;
    resize.dir = dir;
    resize.startX = p.x;
    resize.startY = p.y;
    resize.startLeft = model.x;
    resize.startTop = model.y;
    resize.startRight = model.x + model.width;
    resize.startBottom = model.y + model.height;

    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (node) node.setPointerCapture(e.pointerId);
    document.body.classList.add("is-dragging");
    e.preventDefault();
  }

  function moveResize(e) {
    if (!resize.active) return;
    if (e.pointerId !== resize.pointerId) return;

    var p = getPointerInCanvas(e);
    var dx = p.x - resize.startX;
    var dy = p.y - resize.startY;
    var canvasW = p.rect.width;
    var canvasH = p.rect.height;

    var left = resize.startLeft;
    var top = resize.startTop;
    var right = resize.startRight;
    var bottom = resize.startBottom;

    if (resize.dir === "tl" || resize.dir === "bl") left = resize.startLeft + dx;
    if (resize.dir === "tr" || resize.dir === "br") right = resize.startRight + dx;
    if (resize.dir === "tl" || resize.dir === "tr") top = resize.startTop + dy;
    if (resize.dir === "bl" || resize.dir === "br") bottom = resize.startBottom + dy;

    if (right - left < MIN_W) {
      if (resize.dir === "tl" || resize.dir === "bl") left = right - MIN_W;
      else right = left + MIN_W;
    }

    if (bottom - top < MIN_H) {
      if (resize.dir === "tl" || resize.dir === "tr") top = bottom - MIN_H;
      else bottom = top + MIN_H;
    }

    if (resize.dir === "tl" || resize.dir === "bl") left = clamp(left, 0, right - MIN_W);
    else right = clamp(right, left + MIN_W, canvasW);

    if (resize.dir === "tl" || resize.dir === "tr") top = clamp(top, 0, bottom - MIN_H);
    else bottom = clamp(bottom, top + MIN_H, canvasH);

    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (right > canvasW) right = canvasW;
    if (bottom > canvasH) bottom = canvasH;

    if (right - left < MIN_W) {
      if (resize.dir === "tl" || resize.dir === "bl") left = Math.max(0, right - MIN_W);
      else right = Math.min(canvasW, left + MIN_W);
    }

    if (bottom - top < MIN_H) {
      if (resize.dir === "tl" || resize.dir === "tr") top = Math.max(0, bottom - MIN_H);
      else bottom = Math.min(canvasH, top + MIN_H);
    }

    setElementPosition(resize.id, left, top);
    var node = canvas.querySelector('[data-element-id="' + resize.id + '"]');
    if (node) {
      node.style.width = toPx(right - left);
      node.style.height = toPx(bottom - top);
    }

    var model = getElementModelById(resize.id);
    if (model) {
      model.width = right - left;
      model.height = bottom - top;
    }

    e.preventDefault();
  }

  function endResize(e) {
    if (!resize.active) return;
    if (e.pointerId !== resize.pointerId) return;

    var node = canvas.querySelector('[data-element-id="' + resize.id + '"]');
    if (node && node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    resize.active = false;
    resize.pointerId = null;
    resize.id = null;
    resize.dir = null;
    document.body.classList.remove("is-dragging");
    e.preventDefault();
  }

  function getCurrentDragNode() {
    if (!drag.id) return null;
    return canvas.querySelector('[data-element-id="' + drag.id + '"]');
  }

  function startDrag(e, id) {
    if (!id) return;

    var model = getElementModelById(id);
    if (!model) return;

    var p = getPointerInCanvas(e);
    drag.active = true;
    drag.pointerId = e.pointerId;
    drag.id = id;
    drag.offsetX = p.x - model.x;
    drag.offsetY = p.y - model.y;

    var node = getCurrentDragNode();
    if (node) node.setPointerCapture(e.pointerId);
    document.body.classList.add("is-dragging");
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!drag.active) return;
    if (e.pointerId !== drag.pointerId) return;

    var model = getElementModelById(drag.id);
    if (!model) return;

    var p = getPointerInCanvas(e);
    var canvasW = p.rect.width;
    var canvasH = p.rect.height;
    var maxX = Math.max(0, canvasW - model.width);
    var maxY = Math.max(0, canvasH - model.height);

    var nextX = clamp(p.x - drag.offsetX, 0, maxX);
    var nextY = clamp(p.y - drag.offsetY, 0, maxY);

    setElementPosition(drag.id, nextX, nextY);
    e.preventDefault();
  }

  function endDrag(e) {
    if (!drag.active) return;
    if (e.pointerId !== drag.pointerId) return;

    var node = getCurrentDragNode();
    if (node && node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    drag.active = false;
    drag.pointerId = null;
    drag.id = null;
    document.body.classList.remove("is-dragging");
    e.preventDefault();
  }

  function getSelectedNode() {
    var id = window.AppState.ui.selectedId;
    if (!id) return null;
    return canvas.querySelector('[data-element-id="' + id + '"]');
  }

  function clearSelection() {
    var selectedNode = getSelectedNode();
    if (selectedNode) selectedNode.classList.remove("is-selected");
    window.AppState.ui.selectedId = null;
  }

  function selectById(id) {
    if (!id) {
      clearSelection();
      return;
    }

    if (window.AppState.ui.selectedId === id) return;
    clearSelection();

    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (!node) return;
    node.classList.add("is-selected");
    window.AppState.ui.selectedId = id;
  }

  function nextElementId() {
    window.AppState.counters.element += 1;
    return "el_" + window.AppState.counters.element;
  }

  function toPx(n) {
    return String(Math.round(n)) + "px";
  }

  function applyInlineStyles(node, styles) {
    if (!styles) return;
    Object.keys(styles).forEach(function (key) {
      node.style[key] = styles[key];
    });
  }

  function renderElement(model) {
    var node = document.createElement("div");
    node.className = "ll-element";
    node.dataset.elementId = model.id;
    node.style.left = toPx(model.x);
    node.style.top = toPx(model.y);
    node.style.width = toPx(model.width);
    node.style.height = toPx(model.height);

    if (model.type === "text") {
      node.textContent = model.text || "Text";
      node.contentEditable = "true";
      node.spellcheck = false;
    }

    applyInlineStyles(node, model.styles);
    canvas.appendChild(node);
  }

  function isTextEditingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    var tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function removeElementById(id) {
    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (node) node.remove();

    var els = window.AppState.elements;
    for (var i = 0; i < els.length; i += 1) {
      if (els[i].id === id) {
        els.splice(i, 1);
        break;
      }
    }

    if (resize.hostId === id) removeResizeHandles();
    applyZIndices();
    renderLayers();
    syncPropertiesPanel();
  }

  function moveSelectedBy(dx, dy) {
    var model = getSelectedModel();
    if (!model) return;

    var rect = canvas.getBoundingClientRect();
    var maxX = Math.max(0, rect.width - model.width);
    var maxY = Math.max(0, rect.height - model.height);
    var nextX = clamp(model.x + dx, 0, maxX);
    var nextY = clamp(model.y + dy, 0, maxY);
    setElementPosition(model.id, nextX, nextY);
    syncResizeHandles();
    syncPropertiesPanel();
  }

  document.addEventListener("keydown", function (e) {
    if (!window.AppState.ui.selectedId) return;
    if (isTextEditingTarget(e.target)) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      var id = window.AppState.ui.selectedId;
      clearSelection();
      removeResizeHandles();
      removeElementById(id);
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowLeft") {
      moveSelectedBy(-KEY_STEP, 0);
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowRight") {
      moveSelectedBy(KEY_STEP, 0);
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowUp") {
      moveSelectedBy(0, -KEY_STEP);
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      moveSelectedBy(0, KEY_STEP);
      e.preventDefault();
    }
  });

  if (layersRoot) {
    layersRoot.addEventListener("pointerdown", function (e) {
      var btn = e.target.closest("button");
      if (btn && btn.dataset && btn.dataset.action && btn.dataset.id) {
        e.preventDefault();
        if (btn.dataset.action === "forward") moveLayerForward(btn.dataset.id);
        if (btn.dataset.action === "backward") moveLayerBackward(btn.dataset.id);
        return;
      }

      var row = e.target.closest(".layer-item");
      if (!row) return;
      var id = row.dataset.id;
      selectById(id);
      syncResizeHandles();
      renderLayers();
      syncPropertiesPanel();
      e.preventDefault();
    });
  }

  canvas.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(".ll-element");
    if (!el) return;
    var id = el.dataset.elementId;
    if (id !== window.AppState.ui.selectedId) return;
    startDrag(e, id);
  });

  canvas.addEventListener("pointermove", moveDrag);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(".ll-element");
    if (!el) {
      if (e.target === canvas) clearSelection();
      return;
    }

    var id = el.dataset.elementId;
    selectById(id);
  });

  canvas.addEventListener(
    "pointerdown",
    function (e) {
      var handle = e.target.closest(".ll-resize-handle");
      if (!handle) return;

      var el = handle.closest(".ll-element");
      if (!el) return;

      var id = el.dataset.elementId;
      if (id !== window.AppState.ui.selectedId) return;

      var dir = handle.dataset.dir;
      if (!dir) return;

      e.stopPropagation();
      startResize(e, id, dir);
    },
    true
  );

  canvas.addEventListener("pointermove", moveResize);
  canvas.addEventListener("pointerup", endResize);
  canvas.addEventListener("pointercancel", endResize);

  canvas.addEventListener("pointerdown", function () {
    syncResizeHandles();
    renderLayers();
    syncPropertiesPanel();
  });

  function addElement(type) {
    var id = nextElementId();

    var element = {
      id: id,
      type: type,
      x: 24,
      y: 24,
      width: type === "text" ? 200 : 160,
      height: type === "text" ? 40 : 120,
      styles: {},
    };

    if (type === "rect") {
      element.styles = {
        backgroundColor: "#4f46e5",
        borderRadius: "6px",
      };
    }

    if (type === "text") {
      element.text = "Double click to edit";
      element.styles = {
        color: "#f3f4f6",
        fontSize: "16px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        padding: "8px",
      };
    }

    window.AppState.elements.push(element);
    renderElement(element);
    applyZIndices();
    renderLayers();
    syncPropertiesPanel();
  }

  if (rectBtn) {
    rectBtn.addEventListener("click", function () {
      addElement("rect");
    });
  }

  if (textBtn) {
    textBtn.addEventListener("click", function () {
      addElement("text");
    });
  }

  applyZIndices();
  renderLayers();
  syncPropertiesPanel();
});
