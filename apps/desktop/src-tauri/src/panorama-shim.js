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
})();
