(function () {
  "use strict";

  if (typeof window.bootStudyApp === "function") {
    window.bootStudyApp();
  } else {
    console.error("[app-init] bootStudyApp nao encontrado");
  }
})();
