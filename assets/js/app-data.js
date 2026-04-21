(function () {
  "use strict";

  const DATA_PATH = "assets/data/study-data.json";
  const CONFIG_PATH = "assets/data/ui-config.json";
  const EXERCISES_PATH = "assets/data/exercises.json";

  const dataRef = { profile: {}, subjects: [], tasks: [] };
  const configRef = { pageMeta: {}, modes: {}, calendar: {}, grades: {}, notes: {}, news: {}, week: {} };
  const exercisesRef = [];
  const exerciseCatalogRef = { exercises: exercisesRef };

  function replaceObject(target, source) {
    Object.keys(target).forEach((key) => {
      delete target[key];
    });
    if (!source || typeof source !== "object") return target;
    Object.entries(source).forEach(([key, value]) => {
      target[key] = value;
    });
    return target;
  }

  function replaceArray(target, source) {
    target.splice(0, target.length, ...(Array.isArray(source) ? source : []));
    return target;
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar ${path} (${response.status || "sem status"})`);
    }
    return response.json();
  }

  const studyDataStore = {
    data: dataRef,
    config: configRef,
    exercises: exercisesRef,
    exerciseCatalog: exerciseCatalogRef,
    status: "loading",
    error: null,
    load: null,
    ready: null
  };

  async function loadStudyData() {
    try {
      const [data, config, exercisesPayload] = await Promise.all([
        loadJson(DATA_PATH),
        loadJson(CONFIG_PATH),
        loadJson(EXERCISES_PATH)
      ]);
      const normalizedExercises = Array.isArray(exercisesPayload && exercisesPayload.exercises)
        ? exercisesPayload.exercises
        : [];

      replaceObject(dataRef, data);
      replaceObject(configRef, config);
      replaceObject(exerciseCatalogRef, exercisesPayload && typeof exercisesPayload === "object" ? exercisesPayload : {});
      replaceArray(exercisesRef, normalizedExercises);
      exerciseCatalogRef.exercises = exercisesRef;

      studyDataStore.status = "ready";
      studyDataStore.error = null;
      delete window.__studyDataLoadError;
      return studyDataStore;
    } catch (error) {
      console.error("[app-data] erro ao carregar JSON externo:", error);
      studyDataStore.status = "error";
      studyDataStore.error = error;
      window.__studyDataLoadError = error;
      return studyDataStore;
    }
  }

  studyDataStore.ready = loadStudyData();
  studyDataStore.load = () => studyDataStore.ready;

  window.StudyData = studyDataStore;
  window.__studyDataReady = studyDataStore.ready;
  globalThis.DATA = dataRef;
  globalThis.APP_CONFIG = configRef;
  globalThis.EXERCISES = exercisesRef;
})();
