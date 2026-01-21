document.addEventListener("DOMContentLoaded", function () {
  var canvas = document.getElementById("canvas");
  var rectBtn = document.getElementById("create-rect");
  var textBtn = document.getElementById("create-text");

  if (!canvas) return;

  var MIN_W = 40;
  var MIN_H = 24;

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
});
