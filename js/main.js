document.addEventListener("DOMContentLoaded", function () {
  var canvas = document.getElementById("canvas");
  var rectBtn = document.getElementById("create-rect");
  var textBtn = document.getElementById("create-text");

  if (!canvas) return;

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
    if (!el) {
      if (e.target === canvas) clearSelection();
      return;
    }

    var id = el.dataset.elementId;
    selectById(id);
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
