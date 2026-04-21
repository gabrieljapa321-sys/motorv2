(function () {
  function attachFirebaseSync() {
    const appReady =
      window.StudySync &&
      typeof saveState === "function" &&
      typeof hydrateStateFromRaw === "function" &&
      typeof render === "function";

    if (!appReady) {
      console.error("[firebase-sync] dependencias do app nao encontradas");
      return;
    }

    const originalSaveState = saveState;

    saveState = function () {
      originalSaveState();
      window.StudySync.scheduleCloudWrite("auto-save");
    };

    window.StudySync.attachApp({
      getState: () => state,
      setState: (nextState) => {
        if (window.StudyApp && typeof window.StudyApp.replaceState === "function") {
          window.StudyApp.replaceState(nextState, "cloud-sync");
        } else {
          state = nextState;
        }
      },
      hydrateStateFromRaw,
      getStateSummary,
      mergeStates: (localState, incomingState) => mergeImportedState(localState, incomingState),
      saveLocal: () => originalSaveState(),
      render,
      showToast
    });
  }

  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(attachFirebaseSync);
  } else {
    setTimeout(attachFirebaseSync, 0);
  }
})();
