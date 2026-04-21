(async function () {
  "use strict";

  try {
    if (window.StudyData && typeof window.StudyData.load === "function") {
      await window.StudyData.load();
    } else if (window.__studyDataReady && typeof window.__studyDataReady.then === "function") {
      await window.__studyDataReady;
    }
  } catch (error) {
    console.error("[app-init] falha ao aguardar dados do app:", error);
  }

  if (typeof window.bootStudyApp === "function") {
    window.bootStudyApp();
  } else {
    console.error("[app-init] bootStudyApp nao encontrado");
  }

  if (window.TickerTape && typeof window.TickerTape.init === "function") {
    window.TickerTape.init();
  }

  if ("serviceWorker" in navigator && /^https?:/i.test(window.location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("[pwa] falha ao registrar service worker:", error);
      });
    });
  }
})();
