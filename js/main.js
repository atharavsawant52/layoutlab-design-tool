document.addEventListener("DOMContentLoaded", function () {
  var canvas = document.getElementById("canvas");
  var layersRoot = document.getElementById("layers");
  var propsFieldset = document.getElementById("props-fieldset");
  var propWidth = document.getElementById("prop-width");
  var propHeight = document.getElementById("prop-height");
  var propBg = document.getElementById("prop-bg");
  var propTextRow = document.getElementById("prop-text-row");
  var propText = document.getElementById("prop-text");
  var propImageRow = document.getElementById("prop-image-row");
  var propImage = document.getElementById("prop-image");
  var exportJsonBtn = document.getElementById("export-json");
  var exportHtmlBtn = document.getElementById("export-html");
  var snapToggleBtn = document.getElementById("snap-toggle");
  var gridSizeInput = document.getElementById("grid-size");
  var zoomOutBtn = document.getElementById("zoom-out");
  var zoomInBtn = document.getElementById("zoom-in");
  var zoomResetBtn = document.getElementById("zoom-reset");
  var alignLeftBtn = document.getElementById("align-left");
  var alignCenterBtn = document.getElementById("align-center");
  var alignRightBtn = document.getElementById("align-right");
  var alignTopBtn = document.getElementById("align-top");
  var alignMiddleBtn = document.getElementById("align-middle");
  var alignBottomBtn = document.getElementById("align-bottom");
  var guideRoot = document.getElementById("guide");
  var openGuideBtn = document.getElementById("open-guide");
  var closeGuideBtn = document.getElementById("close-guide");
  var emptyState = document.getElementById("empty-state");
  var welcomeRoot = document.getElementById("welcome");
  var startDesigningBtn = document.getElementById("start-designing");
  var rectBtn = document.getElementById("create-rect");
  var textBtn = document.getElementById("create-text");
  var circleBtn = document.getElementById("create-circle");
  var lineBtn = document.getElementById("create-line");
  var imageBtn = document.getElementById("create-image");
  var buttonBtn = document.getElementById("create-button");

  if (!canvas) return;

  var MIN_W = 40;
  var MIN_H = 24;
  var KEY_STEP = 5;
  var STORAGE_KEY = "layoutlab.layout.v1";
  var saveQueued = false;
  var MAX_HISTORY = 50;
  var undoStack = [];
  var redoStack = [];

  var editorSettings = {
    snapEnabled: !!(window.AppState.ui && window.AppState.ui.snapEnabled),
    gridSize: Math.max(1, Math.round(Number(window.AppState.ui && window.AppState.ui.gridSize) || 10)),
    zoomLevel: clamp(Number(window.AppState.ui && window.AppState.ui.zoom) || 1, 0.25, 4),
  };

  function syncSettingsToState() {
    if (!window.AppState.ui) window.AppState.ui = {};
    window.AppState.ui.snapEnabled = !!editorSettings.snapEnabled;
    window.AppState.ui.gridSize = Math.max(1, Math.round(editorSettings.gridSize));
    window.AppState.ui.zoom = clamp(editorSettings.zoomLevel, 0.25, 4);
  }

  syncSettingsToState();

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
    mode: "single",
    node: null,
    model: null,
    items: null,
  };

  var drag = {
    active: false,
    pointerId: null,
    id: null,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    items: null,
    node: null,
    model: null,
  };

  var groupBox = {
    node: null,
    hostKey: "",
  };

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getZoom() {
    var z = Number(editorSettings.zoomLevel);
    if (!isFinite(z)) return 1;
    return clamp(z, 0.25, 4);
  }

  function setZoom(z) {
    editorSettings.zoomLevel = clamp(Number(z) || 1, 0.25, 4);
    syncSettingsToState();
    canvas.style.transform = "scale(" + getZoom() + ")";
    if (zoomResetBtn) zoomResetBtn.textContent = Math.round(getZoom() * 100) + "%";
  }

  function getCanvasSize() {
    var rect = canvas.getBoundingClientRect();
    var z = getZoom();
    return {
      rect: rect,
      width: rect.width / z,
      height: rect.height / z,
      zoom: z,
    };
  }

  function getGridSize() {
    var n = Number(editorSettings.gridSize);
    if (!isFinite(n)) return 10;
    return Math.max(1, Math.round(n));
  }

  function isSnapEnabled() {
    return !!editorSettings.snapEnabled;
  }

  function snapValue(n) {
    if (!isSnapEnabled()) return n;
    var g = getGridSize();
    return Math.round(n / g) * g;
  }

  function syncSnapControls() {
    if (snapToggleBtn) snapToggleBtn.textContent = editorSettings.snapEnabled ? "Snap: On" : "Snap: Off";
    if (gridSizeInput) gridSizeInput.value = String(getGridSize());
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

  function setElementPositionFast(node, model, x, y) {
    if (node) {
      node.style.left = toPx(x);
      node.style.top = toPx(y);
    }
    if (model) {
      model.x = x;
      model.y = y;
    }
  }

  function getPointerInCanvas(e) {
    var rect = canvas.getBoundingClientRect();
    var z = getZoom();
    return {
      x: (e.clientX - rect.left) / z,
      y: (e.clientY - rect.top) / z,
      rect: { left: rect.left, top: rect.top, width: rect.width / z, height: rect.height / z },
    };
  }

  function applyZIndices() {
    var els = window.AppState.elements;
    for (var i = 0; i < els.length; i += 1) {
      var node = canvas.querySelector('[data-element-id="' + els[i].id + '"]');
      if (node) node.style.zIndex = String(i + 1);
    }
  }

  function snapshotState() {
    return JSON.parse(
      JSON.stringify({
        elements: window.AppState.elements,
        ui: { selectedIds: window.AppState.ui.selectedIds },
        counters: { element: window.AppState.counters.element },
      })
    );
  }

  function pushHistory() {
    undoStack.push(snapshotState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }

  function restoreSnapshot(snap) {
    if (!snap || !snap.elements || !snap.ui || !snap.counters) return;

    removeResizeHandles();
    removeGroupBox();
    window.AppState.elements.length = 0;
    clearCanvasElements();

    for (var i = 0; i < snap.elements.length; i += 1) {
      var model = snap.elements[i];
      if (!model || !model.id || !model.type) continue;
      if (!model.styles || typeof model.styles !== "object") model.styles = {};
      clampModelToCanvas(model);
      window.AppState.elements.push(model);
      renderElement(model);
    }

    window.AppState.counters.element = snap.counters.element || 0;
    window.AppState.ui.selectedIds = Array.isArray(snap.ui.selectedIds) ? snap.ui.selectedIds : [];
    window.AppState.ui.selectedIds = window.AppState.ui.selectedIds.filter(function (id) {
      return !!getElementModelById(id);
    });

    applyZIndices();
    renderLayers();
    syncPropertiesPanel();

    syncSelectionUI();
    syncEmptyState();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotState());
    var snap = undoStack.pop();
    restoreSnapshot(snap);
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    var snap = redoStack.pop();
    restoreSnapshot(snap);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fileStamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      "-" +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  function downloadFile(filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function buildExportData() {
    var els = window.AppState.elements;
    var out = [];
    for (var i = 0; i < els.length; i += 1) {
      var m = els[i];
      out.push({
        id: m.id,
        type: m.type,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        styles: m.styles || {},
        zIndex: i + 1,
        text: m.type === "text" || m.type === "button" ? (m.text || "") : undefined,
        src: m.type === "image" ? (m.src || "") : undefined,
      });
    }
    return out;
  }

  function exportJson() {
    var data = buildExportData();
    var json = JSON.stringify(data, null, 2);
    downloadFile("layoutlab-" + fileStamp() + ".json", "application/json", json);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function styleObjectToCss(styles) {
    if (!styles) return "";
    var keys = Object.keys(styles);
    var out = "";
    for (var i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      var v = styles[k];
      if (v === null || v === undefined || v === "") continue;
      var prop = k.replace(/[A-Z]/g, function (m) {
        return "-" + m.toLowerCase();
      });
      out += prop + ":" + String(v) + ";";
    }
    return out;
  }

  function exportHtml() {
    var data = buildExportData();
    var size = getCanvasSize();
    var w = Math.max(1, Math.round(size.width));
    var h = Math.max(1, Math.round(size.height));

    var body = "";
    for (var i = 0; i < data.length; i += 1) {
      var el = data[i];
      var base =
        "position:absolute;" +
        "left:" + Math.round(el.x) + "px;" +
        "top:" + Math.round(el.y) + "px;" +
        "width:" + Math.round(el.width) + "px;" +
        "height:" + Math.round(el.height) + "px;" +
        "z-index:" + el.zIndex + ";";

      var style = base + styleObjectToCss(el.styles);
      if (el.type === "image" && el.src) {
        body +=
          '<div style="' +
          style +
          '">' +
          '<img src="' +
          String(el.src) +
          '" style="width:100%;height:100%;object-fit:cover;display:block;" />' +
          "</div>";
      } else {
        var content = el.type === "text" || el.type === "button" ? escapeHtml(el.text || "") : "";
        body += '<div style="' + style + '">' + content + "</div>";
      }
    }

    var html =
      "<!doctype html>" +
      '<html lang="en">' +
      "<head>" +
      '<meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      "<title>LayoutLab Export</title>" +
      "</head>" +
      '<body style="margin:0;background:#0c0c0c;">' +
      '<div style="position:relative;width:' +
      w +
      "px;height:" +
      h +
      'px;overflow:hidden;">' +
      body +
      "</div>" +
      "</body>" +
      "</html>";

    downloadFile("layoutlab-" + fileStamp() + ".html", "text/html", html);
  }

  function saveLayout() {
    var els = window.AppState.elements;
    var out = [];

    for (var i = 0; i < els.length; i += 1) {
      var m = els[i];
      out.push({
        id: m.id,
        type: m.type,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        styles: m.styles || {},
        zIndex: i + 1,
        text: m.type === "text" || m.type === "button" ? (m.text || "") : undefined,
        src: m.type === "image" ? (m.src || "") : undefined,
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  }

  function scheduleSave() {
    if (saveQueued) return;
    saveQueued = true;
    requestAnimationFrame(function () {
      saveQueued = false;
      saveLayout();
    });
  }

  function clearCanvasElements() {
    var nodes = canvas.querySelectorAll(".ll-element");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].remove();
    }
  }

  function clampModelToCanvas(model) {
    var size = getCanvasSize();
    var w = clamp(Math.round(model.width || MIN_W), MIN_W, Math.max(MIN_W, size.width));
    var h = clamp(Math.round(model.height || MIN_H), MIN_H, Math.max(MIN_H, size.height));
    var maxX = Math.max(0, size.width - w);
    var maxY = Math.max(0, size.height - h);
    model.x = clamp(Math.round(model.x || 0), 0, maxX);
    model.y = clamp(Math.round(model.y || 0), 0, maxY);
    model.width = w;
    model.height = h;
    if (!model.styles || typeof model.styles !== "object") model.styles = {};
    return model;
  }

  function loadLayout() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (!Array.isArray(parsed)) return;

    clearSelection();
    removeResizeHandles();
    window.AppState.elements.length = 0;
    clearCanvasElements();

    var items = parsed.slice().sort(function (a, b) {
      return (a && a.zIndex ? a.zIndex : 0) - (b && b.zIndex ? b.zIndex : 0);
    });

    var maxCounter = window.AppState.counters.element;
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it || !it.id || !it.type) continue;

      var model = {
        id: String(it.id),
        type: it.type === "text" || it.type === "circle" || it.type === "line" || it.type === "image" || it.type === "button" ? it.type : "rect",
        x: Number(it.x) || 0,
        y: Number(it.y) || 0,
        width: Number(it.width) || (it.type === "text" ? 200 : it.type === "circle" ? 120 : it.type === "line" ? 220 : it.type === "image" ? 240 : it.type === "button" ? 160 : 160),
        height: Number(it.height) || (it.type === "text" ? 40 : it.type === "circle" ? 120 : it.type === "line" ? 4 : it.type === "image" ? 160 : it.type === "button" ? 44 : 120),
        styles: it.styles && typeof it.styles === "object" ? it.styles : {},
      };

      if (model.type === "text" || model.type === "button") model.text = typeof it.text === "string" ? it.text : "";
      if (model.type === "image") model.src = typeof it.src === "string" ? it.src : "";
      if (model.type === "line") model.height = 4;
      if (model.type === "circle") {
        var s = Math.max(MIN_W, Math.round(Math.max(model.width, model.height)));
        model.width = s;
        model.height = s;
      }

      clampModelToCanvas(model);
      window.AppState.elements.push(model);
      renderElement(model);

      var m = /^el_(\d+)$/.exec(model.id);
      if (m) {
        var n = Number(m[1]);
        if (isFinite(n)) maxCounter = Math.max(maxCounter, n);
      }
    }

    window.AppState.counters.element = maxCounter;
    applyZIndices();
    renderLayers();
    syncPropertiesPanel();
    syncEmptyState();
  }

  function getLayerLabel(model) {
    if (!model) return "Element";
    if (model.type === "text") return "Text";
    return "Rectangle";
  }

  function renderLayers() {
    if (!layersRoot) return;

    var selectedIds = getSelectedIds();
    var els = window.AppState.elements;
    layersRoot.innerHTML = "";

    for (var i = els.length - 1; i >= 0; i -= 1) {
      var model = els[i];
      var row = document.createElement("div");
      row.className = "layer-item" + (selectedIds.indexOf(model.id) >= 0 ? " is-active" : "");
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
    pushHistory();
    swapElements(i, i + 1);
    applyZIndices();
    renderLayers();
    scheduleSave();
  }

  function moveLayerBackward(id) {
    var i = getElementIndexById(id);
    if (i <= 0) return;
    pushHistory();
    swapElements(i, i - 1);
    applyZIndices();
    renderLayers();
    scheduleSave();
  }

  function toHexColor(v) {
    if (!v) return "";
    if (typeof v !== "string") return "";
    var s = v.trim();
    if (s[0] === "#" && (s.length === 7 || s.length === 4)) return s;
    return "";
  }

  function getSelectedModel() {
    var id = getPrimarySelectedId();
    if (!id) return null;
    return getElementModelById(id);
  }

  function syncPropertiesPanel() {
    if (!propsFieldset) return;

    var ids = getSelectedIds();
    if (ids.length !== 1) {
      propsFieldset.disabled = true;
      if (propWidth) propWidth.value = "";
      if (propHeight) propHeight.value = "";
      if (propBg) propBg.value = "";
      if (propText) propText.value = "";
      if (propTextRow) propTextRow.hidden = true;
      return;
    }

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

    var showText = model.type === "text" || model.type === "button";
    if (propTextRow) propTextRow.hidden = !showText;
    if (showText && propText) propText.value = model.text || "";
    if (!showText && propText) propText.value = "";

    if (propImageRow) propImageRow.hidden = model.type !== "image";
    if (propImage) propImage.value = "";
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

    var size = getCanvasSize();
    var canvasW = size.width;
    var canvasH = size.height;

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
    if (model.type !== "text" && model.type !== "button") return;
    model.text = value;
    var node = canvas.querySelector('[data-element-id="' + model.id + '"]');
    if (node && model.type === "text") node.textContent = value;
    if (node && model.type === "button") {
      var label = node.querySelector(".ll-button__label");
      if (label) label.textContent = value;
    }
  }

  function applyPropertyImage(file) {
    var model = getSelectedModel();
    if (!model) return;
    if (model.type !== "image") return;
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      model.src = String(reader.result || "");
      var node = canvas.querySelector('[data-element-id="' + model.id + '"]');
      if (!node) return;
      var img = node.querySelector("img");
      if (img) img.src = model.src;
      var label = node.querySelector(".ll-image__label");
      if (label) label.style.display = model.src ? "none" : "block";
      scheduleSave();
    };
    reader.readAsDataURL(file);
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

  if (propImage) {
    propImage.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      applyPropertyImage(f);
    });
  }

  function removeResizeHandles() {
    var current = canvas.querySelectorAll(".ll-resize-handle");
    for (var i = 0; i < current.length; i += 1) {
      current[i].remove();
    }
    resize.hostId = null;
  }

  function removeGroupBox() {
    if (groupBox.node) groupBox.node.remove();
    groupBox.node = null;
    groupBox.hostKey = "";
  }

  function getSelectedIds() {
    var ids = window.AppState.ui.selectedIds;
    return Array.isArray(ids) ? ids : [];
  }

  function setSelectedIds(ids) {
    window.AppState.ui.selectedIds = ids;
  }

  function getPrimarySelectedId() {
    var ids = getSelectedIds();
    return ids.length ? ids[ids.length - 1] : null;
  }

  function clearSelection() {
    var ids = getSelectedIds();
    for (var i = 0; i < ids.length; i += 1) {
      var node = canvas.querySelector('[data-element-id="' + ids[i] + '"]');
      if (node) node.classList.remove("is-selected");
    }
    setSelectedIds([]);
    removeResizeHandles();
    removeGroupBox();
  }

  function applySelectionClasses() {
    var ids = getSelectedIds();
    var nodes = canvas.querySelectorAll(".ll-element");
    for (var i = 0; i < nodes.length; i += 1) {
      var id = nodes[i].dataset.elementId;
      if (ids.indexOf(id) >= 0) nodes[i].classList.add("is-selected");
      else nodes[i].classList.remove("is-selected");
    }
  }

  function selectSingle(id) {
    if (!id) {
      clearSelection();
      return;
    }
    setSelectedIds([id]);
    syncSelectionUI();
  }

  function toggleSelect(id) {
    if (!id) return;
    var ids = getSelectedIds().slice();
    var idx = ids.indexOf(id);
    if (idx >= 0) ids.splice(idx, 1);
    else ids.push(id);
    setSelectedIds(ids);
    syncSelectionUI();
  }

  function getSelectionBounds(ids) {
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;

    for (var i = 0; i < ids.length; i += 1) {
      var m = getElementModelById(ids[i]);
      if (!m) continue;
      left = Math.min(left, m.x);
      top = Math.min(top, m.y);
      right = Math.max(right, m.x + m.width);
      bottom = Math.max(bottom, m.y + m.height);
    }

    if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) {
      return null;
    }

    return {
      left: left,
      top: top,
      right: right,
      bottom: bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function ensureGroupBox() {
    if (groupBox.node) return groupBox.node;
    var node = document.createElement("div");
    node.className = "ll-group-box";
    var dirs = ["tl", "tr", "bl", "br"];
    for (var i = 0; i < dirs.length; i += 1) {
      var h = document.createElement("div");
      h.className = "ll-group-handle";
      h.dataset.dir = dirs[i];
      node.appendChild(h);
    }
    canvas.appendChild(node);
    groupBox.node = node;
    return node;
  }

  function syncGroupBox() {
    var ids = getSelectedIds();
    if (ids.length <= 1) {
      removeGroupBox();
      return;
    }

    var b = getSelectionBounds(ids);
    if (!b) {
      removeGroupBox();
      return;
    }

    var key = ids.slice().sort().join("|") + "@" + [b.left, b.top, b.width, b.height].join(",");
    var node = ensureGroupBox();
    if (groupBox.hostKey !== key) groupBox.hostKey = key;
    node.style.left = toPx(b.left);
    node.style.top = toPx(b.top);
    node.style.width = toPx(b.width);
    node.style.height = toPx(b.height);
  }

  function syncResizeHandles() {
    var ids = getSelectedIds();
    if (ids.length !== 1) {
      if (resize.hostId) removeResizeHandles();
      syncGroupBox();
      return;
    }

    var id = ids[0];
    if (!id) {
      if (resize.hostId) removeResizeHandles();
      return;
    }

    syncGroupBox();
    if (resize.hostId === id) return;
    if (resize.hostId) removeResizeHandles();

    var node = canvas.querySelector('[data-element-id="' + id + '"]');
    if (!node) return;
    addResizeHandles(node, id);
  }

  function syncSelectionUI() {
    applySelectionClasses();
    syncResizeHandles();
    renderLayers();
    syncPropertiesPanel();
  }

  function duplicatePrimary() {
    var id = getPrimarySelectedId();
    if (!id) return;

    var model = getElementModelById(id);
    if (!model) return;

    pushHistory();

    var copy = JSON.parse(JSON.stringify(model));
    copy.id = nextElementId();
    copy.x = (copy.x || 0) + 12;
    copy.y = (copy.y || 0) + 12;
    if (!copy.styles || typeof copy.styles !== "object") copy.styles = {};
    clampModelToCanvas(copy);

    var idx = getElementIndexById(id);
    if (idx < 0) idx = window.AppState.elements.length - 1;
    window.AppState.elements.splice(idx + 1, 0, copy);
    renderElement(copy);
    applyZIndices();
    selectSingle(copy.id);
    scheduleSave();
  }

  function moveGroupResize(e) {
    var ids = getSelectedIds();
    if (ids.length <= 1) return;
    if (!resize.items || !resize.items.length) return;

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

    if (isSnapEnabled()) {
      if (resize.dir === "tl" || resize.dir === "bl") left = snapValue(left);
      if (resize.dir === "tr" || resize.dir === "br") right = snapValue(right);
      if (resize.dir === "tl" || resize.dir === "tr") top = snapValue(top);
      if (resize.dir === "bl" || resize.dir === "br") bottom = snapValue(bottom);
    }

    var startW = resize.startRight - resize.startLeft;
    var startH = resize.startBottom - resize.startTop;
    if (startW <= 0 || startH <= 0) return;

    if (right - left < MIN_W) {
      if (resize.dir === "tl" || resize.dir === "bl") left = right - MIN_W;
      else right = left + MIN_W;
    }

    if (bottom - top < MIN_H) {
      if (resize.dir === "tl" || resize.dir === "tr") top = bottom - MIN_H;
      else bottom = top + MIN_H;
    }

    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (right > canvasW) right = canvasW;
    if (bottom > canvasH) bottom = canvasH;

    if (model0.type === "line") {
      top = clamp(top, 0, canvasH);
      bottom = clamp(top + 4, 0, canvasH);
    }

    if (right - left < MIN_W) {
      if (resize.dir === "tl" || resize.dir === "bl") left = Math.max(0, right - MIN_W);
      else right = Math.min(canvasW, left + MIN_W);
    }

    if (bottom - top < MIN_H) {
      if (resize.dir === "tl" || resize.dir === "tr") top = Math.max(0, bottom - MIN_H);
      else bottom = Math.min(canvasH, top + MIN_H);
    }

    var newW = right - left;
    var newH = bottom - top;
    var sx = newW / startW;
    var sy = newH / startH;

    for (var i = 0; i < resize.items.length; i += 1) {
      var it = resize.items[i];
      var relX = (it.x - resize.startLeft) / startW;
      var relY = (it.y - resize.startTop) / startH;
      var nextX = left + relX * newW;
      var nextY = top + relY * newH;
      var nextW = it.w * sx;
      var nextH = it.h * sy;

      nextW = Math.max(MIN_W, nextW);
      nextH = Math.max(MIN_H, nextH);

      setElementPosition(it.id, nextX, nextY);
      var node = canvas.querySelector('[data-element-id="' + it.id + '"]');
      if (node) {
        node.style.width = toPx(nextW);
        node.style.height = toPx(nextH);
      }

      var m = getElementModelById(it.id);
      if (m) {
        m.width = nextW;
        m.height = nextH;
      }
    }

    syncGroupBox();
    e.preventDefault();
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

  function startResize(e, id, dir) {
    var model = getElementModelById(id);
    if (!model) return;

    pushHistory();

    resize.mode = "single";

    var p = getPointerInCanvas(e);
    resize.active = true;
    resize.pointerId = e.pointerId;
    resize.id = id;
    resize.dir = dir;
    resize.model = model;
    resize.node = canvas.querySelector('[data-element-id="' + id + '"]');
    resize.startX = p.x;
    resize.startY = p.y;
    resize.startLeft = model.x;
    resize.startTop = model.y;
    resize.startRight = model.x + model.width;
    resize.startBottom = model.y + model.height;

    if (resize.node) resize.node.setPointerCapture(e.pointerId);
    document.body.classList.add("is-dragging");
    e.preventDefault();
  }

  function moveResize(e) {
    if (!resize.active) return;
    if (e.pointerId !== resize.pointerId) return;

    if (resize.mode === "group") {
      moveGroupResize(e);
      return;
    }

    var p = getPointerInCanvas(e);
    var dx = p.x - resize.startX;
    var dy = p.y - resize.startY;
    var canvasW = p.rect.width;
    var canvasH = p.rect.height;

    var model0 = resize.model || getElementModelById(resize.id);
    if (!model0) return;

    var left = resize.startLeft;
    var top = resize.startTop;
    var right = resize.startRight;
    var bottom = resize.startBottom;

    if (resize.dir === "tl" || resize.dir === "bl") left = resize.startLeft + dx;
    if (resize.dir === "tr" || resize.dir === "br") right = resize.startRight + dx;
    if (resize.dir === "tl" || resize.dir === "tr") top = resize.startTop + dy;
    if (resize.dir === "bl" || resize.dir === "br") bottom = resize.startBottom + dy;

    if (isSnapEnabled()) {
      if (resize.dir === "tl" || resize.dir === "bl") left = snapValue(left);
      if (resize.dir === "tr" || resize.dir === "br") right = snapValue(right);
      if (resize.dir === "tl" || resize.dir === "tr") top = snapValue(top);
      if (resize.dir === "bl" || resize.dir === "br") bottom = snapValue(bottom);
    }

    if (model0.type === "line") {
      top = resize.startTop;
      bottom = resize.startTop + 4;
    }

    if (model0.type === "circle") {
      var w0 = right - left;
      var h0 = bottom - top;
      var s0 = Math.max(MIN_W, MIN_H, Math.round(Math.max(w0, h0)));
      if (resize.dir === "tl") {
        left = right - s0;
        top = bottom - s0;
      }
      if (resize.dir === "tr") {
        right = left + s0;
        top = bottom - s0;
      }
      if (resize.dir === "bl") {
        left = right - s0;
        bottom = top + s0;
      }
      if (resize.dir === "br") {
        right = left + s0;
        bottom = top + s0;
      }
    }

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
    var node = resize.node;
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

    if (resize.id) {
      var node = canvas.querySelector('[data-element-id="' + resize.id + '"]');
      if (node && node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    }
    resize.active = false;
    resize.pointerId = null;
    resize.id = null;
    resize.dir = null;
    resize.mode = "single";
    resize.items = null;
    resize.node = null;
    resize.model = null;
    document.body.classList.remove("is-dragging");
    scheduleSave();
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

    pushHistory();

    var ids = getSelectedIds();
    if (ids.length > 1) {
      var p = getPointerInCanvas(e);
      drag.active = true;
      drag.pointerId = e.pointerId;
      drag.id = null;
      drag.node = null;
      drag.model = null;
      drag.startX = p.x;
      drag.startY = p.y;
      drag.items = [];

      for (var i = 0; i < ids.length; i += 1) {
        var m = getElementModelById(ids[i]);
        if (!m) continue;
        var n = canvas.querySelector('[data-element-id="' + m.id + '"]');
        drag.items.push({ id: m.id, x: m.x, y: m.y, w: m.width, h: m.height, node: n, model: m });
      }

      var node = getCurrentDragNode();
      if (node) node.setPointerCapture(e.pointerId);
      canvas.setPointerCapture(e.pointerId);
      document.body.classList.add("is-dragging");
      e.preventDefault();
      return;
    }

    var p = getPointerInCanvas(e);
    drag.active = true;
    drag.pointerId = e.pointerId;
    drag.id = id;
    drag.node = canvas.querySelector('[data-element-id="' + id + '"]');
    drag.model = model;
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

    if (drag.items && drag.items.length) {
      var p = getPointerInCanvas(e);
      var rect = p.rect;
      var dx = p.x - drag.startX;
      var dy = p.y - drag.startY;

      var left = Infinity;
      var top = Infinity;
      var right = -Infinity;
      var bottom = -Infinity;

      for (var i = 0; i < drag.items.length; i += 1) {
        var it = drag.items[i];
        left = Math.min(left, it.x);
        top = Math.min(top, it.y);
        right = Math.max(right, it.x + it.w);
        bottom = Math.max(bottom, it.y + it.h);
      }

      var maxDx = rect.width - right;
      var minDx = -left;
      var maxDy = rect.height - bottom;
      var minDy = -top;

      dx = clamp(dx, minDx, maxDx);
      dy = clamp(dy, minDy, maxDy);

      if (isSnapEnabled()) {
        var snappedLeft = snapValue(left + dx);
        var snappedTop = snapValue(top + dy);
        dx = clamp(snappedLeft - left, minDx, maxDx);
        dy = clamp(snappedTop - top, minDy, maxDy);
      }

      for (var j = 0; j < drag.items.length; j += 1) {
        var it2 = drag.items[j];
        setElementPositionFast(it2.node, it2.model, it2.x + dx, it2.y + dy);
      }

      syncGroupBox();
      e.preventDefault();
      return;
    }

    var model = drag.model || getElementModelById(drag.id);
    if (!model) return;

    var p = getPointerInCanvas(e);
    var canvasW = p.rect.width;
    var canvasH = p.rect.height;
    var maxX = Math.max(0, canvasW - model.width);
    var maxY = Math.max(0, canvasH - model.height);

    var nextX = clamp(p.x - drag.offsetX, 0, maxX);
    var nextY = clamp(p.y - drag.offsetY, 0, maxY);

    if (isSnapEnabled()) {
      nextX = clamp(snapValue(nextX), 0, maxX);
      nextY = clamp(snapValue(nextY), 0, maxY);
    }

    setElementPositionFast(drag.node, model, nextX, nextY);
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
    drag.items = null;
    drag.node = null;
    drag.model = null;
    document.body.classList.remove("is-dragging");
    scheduleSave();
    e.preventDefault();
  }

  function selectById(id, additive) {
    if (!id) {
      clearSelection();
      syncSelectionUI();
      return;
    }

    if (additive) {
      toggleSelect(id);
      return;
    }

    selectSingle(id);
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

    if (model.type === "circle") {
      node.classList.add("ll-circle");
    }

    if (model.type === "line") {
      node.classList.add("ll-line");
      node.style.height = toPx(4);
    }

    if (model.type === "image") {
      node.classList.add("ll-image");
      var img = document.createElement("img");
      img.draggable = false;
      img.alt = "";
      img.src = model.src || "";
      var label = document.createElement("div");
      label.className = "ll-image__label";
      label.textContent = "Image";
      if (model.src) label.style.display = "none";
      node.appendChild(img);
      node.appendChild(label);
    }

    if (model.type === "button") {
      node.classList.add("ll-button");
      var btnLabel = document.createElement("div");
      btnLabel.className = "ll-button__label";
      btnLabel.textContent = model.text || "Button";
      node.appendChild(btnLabel);
    }

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

  function isGuideOpen() {
    return !!(guideRoot && guideRoot.classList.contains("is-open"));
  }

  function openGuide() {
    if (!guideRoot) return;
    guideRoot.classList.add("is-open");
    guideRoot.setAttribute("aria-hidden", "false");
  }

  function closeGuide() {
    if (!guideRoot) return;
    guideRoot.classList.remove("is-open");
    guideRoot.setAttribute("aria-hidden", "true");
  }

  function isWelcomeOpen() {
    return !!(welcomeRoot && welcomeRoot.classList.contains("is-open"));
  }

  function openWelcome() {
    if (!welcomeRoot) return;
    welcomeRoot.classList.add("is-open");
    welcomeRoot.setAttribute("aria-hidden", "false");
  }

  function closeWelcome() {
    if (!welcomeRoot) return;
    welcomeRoot.classList.remove("is-open");
    welcomeRoot.setAttribute("aria-hidden", "true");
    localStorage.setItem("layoutlab.welcome.seen", "1");
  }

  function syncEmptyState() {
    if (!emptyState) return;
    var empty = !window.AppState.elements || window.AppState.elements.length === 0;
    emptyState.setAttribute("aria-hidden", empty ? "false" : "true");
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
    syncSelectionUI();
    scheduleSave();
    syncEmptyState();
  }

  function moveSelectedBy(dx, dy) {
    var ids = getSelectedIds();
    if (!ids.length) return;

    pushHistory();

    var size = getCanvasSize();
    var bounds = getSelectionBounds(ids);
    if (!bounds) return;
    var minDx = -bounds.left;
    var maxDx = size.width - bounds.right;
    var minDy = -bounds.top;
    var maxDy = size.height - bounds.bottom;
    dx = clamp(dx, minDx, maxDx);
    dy = clamp(dy, minDy, maxDy);

    for (var i = 0; i < ids.length; i += 1) {
      var m = getElementModelById(ids[i]);
      if (!m) continue;
      setElementPosition(m.id, m.x + dx, m.y + dy);
    }

    syncSelectionUI();
  }

  document.addEventListener("keydown", function (e) {
    if (isTextEditingTarget(e.target)) return;

    if (e.key === "Escape") {
      if (isWelcomeOpen()) {
        closeWelcome();
        e.preventDefault();
        return;
      }
      if (isGuideOpen()) {
        closeGuide();
        e.preventDefault();
        return;
      }
    }

    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "+" || e.key === "=")) {
      setZoom(getZoom() + 0.1);
      e.preventDefault();
      return;
    }

    if (mod && e.key === "-") {
      setZoom(getZoom() - 0.1);
      e.preventDefault();
      return;
    }

    if (mod && e.key === "0") {
      setZoom(1);
      e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      if (e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }

    if (mod && e.key.toLowerCase() === "y") {
      redo();
      e.preventDefault();
      return;
    }

    var ids = getSelectedIds();
    if (!ids.length) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      pushHistory();
      var toRemove = getSelectedIds().slice();
      clearSelection();
      for (var i = 0; i < toRemove.length; i += 1) {
        removeElementById(toRemove[i]);
      }
      e.preventDefault();
      return;
    }

    var modD = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d";
    if (modD) {
      duplicatePrimary();
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
      selectById(id, false);
      e.preventDefault();
    });
  }

  canvas.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(".ll-element");
    if (!el) return;
    var id = el.dataset.elementId;
    var ids = getSelectedIds();
    if (ids.indexOf(id) < 0) return;
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
    selectById(id, e.shiftKey);
  });

  canvas.addEventListener(
    "pointerdown",
    function (e) {
      var handle = e.target.closest(".ll-resize-handle");
      if (!handle) return;

      var el = handle.closest(".ll-element");
      if (!el) return;

      var id = el.dataset.elementId;
      var ids = getSelectedIds();
      if (ids.length !== 1 || ids[0] !== id) return;

      var dir = handle.dataset.dir;
      if (!dir) return;

      e.stopPropagation();
      startResize(e, id, dir);
    },
    true
  );

  canvas.addEventListener(
    "pointerdown",
    function (e) {
      var handle = e.target.closest(".ll-group-handle");
      if (!handle) return;
      var ids = getSelectedIds();
      if (ids.length <= 1) return;

      var dir = handle.dataset.dir;
      if (!dir) return;

      pushHistory();
      resize.mode = "group";

      var p = getPointerInCanvas(e);
      resize.active = true;
      resize.pointerId = e.pointerId;
      resize.id = null;
      resize.dir = dir;
      resize.startX = p.x;
      resize.startY = p.y;

      var b = getSelectionBounds(ids);
      if (!b) return;
      resize.startLeft = b.left;
      resize.startTop = b.top;
      resize.startRight = b.right;
      resize.startBottom = b.bottom;

      resize.items = [];
      for (var i = 0; i < ids.length; i += 1) {
        var m = getElementModelById(ids[i]);
        if (!m) continue;
        resize.items.push({
          id: m.id,
          x: m.x,
          y: m.y,
          w: m.width,
          h: m.height,
        });
      }

      canvas.setPointerCapture(e.pointerId);
      document.body.classList.add("is-dragging");
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  canvas.addEventListener("pointermove", moveResize);
  canvas.addEventListener("pointerup", endResize);
  canvas.addEventListener("pointercancel", endResize);

  canvas.addEventListener("pointerdown", function () {
    syncResizeHandles();
    syncSelectionUI();
  });

  function addElement(type) {
    pushHistory();
    var id = nextElementId();

    var element = {
      id: id,
      type: type,
      x: 24,
      y: 24,
      width: type === "text" ? 200 : type === "circle" ? 120 : type === "line" ? 220 : type === "image" ? 240 : type === "button" ? 160 : 160,
      height: type === "text" ? 40 : type === "circle" ? 120 : type === "line" ? 4 : type === "image" ? 160 : type === "button" ? 44 : 120,
      styles: {},
    };

    if (type === "rect") {
      element.styles = {
        backgroundColor: "#4f46e5",
        borderRadius: "6px",
      };
    }

    if (type === "circle") {
      element.styles = {
        backgroundColor: "#4f46e5",
        borderRadius: "50%",
      };
    }

    if (type === "line") {
      element.styles = {
        backgroundColor: "rgba(243,244,246,0.9)",
        borderRadius: "999px",
      };
    }

    if (type === "image") {
      element.src = "";
      element.styles = {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: "12px",
      };
    }

    if (type === "button") {
      element.text = "Button";
      element.styles = {
        backgroundColor: "#22c55e",
        borderRadius: "12px",
        color: "#0b0b0c",
        fontWeight: "700",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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

    if (type === "line") {
      element.height = 4;
    }

    window.AppState.elements.push(element);
    renderElement(element);
    applyZIndices();
    selectSingle(id);
    scheduleSave();
    syncEmptyState();
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

  if (circleBtn) {
    circleBtn.addEventListener("click", function () {
      addElement("circle");
    });
  }

  if (lineBtn) {
    lineBtn.addEventListener("click", function () {
      addElement("line");
    });
  }

  if (imageBtn) {
    imageBtn.addEventListener("click", function () {
      addElement("image");
    });
  }

  if (buttonBtn) {
    buttonBtn.addEventListener("click", function () {
      addElement("button");
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", function () {
      exportJson();
    });
  }

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener("click", function () {
      exportHtml();
    });
  }

  function alignSelection(mode) {
    var ids = getSelectedIds();
    if (!ids.length) return;
    var b = getSelectionBounds(ids);
    if (!b) return;

    pushHistory();

    for (var i = 0; i < ids.length; i += 1) {
      var m = getElementModelById(ids[i]);
      if (!m) continue;

      var x = m.x;
      var y = m.y;

      if (mode === "left") x = b.left;
      if (mode === "center") x = b.left + (b.width - m.width) / 2;
      if (mode === "right") x = b.right - m.width;
      if (mode === "top") y = b.top;
      if (mode === "middle") y = b.top + (b.height - m.height) / 2;
      if (mode === "bottom") y = b.bottom - m.height;

      setElementPosition(m.id, x, y);
    }

    syncSelectionUI();
    scheduleSave();
  }

  if (snapToggleBtn) {
    snapToggleBtn.addEventListener("click", function () {
      editorSettings.snapEnabled = !editorSettings.snapEnabled;
      syncSettingsToState();
      syncSnapControls();
    });
  }

  if (gridSizeInput) {
    gridSizeInput.addEventListener("change", function (e) {
      var n = Number(e.target.value);
      if (!isFinite(n)) return;
      editorSettings.gridSize = Math.max(1, Math.round(n));
      syncSettingsToState();
      syncSnapControls();
    });
  }

  if (alignLeftBtn) alignLeftBtn.addEventListener("click", function () { alignSelection("left"); });
  if (alignCenterBtn) alignCenterBtn.addEventListener("click", function () { alignSelection("center"); });
  if (alignRightBtn) alignRightBtn.addEventListener("click", function () { alignSelection("right"); });
  if (alignTopBtn) alignTopBtn.addEventListener("click", function () { alignSelection("top"); });
  if (alignMiddleBtn) alignMiddleBtn.addEventListener("click", function () { alignSelection("middle"); });
  if (alignBottomBtn) alignBottomBtn.addEventListener("click", function () { alignSelection("bottom"); });

  if (zoomOutBtn) zoomOutBtn.addEventListener("click", function () { setZoom(getZoom() - 0.1); });
  if (zoomInBtn) zoomInBtn.addEventListener("click", function () { setZoom(getZoom() + 0.1); });
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", function () { setZoom(1); });

  if (openGuideBtn) openGuideBtn.addEventListener("click", function () { openGuide(); });
  if (closeGuideBtn) closeGuideBtn.addEventListener("click", function () { closeGuide(); });
  if (guideRoot) {
    guideRoot.addEventListener("pointerdown", function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-guide-close")) closeGuide();
    });
  }

  if (startDesigningBtn) startDesigningBtn.addEventListener("click", function () { closeWelcome(); });
  if (welcomeRoot) {
    welcomeRoot.addEventListener("pointerdown", function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-welcome-close")) closeWelcome();
    });
  }

  applyZIndices();
  renderLayers();
  syncPropertiesPanel();
  loadLayout();
  syncSnapControls();
  setZoom(getZoom());
  syncEmptyState();

  if (welcomeRoot) {
    var seen = localStorage.getItem("layoutlab.welcome.seen");
    if (!seen) openWelcome();
  }
});
