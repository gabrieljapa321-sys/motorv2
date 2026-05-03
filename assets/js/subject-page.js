(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     SUBJECT PAGE · v1 (P3b)
     ─────────────────────────────────────────────────────────────────
     Modal/overlay de Disciplina. Mostra:
       - Header com nome em serif, código, status (média + nível)
       - Próxima prova (data + dias)
       - Agenda (próximos 21 dias): provas, entregas, sessões
       - Log de estudo (últimos 30 dias): notas, simulações, tarefas

     Aberto via window.SubjectPage.open(idOrCode).
     Fechado via Esc, click no backdrop ou botao X.
     Lê tudo via SubjectAPI (read-only).
     ═══════════════════════════════════════════════════════════════════ */

  function escapeText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function fmtIsoShort(iso) {
    if (!iso) return "";
    const p = String(iso).split("-");
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    return dt.getDate() + " " + months[dt.getMonth()];
  }

  function fmtIsoLong(iso) {
    if (!iso) return "—";
    const p = String(iso).split("-");
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const wd = ["dom","seg","ter","qua","qui","sex","sáb"][dt.getDay()];
    return wd + ", " + fmtIsoShort(iso);
  }

  function diffDays(refIso, iso) {
    const p1 = refIso.split("-");
    const p2 = iso.split("-");
    const a = new Date(Number(p1[0]), Number(p1[1]) - 1, Number(p1[2]));
    const b = new Date(Number(p2[0]), Number(p2[1]) - 1, Number(p2[2]));
    return Math.round((b - a) / 86400000);
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  let backdrop, headEl, bodyEl, closeBtn;
  let activeSubject = null;

  function open(idOrCode) {
    if (!window.SubjectAPI) return;
    const subject = window.SubjectAPI.getSubject(idOrCode);
    if (!subject) return;
    activeSubject = subject;
    render(subject);
    backdrop.setAttribute("data-open", "true");
    backdrop.removeAttribute("aria-hidden");

    if (window.Anim && typeof window.Anim.fadeUpStagger === "function") {
      // Animar grupos do body com stagger
      const groups = bodyEl.querySelectorAll(".subj-block");
      window.Anim.fadeUpStagger(groups, { duration: 0.36, stagger: 0.05 });
    }
  }

  function close() {
    if (!backdrop) return;
    backdrop.setAttribute("data-open", "false");
    backdrop.setAttribute("aria-hidden", "true");
    activeSubject = null;
  }

  function render(subject) {
    const api = window.SubjectAPI;
    const status = api.getStatus(subject);
    const agenda = api.getAgenda(subject);
    const log = api.getStudyLog(subject);

    const ref = todayIso();
    const name = subject.name || subject.shortName || subject.code || subject.id;
    const code = subject.code && subject.code !== name ? subject.code : "";

    const nextExamLine = status.daysToExam == null
      ? "Sem prova agendada"
      : (status.daysToExam <= 0 ? "Prova hoje" :
         status.daysToExam === 1 ? "Prova amanhã" :
         "Prova em " + status.daysToExam + " dias");

    const target = status.target;
    const projectionHint = status.average == null
      ? "Sem notas registradas ainda."
      : ("Mantendo essa média até o fim, fecha em " + status.averageDisplay + ".");

    headEl.innerHTML =
      '<div class="subj-head-top">' +
        '<div class="subj-head-id">' +
          '<span class="subj-head-eyebrow">Disciplina</span>' +
          '<h2 class="subj-head-name" id="subjModalTitle">' + escapeText(name) + '</h2>' +
          (code ? '<span class="subj-head-code">' + escapeText(code) + '</span>' : '') +
        '</div>' +
        '<div class="subj-head-stats">' +
          '<div class="subj-stat" data-tone="' + escapeText(status.level) + '">' +
            '<span class="subj-stat-num">' + escapeText(status.averageDisplay) + '</span>' +
            '<span class="subj-stat-lab">média</span>' +
          '</div>' +
          '<div class="subj-stat">' +
            '<span class="subj-stat-num">' + escapeText(status.entriesCount) + '</span>' +
            '<span class="subj-stat-lab">notas</span>' +
          '</div>' +
          (status.daysToExam != null
            ? '<div class="subj-stat" data-tone="' + (status.daysToExam <= 2 ? "danger" : status.daysToExam <= 7 ? "warning" : "quiet") + '">' +
                '<span class="subj-stat-num">' + escapeText(status.daysToExam <= 0 ? "0" : status.daysToExam) + 'd</span>' +
                '<span class="subj-stat-lab">próx prova</span>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="subj-head-meta">' +
        '<div class="subj-head-meta-block">' +
          '<span class="subj-head-meta-lab">Status</span>' +
          '<span class="subj-head-meta-val" data-tone="' + escapeText(status.level) + '">' + escapeText(status.levelLabel) + ' · meta ' + target + '</span>' +
        '</div>' +
        '<div class="subj-head-meta-block">' +
          '<span class="subj-head-meta-lab">Próximo evento</span>' +
          '<span class="subj-head-meta-val">' + escapeText(nextExamLine) + '</span>' +
        '</div>' +
        '<div class="subj-head-meta-block">' +
          '<span class="subj-head-meta-lab">Projeção</span>' +
          '<span class="subj-head-meta-val">' + escapeText(projectionHint) + '</span>' +
        '</div>' +
      '</div>';

    /* ─── Body ─── */
    let agendaHtml;
    if (!agenda.length) {
      agendaHtml = '<p class="subj-empty">Sem provas, entregas ou sessões nas próximas 3 semanas.</p>';
    } else {
      agendaHtml = '<ul class="subj-list">' +
        agenda.map((ev) => agendaItem(ev, ref)).join("") +
        '</ul>';
    }

    let logHtml;
    if (!log.length) {
      logHtml = '<p class="subj-empty">Sem registros de estudo nos últimos 30 dias.</p>';
    } else {
      logHtml = '<ul class="subj-list">' +
        log.slice(0, 12).map((it) => logItem(it, ref)).join("") +
        '</ul>';
    }

    bodyEl.innerHTML =
      '<section class="subj-block" aria-label="Agenda da disciplina">' +
        '<header class="subj-block-head">' +
          '<h3 class="subj-block-title">Próximas 3 semanas</h3>' +
          '<span class="subj-block-count">' + agenda.length + '</span>' +
        '</header>' +
        agendaHtml +
      '</section>' +
      '<section class="subj-block" aria-label="Log de estudo">' +
        '<header class="subj-block-head">' +
          '<h3 class="subj-block-title">Últimos 30 dias</h3>' +
          '<span class="subj-block-count">' + log.length + '</span>' +
        '</header>' +
        logHtml +
      '</section>';
  }

  function agendaItem(ev, ref) {
    const delta = diffDays(ref, ev.iso);
    let rel; let tone = "quiet";
    if (delta < 0) { rel = Math.abs(delta) + "d"; tone = "danger"; }
    else if (delta === 0) { rel = "Hoje"; tone = "warning"; }
    else if (delta === 1) { rel = "Amanhã"; tone = "warning"; }
    else if (delta <= 3) { rel = delta + "d"; tone = "accent"; }
    else { rel = delta + "d"; tone = "quiet"; }

    const kindLabels = { exam: "Prova", deadline: "Entrega", trabalho: "Trabalho", entrega: "Entrega", leitura: "Leitura", prova: "Prova", study: "Estudo" };
    const kindLabel = kindLabels[ev.kind] || "Evento";
    const kindClass = ev.kind === "exam" || ev.kind === "prova" ? "warning" :
                      ev.kind === "study" ? "accent" : "muted";

    return (
      '<li class="subj-item">' +
        '<span class="subj-item-date" data-tone="' + tone + '">' +
          '<span class="subj-item-rel">' + escapeText(rel) + '</span>' +
          '<span class="subj-item-iso">' + escapeText(fmtIsoShort(ev.iso)) + '</span>' +
        '</span>' +
        '<div class="subj-item-main">' +
          '<span class="subj-item-title">' + escapeText(ev.title) + '</span>' +
          '<span class="subj-item-kind" data-kind="' + escapeText(kindClass) + '">' + escapeText(kindLabel) + '</span>' +
        '</div>' +
      '</li>'
    );
  }

  function logItem(it, ref) {
    const delta = diffDays(ref, it.iso);
    const rel = delta === 0 ? "hoje" : delta === -1 ? "ontem" : Math.abs(delta) + "d atrás";
    const kindLabels = { simulation: "Simulação", grade: "Nota", todo: "Tarefa" };
    const kindLabel = kindLabels[it.kind] || "Registro";
    const kindClass = it.kind === "simulation" ? "warning" :
                      it.kind === "grade" ? "accent" : "muted";
    return (
      '<li class="subj-item subj-item--log">' +
        '<span class="subj-item-rel-only">' + escapeText(rel) + '</span>' +
        '<div class="subj-item-main">' +
          '<span class="subj-item-title">' + escapeText(it.summary) + '</span>' +
          '<span class="subj-item-kind" data-kind="' + escapeText(kindClass) + '">' + escapeText(kindLabel) + '</span>' +
        '</div>' +
      '</li>'
    );
  }

  function setupEvents() {
    if (!backdrop) return;

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) close();
    });

    if (closeBtn) closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", function (event) {
      if (backdrop.getAttribute("data-open") !== "true") return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    // Captura cliques em [data-subject-open] em qualquer lugar do app
    document.addEventListener("click", function (event) {
      const trigger = event.target && event.target.closest ? event.target.closest("[data-subject-open]") : null;
      if (!trigger) return;
      const id = trigger.getAttribute("data-subject-open");
      if (!id) return;
      event.preventDefault();
      open(id);
    });
  }

  function init() {
    backdrop = document.getElementById("subjBackdrop");
    headEl   = document.getElementById("subjHead");
    bodyEl   = document.getElementById("subjBody");
    closeBtn = document.getElementById("subjCloseBtn");
    if (!backdrop || !headEl || !bodyEl) return;
    setupEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.SubjectPage = { open, close };
  console.log("[subject-page] inicializado");
})();
