(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     SUBJECT API · v1 (P3b)
     ─────────────────────────────────────────────────────────────────
     API publica e read-only sobre disciplinas, montada por cima dos
     dados existentes (DATA.subjects, state.gradeEntries, state.deadlines,
     state.examSimulations, state.weeklyTodos) e do globalmente exposto
     window.getNextExam.

     Sem dependencia em grades-page.js — calculo de media simples ou
     ponderada por entryWeight quando presente, com status derivado.

     window.SubjectAPI:
       getSubject(idOrCode)
       listSubjects()
       getStatus(subject, ref?)        -> { average, projected, level, ... }
       getAgenda(subject, ref?, days?) -> [{ kind, iso, title, ... }]
       getStudyLog(subject, days?)     -> [{ kind, iso, summary }]
       getStatusLevel(avg, target?)    -> "ok"|"tight"|"critical"|"unknown"
     ═══════════════════════════════════════════════════════════════════ */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toIso(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return null;
    const p = String(iso).slice(0, 10).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function diffDaysIso(a, b) {
    const da = parseIso(a); const db = parseIso(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

  function getSubjects() {
    try {
      if (window.DATA && Array.isArray(window.DATA.subjects)) return window.DATA.subjects;
    } catch (e) {}
    return [];
  }

  function getGradeEntries() {
    try {
      if (window.state && Array.isArray(window.state.gradeEntries)) return window.state.gradeEntries;
    } catch (e) {}
    return [];
  }

  function getDeadlines() {
    try {
      if (window.state && Array.isArray(window.state.deadlines)) return window.state.deadlines;
    } catch (e) {}
    return [];
  }

  function getExamSimulations() {
    try {
      if (window.state && Array.isArray(window.state.examSimulations)) return window.state.examSimulations;
    } catch (e) {}
    return [];
  }

  function getWeeklyTodos() {
    try {
      if (window.state && Array.isArray(window.state.weeklyTodos)) return window.state.weeklyTodos;
    } catch (e) {}
    return [];
  }

  /* ─────────────── Lookup ─────────────── */

  function getSubject(idOrCode) {
    if (!idOrCode) return null;
    const key = String(idOrCode);
    const subjects = getSubjects();
    return subjects.find((s) => s.id === key)
        || subjects.find((s) => s.code === key)
        || subjects.find((s) => (s.shortName || "") === key)
        || null;
  }

  function listSubjects() {
    return getSubjects().slice();
  }

  function subjectKey(subject) {
    if (!subject) return null;
    return subject.id || subject.code || subject.shortName || subject.name || null;
  }

  /* ─────────────── Cálculo de média (independente) ─────────────── */

  function entriesForSubject(subject) {
    const key = subjectKey(subject);
    if (!key) return [];
    return getGradeEntries().filter((e) => {
      if (!e || typeof e !== "object") return false;
      return e.subjectCode === key || e.subjectCode === subject.code || e.subjectCode === subject.id;
    });
  }

  // Média ponderada: usa entry.weight quando presente, senão peso 1.
  // Resultado em escala 0-10 (assume scores 0-10).
  function computeWeightedAverage(entries) {
    if (!entries || !entries.length) return null;
    let sumW = 0;
    let sumScoreW = 0;
    entries.forEach((e) => {
      const score = Number(e.score);
      if (!Number.isFinite(score)) return;
      const w = Number.isFinite(Number(e.weight)) && Number(e.weight) > 0 ? Number(e.weight) : 1;
      sumScoreW += score * w;
      sumW += w;
    });
    if (sumW <= 0) return null;
    return sumScoreW / sumW;
  }

  function getStatusLevel(avg, target) {
    const t = Number.isFinite(Number(target)) ? Number(target) : 5;
    if (avg == null) return "unknown";
    if (avg >= t + 1) return "ok";
    if (avg >= t)     return "tight";
    return "critical";
  }

  function statusLabel(level) {
    if (level === "ok")       return "em dia";
    if (level === "tight")    return "apertado";
    if (level === "critical") return "crítico";
    return "sem nota";
  }

  /* ─────────────── Status agregado ─────────────── */

  function getStatus(subject, refDate) {
    const ref = refDate instanceof Date ? refDate : new Date();
    const entries = entriesForSubject(subject);
    const avg = computeWeightedAverage(entries);
    const target = (window.state && window.state.gradeTargets && Number(window.state.gradeTargets.primary)) || 5;
    const level = getStatusLevel(avg, target);

    let nextExam = null;
    if (typeof window.getNextExam === "function") {
      try { nextExam = window.getNextExam(subject, ref); }
      catch (e) { nextExam = null; }
    }
    const refIso = toIso(ref);
    const nextExamIso = nextExam && nextExam.examDate ? String(nextExam.examDate).slice(0, 10) : null;
    const daysToExam = nextExamIso ? diffDaysIso(refIso, nextExamIso) : null;

    return {
      subject,
      entriesCount: entries.length,
      average: avg,
      averageDisplay: avg == null ? "—" : avg.toFixed(1),
      target,
      level,
      levelLabel: statusLabel(level),
      nextExam,
      nextExamIso,
      daysToExam
    };
  }

  /* ─────────────── Agenda da disciplina ─────────────── */

  function getAgenda(subject, refDate, days) {
    const ref = refDate instanceof Date ? refDate : new Date();
    const horizon = Number.isFinite(days) ? Math.max(1, days) : 21;
    const refIso = toIso(ref);
    const horizonDate = new Date(ref);
    horizonDate.setDate(horizonDate.getDate() + horizon);
    const horizonIso = toIso(horizonDate);

    const events = [];
    const key = subjectKey(subject);

    // Entregas do state.deadlines
    getDeadlines().forEach((d) => {
      if (!d || d.done || !d.date) return;
      // o campo subject das deadlines pode ser id, code, ou shortName
      if (d.subject && d.subject !== key && d.subject !== subject.code && d.subject !== subject.id) return;
      const iso = String(d.date).slice(0, 10);
      events.push({
        kind: d.kind || "deadline",
        iso,
        title: d.title || d.description || "Entrega",
        meta: d
      });
    });

    // Próxima prova
    if (typeof window.getNextExam === "function") {
      try {
        const next = window.getNextExam(subject, ref);
        if (next && next.examDate) {
          events.push({
            kind: "exam",
            iso: String(next.examDate).slice(0, 10),
            title: next.label || "Prova",
            meta: next
          });
        }
      } catch (e) {}
    }

    // Sessões de estudo (weeklyTodos com subject vinculado)
    getWeeklyTodos().forEach((todo) => {
      if (!todo || todo.done) return;
      if (todo.subjectCode && key && todo.subjectCode !== key && todo.subjectCode !== subject.code && todo.subjectCode !== subject.id) return;
      if (!todo.dayIso) return;
      const iso = String(todo.dayIso).slice(0, 10);
      events.push({
        kind: "study",
        iso,
        title: todo.text || "Sessão de estudo",
        meta: todo
      });
    });

    return events
      .filter((e) => e.iso >= refIso && e.iso <= horizonIso)
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }

  /* ─────────────── Log de estudo (passado) ─────────────── */

  function getStudyLog(subject, days) {
    const horizon = Number.isFinite(days) ? Math.max(1, days) : 30;
    const ref = new Date();
    const past = new Date(ref);
    past.setDate(past.getDate() - horizon);
    const pastIso = toIso(past);
    const refIso = toIso(ref);
    const key = subjectKey(subject);

    const log = [];

    // Simulações de prova
    getExamSimulations().forEach((sim) => {
      if (!sim || !sim.subjectCode) return;
      if (sim.subjectCode !== key && sim.subjectCode !== subject.code && sim.subjectCode !== subject.id) return;
      const at = sim.completedAt || sim.createdAt;
      if (!at) return;
      const iso = String(at).slice(0, 10);
      if (iso < pastIso || iso > refIso) return;
      log.push({
        kind: "simulation",
        iso,
        summary: "Simulação · nota " + (sim.grade != null ? sim.grade : "—"),
        meta: sim
      });
    });

    // Notas registradas (gradeEntries)
    entriesForSubject(subject).forEach((entry) => {
      const iso = (entry.entryDate || (entry.createdAt || "")).slice(0, 10);
      if (!iso || iso < pastIso || iso > refIso) return;
      log.push({
        kind: "grade",
        iso,
        summary: "Nota registrada · " + (entry.score != null ? entry.score : "—"),
        meta: entry
      });
    });

    // Tarefas concluídas (weeklyTodos done)
    getWeeklyTodos().forEach((todo) => {
      if (!todo || !todo.done) return;
      if (todo.subjectCode && todo.subjectCode !== key && todo.subjectCode !== subject.code && todo.subjectCode !== subject.id) return;
      const at = todo.completedAt || todo.dayIso;
      if (!at) return;
      const iso = String(at).slice(0, 10);
      if (iso < pastIso || iso > refIso) return;
      log.push({
        kind: "todo",
        iso,
        summary: todo.text || "Tarefa concluída",
        meta: todo
      });
    });

    return log.sort((a, b) => b.iso.localeCompare(a.iso));
  }

  window.SubjectAPI = {
    getSubject,
    listSubjects,
    getStatus,
    getAgenda,
    getStudyLog,
    getStatusLevel,
    statusLabel
  };

  console.log("[subject-api] inicializado");
})();
