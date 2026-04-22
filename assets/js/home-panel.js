(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     HOME PANEL v2 · Passo 1 (skeleton)
     ─────────────────────────────────────────────────────────────────
     Estratégia:
     - home-dashboard.js carrega primeiro e define renderHomeDashboard
       (função global usada por render() central do app).
     - Este arquivo carrega DEPOIS e substitui renderHomeDashboard por
       uma versão nova, começando com skeleton.
     - Zero alteração no contrato: assinatura mantida
       renderHomeDashboard(plan, queue, referenceDate).
     - Preserva state (workTasks, deadlines, subjects, schedule, etc.)
       e chamadas globais (saveState, openPage, showToast).

     Passos seguintes vão preencher os blocos:
       Passo 2 - KPIs
       Passo 3 - Foco de hoje
       Passo 4 - Atalhos + captura
       Passo 5 - Polir CSS
     ═══════════════════════════════════════════════════════════════════ */

  function renderHeader() {
    const el = document.getElementById("hpHeader");
    if (!el) return;
    const now = new Date();
    const weekday = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"][now.getDay()];
    const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dateLabel = now.getDate() + " de " + months[now.getMonth()] + " de " + now.getFullYear();
    const greeting = greetingFor(now.getHours());

    el.innerHTML =
      '<div class="hp-header-copy">' +
        '<span class="hp-eyebrow">' + escapeText(weekday) + ' · ' + escapeText(dateLabel) + '</span>' +
        '<h1 class="hp-title">' + escapeText(greeting) + '</h1>' +
        '<p class="hp-sub">Um resumo do seu dia cruzando trabalho e estudos.</p>' +
      '</div>' +
      '<div class="hp-header-actions">' +
        '<button type="button" class="hp-btn hp-btn--ghost" data-nav-page="work">Abrir Trabalho</button>' +
        '<button type="button" class="hp-btn hp-btn--ghost" data-nav-page="studies">Abrir Estudos</button>' +
      '</div>';
  }

  function renderKpis() {
    const el = document.getElementById("hpKpis");
    if (!el) return;
    const now = new Date();
    const metrics = computeKpiMetrics(now);

    el.innerHTML =
      '<div class="hp-kpi-group" data-scope="work">' +
        '<div class="hp-kpi-group-label">Trabalho</div>' +
        '<div class="hp-kpi-grid">' +
          kpiCard({
            label: "Hoje",
            value: metrics.work.today,
            sub: metrics.work.todayLabel,
            tone: metrics.work.today > 0 ? "accent" : "quiet",
            nav: "work",
            filter: "today"
          }) +
          kpiCard({
            label: "Atrasadas",
            value: metrics.work.overdue,
            sub: metrics.work.overdueLabel,
            tone: metrics.work.overdue > 0 ? "danger" : "quiet",
            nav: "work",
            filter: "overdue"
          }) +
          kpiCard({
            label: "Aguardando",
            value: metrics.work.waiting,
            sub: metrics.work.waitingLabel,
            tone: metrics.work.waiting > 0 ? "warning" : "quiet",
            nav: "work",
            filter: "waiting"
          }) +
        '</div>' +
      '</div>' +
      '<div class="hp-kpi-group" data-scope="study">' +
        '<div class="hp-kpi-group-label">Estudos</div>' +
        '<div class="hp-kpi-grid">' +
          kpiCard({
            label: "Entregas (7d)",
            value: metrics.study.deadlines7d,
            sub: metrics.study.deadlinesLabel,
            tone: metrics.study.overdueDeadlines > 0 ? "danger" : (metrics.study.deadlines7d > 0 ? "accent" : "quiet"),
            nav: "studies"
          }) +
          kpiCard({
            label: "Próxima prova",
            value: metrics.study.nextExamValue,
            sub: metrics.study.nextExamSub,
            tone: metrics.study.nextExamTone,
            nav: "studies"
          }) +
          kpiCard({
            label: "Matérias no radar",
            value: metrics.study.radar,
            sub: metrics.study.radarLabel,
            tone: metrics.study.radar > 0 ? "accent" : "quiet",
            nav: "studies"
          }) +
        '</div>' +
      '</div>';
  }

  function kpiCard(cfg) {
    const tone = cfg.tone || "quiet";
    const navAttr = cfg.nav ? ' data-nav-page="' + escapeText(cfg.nav) + '"' : '';
    const filterAttr = cfg.filter ? ' data-home-work-filter="' + escapeText(cfg.filter) + '"' : '';
    const tag = (cfg.nav || cfg.filter) ? 'button' : 'div';
    const openAttr = (cfg.nav || cfg.filter) ? ' type="button"' : '';
    return '<' + tag + ' class="hp-kpi" data-tone="' + escapeText(tone) + '"' + openAttr + navAttr + filterAttr + '>' +
      '<span class="hp-kpi-label">' + escapeText(cfg.label) + '</span>' +
      '<span class="hp-kpi-value">' + escapeText(String(cfg.value)) + '</span>' +
      '<span class="hp-kpi-sub">' + escapeText(cfg.sub || "") + '</span>' +
    '</' + tag + '>';
  }

  function computeKpiMetrics(now) {
    const todayIso = toIso(now);
    const workTasks = (typeof state !== "undefined" && Array.isArray(state.workTasks)) ? state.workTasks : [];
    const WD = window.WorkDomain;

    // -------------------------- Work --------------------------
    let todayCount = 0;
    let overdueCount = 0;
    let waitingCount = 0;
    if (WD) {
      const open = workTasks.filter(WD.isOpen);
      todayCount = open.filter(function (t) { return WD.isToday(t, todayIso); }).length;
      overdueCount = open.filter(function (t) { return WD.isOverdue(t, todayIso); }).length;
      waitingCount = open.filter(WD.isWaiting).length;
    }

    // -------------------------- Study -------------------------
    const deadlines = (typeof state !== "undefined" && Array.isArray(state.deadlines)) ? state.deadlines : [];
    const pendingDeadlines = deadlines.filter(function (d) { return d && d.dueDate && !d.deliveredAt; });

    const in7 = addDaysIso(todayIso, 7);
    const deadlines7d = pendingDeadlines.filter(function (d) {
      return d.dueDate >= todayIso && d.dueDate <= in7;
    }).length;
    const overdueDeadlines = pendingDeadlines.filter(function (d) { return d.dueDate < todayIso; }).length;

    let nextExamValue = "—";
    let nextExamSub = "Sem prova agendada";
    let nextExamTone = "quiet";
    try {
      if (typeof window.getNextExam === "function" && typeof window.DATA !== "undefined" && Array.isArray(window.DATA.subjects)) {
        const candidates = window.DATA.subjects
          .map(function (subject) {
            const exam = window.getNextExam(subject, now);
            if (!exam || !exam.examDate) return null;
            return { subject: subject, exam: exam, date: exam.examDate };
          })
          .filter(Boolean)
          .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        const next = candidates[0];
        if (next) {
          const days = diffDaysIso(todayIso, next.date);
          if (days === 0) { nextExamValue = "hoje"; nextExamTone = "danger"; }
          else if (days === 1) { nextExamValue = "amanha"; nextExamTone = "warning"; }
          else if (days < 0) { nextExamValue = Math.abs(days) + "d"; nextExamTone = "danger"; }
          else if (days <= 7) { nextExamValue = days + "d"; nextExamTone = "warning"; }
          else { nextExamValue = days + "d"; nextExamTone = "accent"; }
          const subjName = (next.subject.shortName || next.subject.name || next.subject.code || "Prova");
          nextExamSub = subjName + " · " + formatIsoShort(next.date);
        }
      }
    } catch (e) {
      console.warn("[home-panel] getNextExam failed", e);
    }

    // Matérias no radar: tem entrega pendente OU prova nos próximos 45 dias
    let radarCount = 0;
    try {
      if (typeof window.DATA !== "undefined" && Array.isArray(window.DATA.subjects)) {
        const deadlineSubjects = new Set(pendingDeadlines.map(function (d) { return d.subjectCode; }).filter(Boolean));
        radarCount = window.DATA.subjects.filter(function (subject) {
          if (deadlineSubjects.has(subject.code)) return true;
          if (typeof window.getNextExam === "function") {
            const exam = window.getNextExam(subject, now);
            if (!exam || !exam.examDate) return false;
            const days = diffDaysIso(todayIso, exam.examDate);
            return days >= 0 && days <= 45;
          }
          return false;
        }).length;
      }
    } catch (e) { /* ignore */ }

    const deadlinesLabel = overdueDeadlines > 0
      ? overdueDeadlines + " atrasadas"
      : (deadlines7d > 0 ? "nos próximos 7 dias" : "nenhuma");

    const radarLabel = radarCount > 0 ? "com entrega ou prova próxima" : "fluxo limpo";

    return {
      work: {
        today: todayCount,
        todayLabel: todayCount > 0 ? "planejadas para hoje" : "nenhuma para hoje",
        overdue: overdueCount,
        overdueLabel: overdueCount > 0 ? "prazo vencido" : "sem atraso",
        waiting: waitingCount,
        waitingLabel: waitingCount > 0 ? "com terceiros" : "sem pendência externa"
      },
      study: {
        deadlines7d: deadlines7d,
        overdueDeadlines: overdueDeadlines,
        deadlinesLabel: deadlinesLabel,
        nextExamValue: nextExamValue,
        nextExamSub: nextExamSub,
        nextExamTone: nextExamTone,
        radar: radarCount,
        radarLabel: radarLabel
      }
    };
  }

  // --- Date helpers locais (não dependem de funções externas) ---
  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function addDaysIso(iso, days) {
    const parts = iso.split("-");
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dt.setDate(dt.getDate() + days);
    return toIso(dt);
  }
  function diffDaysIso(a, b) {
    const pa = a.split("-");
    const pb = b.split("-");
    const da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
    const db = new Date(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
    return Math.round((db - da) / 86400000);
  }
  function formatIsoShort(iso) {
    const parts = iso.split("-");
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return dt.getDate() + " " + months[dt.getMonth()];
  }

  function renderFocus() {
    const el = document.getElementById("hpFocus");
    if (!el) return;
    // Passo 1: placeholder. Passo 3 vai popular com o foco de hoje.
    el.innerHTML = placeholderBlock("Foco de hoje · Passo 3");
  }

  function renderAside() {
    const el = document.getElementById("hpAside");
    if (!el) return;
    // Passo 1: placeholder. Passo 4 vai popular com atalhos e captura.
    el.innerHTML = placeholderBlock("Atalhos e captura · Passo 4");
  }

  function placeholderBlock(label) {
    return '<div class="hp-placeholder" role="presentation">' +
      '<span class="hp-placeholder-label">' + escapeText(label) + '</span>' +
      '<span class="hp-placeholder-hint">Em construcao.</span>' +
    '</div>';
  }

  function greetingFor(hour) {
    if (hour < 5) return "Ainda e madrugada.";
    if (hour < 12) return "Bom dia.";
    if (hour < 18) return "Boa tarde.";
    return "Boa noite.";
  }

  function escapeText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* -----------------------------------------------------------------
     Render principal (sobrescreve renderHomeDashboard global)
     Assinatura preservada: (plan, queue, referenceDate)
     ----------------------------------------------------------------- */
  function renderHomeDashboardV2(/* plan, queue, referenceDate */) {
    const root = document.getElementById("homeDashboardRoot");
    if (!root) return;
    try { renderHeader(); } catch (e) { console.error("[home-panel] header", e); }
    try { renderKpis(); } catch (e) { console.error("[home-panel] kpis", e); }
    try { renderFocus(); } catch (e) { console.error("[home-panel] focus", e); }
    try { renderAside(); } catch (e) { console.error("[home-panel] aside", e); }
  }

  // Override da funcao global definida em home-dashboard.js
  window.renderHomeDashboard = renderHomeDashboardV2;

  // Re-render quando o state for substituido (ex.: sync Firebase)
  if (window.StudyApp && typeof window.StudyApp.onStateReplaced === "function") {
    window.StudyApp.onStateReplaced(function () {
      const page = document.getElementById("homePage");
      if (page && !page.hasAttribute("hidden")) renderHomeDashboardV2();
    });
  }

  // Se a pagina ja estiver visivel (hot reload / navegacao direta), forca render
  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(function () {
      const page = document.getElementById("homePage");
      if (page && !page.hasAttribute("hidden")) renderHomeDashboardV2();
    });
  }

  console.log("[home-panel] v2 inicializado (Passo 1 · skeleton)");
})();
