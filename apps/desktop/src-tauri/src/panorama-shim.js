// Studio is Panorama's shell. Panorama's page looks for a desktop shell through
// `__TAURI__.core.invoke` and `__TAURI__.event.listen` (its `shellBridge()`) and
// decides it is in one when `__TAURI_INTERNALS__` exists (its `inDesktopShell()`).
// This defines both. Every command travels to the tab that hosts this frame by
// postMessage and comes back the same way; nothing here reaches Tauri directly.
(function () {
  if (window.__TAURI__ && window.__TAURI__.core) return;
  var pending = new Map();
  var counter = 0;
  function invoke(cmd, args) {
    return new Promise(function (resolve, reject) {
      var id = ++counter;
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ panoramaShell: 1, id: id, cmd: String(cmd), args: args === undefined ? null : args }, "*");
    });
  }
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.panoramaShellReply !== 1) return;
    var slot = pending.get(data.id);
    if (!slot) return;
    pending.delete(data.id);
    if (data.ok) slot.resolve(data.result);
    else slot.reject(new Error(typeof data.error === "string" ? data.error : "The shell could not answer."));
  });
  var callbacks = new Map();
  function transformCallback(fn) {
    var id = ++counter;
    callbacks.set(id, fn);
    return id;
  }
  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: transformCallback,
    unregisterCallback: function (id) { callbacks.delete(id); },
    convertFileSrc: function (path) { return path; },
    metadata: { currentWindow: { label: "panorama" }, currentWebview: { label: "panorama" } },
    plugins: { path: { sep: "/", delimiter: ":" } },
  };
  window.__TAURI__ = {
    core: { invoke: invoke, transformCallback: transformCallback, convertFileSrc: function (path) { return path; } },
    event: {
      // No shell events flow into the page: an unlisten that does nothing.
      listen: function () { return Promise.resolve(function () {}); },
      once: function () { return Promise.resolve(function () {}); },
      emit: function () { return Promise.resolve(); },
    },
  };

  // Zoom. Panorama zooms its canvas on ctrl/⌘ + wheel, which is how Chromium
  // reports a trackpad pinch. WebKit reports a pinch as gesture events instead,
  // and the shell's webview does nothing with them — so here they become the
  // wheel events Panorama understands, scaled to its own zoom curve
  // (factor = exp(-pixelsY * 0.0025)). ⌘/Ctrl with =, + or - zooms in steps,
  // typed here or in the tab around the frame.
  var ZOOM_SENSITIVITY = 0.0025;
  var ZOOM_STEP = 1.2;
  function zoomWheel(x, y, factor) {
    var target = document.elementFromPoint(x, y) || document.body;
    var deltaY = -Math.log(factor) / ZOOM_SENSITIVITY;
    target.dispatchEvent(new WheelEvent("wheel", { deltaX: 0, deltaY: deltaY, deltaMode: 0, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }
  function zoomStep(step) {
    zoomWheel(window.innerWidth / 2, window.innerHeight / 2, Math.pow(ZOOM_STEP, step));
  }
  function zoomStepFromKey(e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return 0;
    if (e.key === "=" || e.key === "+") return 1;
    if (e.key === "-" || e.key === "_") return -1;
    return 0;
  }
  var lastScale = 1;
  window.addEventListener("gesturestart", function (e) { lastScale = 1; e.preventDefault(); }, { passive: false });
  window.addEventListener("gesturechange", function (e) {
    e.preventDefault();
    var scale = e.scale || 1;
    var ratio = scale / lastScale;
    lastScale = scale;
    if (ratio > 0 && ratio !== 1) zoomWheel(e.clientX, e.clientY, ratio);
  }, { passive: false });
  window.addEventListener("gestureend", function (e) { e.preventDefault(); }, { passive: false });
  window.addEventListener("keydown", function (e) {
    var step = zoomStepFromKey(e);
    if (!step) return;
    e.preventDefault();
    zoomStep(step);
  });
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (data && data.panoramaShellZoom === 1 && (data.step === 1 || data.step === -1)) zoomStep(data.step);
  });
})();
