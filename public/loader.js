(() => {
  const monaco = "https://cdn.jsdelivr.net/npm/monaco-editor@0.33.0";

  requirejs.config({
    urlArgs: (_, url) => url.startsWith(monaco) || url.includes("-")
      ? ""
      : "?v={{version}}",
    paths: {
      vs: `${monaco}/min/vs`,
    },
  });

  window.MonacoEnvironment = {
    getWorkerUrl: (_workerId, _label) =>
      `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = {
        baseUrl: "${monaco}/min/"
      };
      importScripts("${monaco}/min/vs/base/worker/workerMain.js");
    `)}`,
  };

  require(["./index"], main => main());
})();
