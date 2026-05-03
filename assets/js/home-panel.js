(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     HOME PANEL v6 · Duas colunas paralelas (Trabalho | Faculdade)
     ─────────────────────────────────────────────────────────────────
     Estrutura:
       hpMasthead        - saudação + data + relógio
       hp-split (grid 2 cols)
         hpWorkTitle / hpWorkToday / hpWorkNext / hpWorkCompanies
         hpSchoolTitle / hpSchoolToday / hpSchoolNext / hpSchoolSubjects
       hpCapture         - captura unificada com toggle Trabalho|Faculdade

     Contratos preservados:
       window.renderHomeDashboard(plan, queue, ref)
       window.StudyApp.onReady / onStateReplaced
       delegação [data-nav-page] + [data-home-work-filter]
       captura cria via WorkPlanner.addTask (Trabalho) ou via deadline acadêmico
     ═══════════════════════════════════════════════════════════════════ */

  /* ───────────────────────── Helpers ───────────────────────── */

  function escapeText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toIso(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function addDaysIso(iso, days) {
    const p = String(iso).split("-");
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    dt.setDate(dt.getDate() + days);
    return toIso(dt);
  }

  function diffDaysIso(a, b) {
    const pa = String(a).split("-"); const pb = String(b).split("-");
    const da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
    const db = new Date(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
    return Math.round((db - da) / 86400000);
  }

  function formatIsoShort(iso) {
    if (!iso) return "";
    const p = String(iso).split("-");
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    return dt.getDate() + " " + months[dt.getMonth()];
  }

  function formatLongDate(date) {
    const wd = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"][date.getDay()];
    const m  = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return wd + ", " + date.getDate() + " de " + m[date.getMonth()];
  }

  function greetingFor(hour) {
    if (hour < 5)  return "Boa madrugada";
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }

  function plural(n, s, p) { return n === 1 ? s : p; }

  function relativeDelta(delta) {
    if (delta === 0) return "hoje";
    if (delta === 1) return "amanhã";
    if (delta === -1) return "ontem";
    if (delta > 0) return "em " + delta + " dias";
    return "há " + Math.abs(delta) + " dias";
  }

  function dueTone(iso) {
    if (!iso) return "quiet";
    const ref = toIso(new Date());
    const d = diffDaysIso(ref, iso);
    if (d < 0) return "danger";
    if (d <= 1) return "warning";
    if (d <= 3) return "accent";
    return "quiet";
  }

  /* ───────────────── Acesso a estado ───────────────── */

  function getWorkTasks() {
    try { if (window.state && Array.isArray(window.state.workTasks)) return window.state.workTasks; }
    catch (e) {}
    return [];
  }
  function getDeadlines() {
    try { if (window.state && Array.isArray(window.state.deadlines)) return window.state.deadlines; }
    catch (e) {}
    return [];
  }
  function getSubjects() {
    try { if (window.DATA && Array.isArray(window.DATA.subjects)) return window.DATA.subjects; }
    catch (e) {}
    return [];
  }
  function getNextExamSafe(subj, ref) {
    if (typeof window.getNextExam !== "function") return null;
    try { return window.getNextExam(subj, ref); } catch (e) { return null; }
  }

  /* ───────────────────────── Masthead ───────────────────────── */

  function renderMasthead() {
    const el = document.getElementById("hpMasthead");
    if (!el) return;
    const now = new Date();
    const greeting = greetingFor(now.getHours());
    const date = formatLongDate(now);
    const clock = pad2(now.getHours()) + ":" + pad2(now.getMinutes());

    el.innerHTML =
      '<div class="hp-masthead-text">' +
        '<span class="hp-masthead-eyebrow">' + escapeText(date) + '</span>' +
        '<h1 class="hp-masthead-title">' + escapeText(greeting) + ', Gabriel.</h1>' +
        '<p class="hp-masthead-sub">Trabalho e faculdade lado a lado. Escolha um e siga.</p>' +
      '</div>' +
      '<div class="hp-masthead-clock">' +
        '<span class="hp-masthead-clock-dot" aria-hidden="true"></span>' +
        '<span class="hp-masthead-clock-value">' + escapeText(clock) + '</span>' +
      '</div>';
  }

  /* ───────────────────────── Coluna Trabalho ───────────────────────── */

  function renderWorkColumn() {
    const titleEl = document.getElementById("hpWorkTitle");
    const todayEl = document.getElementById("hpWorkToday");
    const nextEl  = document.getElementById("hpWorkNext");
    const coEl    = document.getElementById("hpWorkCompanies");
    if (!titleEl || !todayEl || !nextEl || !coEl) return;

    const now = new Date();
    const refIso = toIso(now);
    const horizon = addDaysIso(refIso, 3);
    const tasks = getWorkTasks();
    const WD = window.WorkDomain;
    const open = WD ? tasks.filter(WD.isOpen) : [];
    const overdue = WD ? open.filter((t) => WD.isOverdue(t, refIso)) : [];
    const today   = WD ? open.filter((t) => WD.isToday(t, refIso) && !WD.isOverdue(t, refIso)) : [];
    const next72  = WD ? open.filter((t) => {
      if (WD.isOverdue(t, refIso) || WD.isToday(t, refIso)) return false;
      const d = t.dueDate || t.scheduledDayIso;
      return d && d > refIso && d <= horizon;
    }) : [];

    /* Linha de status executiva */
    if (overdue.length) {
      titleEl.innerHTML = overdue.length + ' ' + plural(overdue.length, "tarefa atrasada", "tarefas atrasadas");
      titleEl.setAttribute("data-tone", "danger");
    } else if (today.length) {
      titleEl.innerHTML = today.length + ' ' + plural(today.length, "tarefa para hoje", "tarefas para hoje");
      titleEl.setAttribute("data-tone", "accent");
    } else if (next72.length) {
      titleEl.innerHTML = "Tudo no controle.";
      titleEl.setAttribute("data-tone", "quiet");
    } else {
      titleEl.innerHTML = "Sem pendências em aberto.";
      titleEl.setAttribute("data-tone", "quiet");
    }

    /* Hoje (atrasadas + hoje) */
    const todayList = (WD ? WD.sortTasks(overdue.concat(today), refIso) : []).slice(0, 5);
    todayEl.innerHTML = todayList.length
      ? '<ul class="hp-list" role="list">' + todayList.map((t) => taskRow(t, refIso, WD)).join("") + '</ul>'
      : emptyMsg(workEmptyMessage(now));

    /* Próximas 72h */
    const next72List = (WD ? WD.sortTasks(next72, refIso) : []).slice(0, 4);
    nextEl.innerHTML = next72List.length
      ? '<ul class="hp-list" role="list">' + next72List.map((t) => taskRow(t, refIso, WD)).join("") + '</ul>'
      : emptyMsg("Nada agendado nos próximos três dias.");

    /* Investidas — 3 tiles */
    if (!WD) { coEl.innerHTML = ""; return; }
    const summaries = WD.companySummaries(tasks, refIso);
    coEl.innerHTML = '<div class="hp-co-row">' + summaries.map(coTileSmall).join("") + '</div>';
  }

  function schoolTodayEmpty(now) {
    const d = now.getDay();
    const h = now.getHours();
    if (d === 0) return "Domingo. Bom momento pra revisar a semana sem pressão.";
    if (d === 6) return "Sábado livre. Estude o que tá em dia, sem culpa.";
    if (d === 5 && h >= 18) return "Sexta de noite. Universidade pode esperar.";
    if (h < 8) return "Manhã. Sem nada marcado ainda — bom pra revisar.";
    if (h >= 22) return "Já é tarde. Descansar é parte da estratégia.";
    return "Nenhum compromisso para hoje.";
  }

  function workEmptyMessage(now) {
    const d = now.getDay();
    const h = now.getHours();
    const date = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const isMonthEnd = lastDay - date <= 2;

    if (d === 5 && h >= 17) return "Sexta de fim de tarde. Boa pra fechar o que sobra na semana.";
    if (d === 0) return h < 12 ? "Domingo de manhã. Trabalho dorme até segunda." : "Domingo. Sem nada de trabalho marcado pra hoje.";
    if (d === 6) return "Sábado sem pendências de trabalho. Aproveite.";
    if (isMonthEnd && h >= 16) return "Final de mês limpo. Bom indicador de organização.";
    if (h < 8) return "Dia ainda não começou de fato.";
    if (h < 12) return "Manhã limpa. Capture o que pintar.";
    if (h < 14) return "Hora do almoço, sem pendências.";
    if (h >= 19) return "Dia encerrado. Sem pendências.";
    return "Sem tarefas marcadas pra hoje.";
  }

  function taskRow(task, refIso, WD) {
    const overdueLvl = WD && WD.overdueLevel ? WD.overdueLevel(task, refIso) : (WD && WD.isOverdue(task, refIso) ? 1 : 0);
    const waiting = WD ? WD.isWaiting(task) : false;
    const co = task.companyId && WD ? WD.companyMeta(task.companyId) : null;
    const accent = co ? co.accent : "var(--muted)";
    const kindMeta = WD && WD.getKindMeta ? WD.getKindMeta(task.itemKind) : null;
    const kindTag = kindMeta && task.itemKind && task.itemKind !== "task"
      ? '<span class="hp-tag hp-tag--kind" data-kind="' + escapeText(task.itemKind) + '">' + escapeText(kindMeta.short) + '</span>'
      : '';
    let stateTag = '';
    if (overdueLvl === 3) stateTag = '<span class="hp-tag" data-tone="danger">atrasada 7d+</span>';
    else if (overdueLvl === 2) stateTag = '<span class="hp-tag" data-tone="danger">atrasada</span>';
    else if (overdueLvl === 1) stateTag = '<span class="hp-tag" data-tone="warning">atrasada 1d</span>';
    else if (waiting) stateTag = '<span class="hp-tag" data-tone="warning">aguardando</span>';
    else if (task.priority === "critical") stateTag = '<span class="hp-tag" data-tone="danger">crítica</span>';
    else if (task.priority === "high") stateTag = '<span class="hp-tag" data-tone="accent">alta</span>';

    const due = task.dueDate ? formatIsoShort(task.dueDate) : "";
    const filter = task.companyId || "all";
    return (
      '<li class="hp-row" data-overdue-level="' + overdueLvl + '" data-nav-page="work" data-home-work-filter="' + escapeText(filter) + '" role="button" tabindex="0">' +
        '<span class="hp-row-mark" style="--row-accent:' + escapeText(accent) + '" aria-hidden="true"></span>' +
        '<div class="hp-row-main">' +
          '<div class="hp-row-line"><span class="hp-row-title">' + escapeText(task.title || "Tarefa") + '</span>' + kindTag + stateTag + '</div>' +
          '<div class="hp-row-sub">' +
            (co ? '<span>' + escapeText(co.name) + '</span>' : '<span>Geral</span>') +
            (task.nextAction && task.nextAction !== task.title ? '<span class="hp-row-next">' + escapeText(task.nextAction) + '</span>' : "") +
          '</div>' +
        '</div>' +
        (due ? '<span class="hp-row-due">' + escapeText(due) + '</span>' : '') +
      '</li>'
    );
  }

  function coTileSmall(summary) {
    const co = summary.company;
    return (
      '<button type="button" class="hp-co-tile-sm" data-nav-page="work" data-home-work-filter="' + escapeText(co.id) + '" style="--co-accent:' + escapeText(co.accent) + '">' +
        '<div class="hp-co-tile-sm-head">' +
          '<span class="hp-co-mark" aria-hidden="true"></span>' +
          '<span class="hp-co-name">' + escapeText(co.name) + '</span>' +
        '</div>' +
        '<div class="hp-co-tile-sm-stats">' +
          '<span><strong>' + summary.openCount + '</strong> abertas</span>' +
          (summary.overdueCount ? '<span data-tone="danger"><strong>' + summary.overdueCount + '</strong> atrasadas</span>' : '') +
          (summary.waitingCount ? '<span data-tone="warning"><strong>' + summary.waitingCount + '</strong> aguardando</span>' : '') +
        '</div>' +
      '</button>'
    );
  }

  /* ───────────────────────── Coluna Faculdade ───────────────────────── */

  function renderSchoolColumn() {
    const titleEl = document.getElementById("hpSchoolTitle");
    const todayEl = document.getElementById("hpSchoolToday");
    const nextEl  = document.getElementById("hpSchoolNext");
    const subEl   = document.getElementById("hpSchoolSubjects");
    if (!titleEl || !todayEl || !nextEl || !subEl) return;

    const now = new Date();
    const refIso = toIso(now);
    const horizon = addDaysIso(refIso, 3);
    const horizonWeek = addDaysIso(refIso, 7);
    const deadlines = getDeadlines();
    const subjects = getSubjects();

    // eventos: provas + entregas
    const events = [];
    deadlines.forEach((d) => {
      if (!d || d.done || !d.date) return;
      events.push({ kind: "deadline", iso: String(d.date).slice(0,10), title: d.title || d.description || "Entrega", subject: d.subject || "" });
    });
    subjects.forEach((subj) => {
      const next = getNextExamSafe(subj, now);
      if (!next || !next.examDate) return;
      events.push({ kind: "exam", iso: String(next.examDate).slice(0,10), title: next.label || "Prova", subject: subj.name || subj.id || "" });
    });
    events.sort((a, b) => a.iso.localeCompare(b.iso));

    const overdue = events.filter((e) => e.iso < refIso);
    const today = events.filter((e) => e.iso === refIso);
    const next72 = events.filter((e) => e.iso > refIso && e.iso <= horizon);
    const week = events.filter((e) => e.iso > horizon && e.iso <= horizonWeek);

    /* Linha de status */
    if (overdue.length) {
      titleEl.innerHTML = overdue.length + " " + plural(overdue.length, "entrega vencida", "entregas vencidas");
      titleEl.setAttribute("data-tone", "danger");
    } else if (today.length) {
      titleEl.innerHTML = today.length + " " + plural(today.length, "compromisso para hoje", "compromissos para hoje");
      titleEl.setAttribute("data-tone", "accent");
    } else if (next72.length) {
      titleEl.innerHTML = next72.length + " " + plural(next72.length, "evento em 72h", "eventos em 72h");
      titleEl.setAttribute("data-tone", "warning");
    } else if (week.length) {
      titleEl.innerHTML = week.length + " " + plural(week.length, "evento na semana", "eventos na semana");
      titleEl.setAttribute("data-tone", "quiet");
    } else {
      titleEl.innerHTML = "Nada no horizonte.";
      titleEl.setAttribute("data-tone", "quiet");
    }

    /* Hoje (vencidas + hoje) */
    const todayBlock = overdue.concat(today);
    todayEl.innerHTML = todayBlock.length
      ? '<ul class="hp-list" role="list">' + todayBlock.slice(0,5).map((e) => eventRow(e, refIso)).join("") + '</ul>'
      : emptyMsg(schoolTodayEmpty(now));

    /* Próximas 72h */
    nextEl.innerHTML = next72.length
      ? '<ul class="hp-list" role="list">' + next72.slice(0,4).map((e) => eventRow(e, refIso)).join("") + '</ul>'
      : emptyMsg(week.length
          ? "Próxima semana tem " + week.length + " " + plural(week.length, "evento", "eventos") + " — adiantar agora alivia depois."
          : "Sem provas ou entregas nos próximos três dias.");

    /* Disciplinas — tiles compactos com status (P3b) */
    if (subjects.length) {
      const tiles = subjects.slice(0, 6).map((s) => subjectStatusTile(s, now)).join("");
      subEl.innerHTML = '<div class="hp-subj-grid">' + tiles + '</div>';
    } else {
      subEl.innerHTML = emptyMsg("Sem disciplinas cadastradas.");
    }
  }

  function subjectStatusTile(subject, now) {
    const api = window.SubjectAPI;
    const name = subject.shortName || subject.name || subject.code || subject.id || "—";
    const subjectKey = subject.id || subject.code || subject.shortName || subject.name;
    if (!api) {
      return (
        '<button type="button" class="hp-subj-tile" data-subject-open="' + escapeText(subjectKey) + '" data-tone="unknown">' +
          '<span class="hp-subj-tile-name">' + escapeText(name) + '</span>' +
        '</button>'
      );
    }
    const status = api.getStatus(subject, now);
    const nextLabel = status.daysToExam == null
      ? "—"
      : (status.daysToExam <= 0 ? "prova hoje"
         : status.daysToExam === 1 ? "prova amanhã"
         : "prova em " + status.daysToExam + "d");
    return (
      '<button type="button" class="hp-subj-tile" data-subject-open="' + escapeText(subjectKey) + '" data-tone="' + escapeText(status.level) + '" title="' + escapeText(name + " · " + status.levelLabel) + '">' +
        '<span class="hp-subj-tile-head">' +
          '<span class="hp-subj-tile-name">' + escapeText(name) + '</span>' +
          '<span class="hp-subj-tile-avg">' + escapeText(status.averageDisplay) + '</span>' +
        '</span>' +
        '<span class="hp-subj-tile-meta">' +
          '<span class="hp-subj-tile-level">' + escapeText(status.levelLabel) + '</span>' +
          (status.daysToExam != null ? '<span class="hp-subj-tile-next">' + escapeText(nextLabel) + '</span>' : '') +
        '</span>' +
      '</button>'
    );
  }

  function eventRow(ev, refIso) {
    const delta = diffDaysIso(refIso, ev.iso);
    let rel; let tone = "quiet";
    if (delta < 0) { rel = Math.abs(delta) + "d"; tone = "danger"; }
    else if (delta === 0) { rel = "Hoje"; tone = "warning"; }
    else if (delta === 1) { rel = "Amanhã"; tone = "warning"; }
    else { rel = delta + "d"; tone = "accent"; }
    const tag = ev.kind === "exam" ? '<span class="hp-tag" data-tone="warning">prova</span>' : '<span class="hp-tag" data-tone="accent">entrega</span>';
    return (
      '<li class="hp-row" data-nav-page="studies" role="button" tabindex="0">' +
        '<span class="hp-row-date" data-tone="' + tone + '">' +
          '<span class="hp-row-date-rel">' + escapeText(rel) + '</span>' +
          '<span class="hp-row-date-iso">' + escapeText(formatIsoShort(ev.iso)) + '</span>' +
        '</span>' +
        '<div class="hp-row-main">' +
          '<div class="hp-row-line"><span class="hp-row-title">' + escapeText(ev.title) + '</span>' + tag + '</div>' +
          (ev.subject ? '<div class="hp-row-sub"><span>' + escapeText(ev.subject) + '</span></div>' : "") +
        '</div>' +
      '</li>'
    );
  }

  /* ───────────────────────── Captura unificada ───────────────────────── */

  function renderCapture() {
    const el = document.getElementById("hpCapture");
    if (!el) return;

    const ctx = (window.state && window.state.appContext === "school") ? "school" : "work";
    const WD = window.WorkDomain;
    const companies = WD ? WD.COMPANIES : [];
    const subjects  = getSubjects();

    const companyOpts = '<option value="">Geral</option>' +
      companies.map((c) => '<option value="' + escapeText(c.id) + '">' + escapeText(c.name) + '</option>').join("");

    const subjectOpts = '<option value="">—</option>' +
      subjects.map((s) => {
        const name = s.name || s.code || s.id;
        return '<option value="' + escapeText(s.id || s.code || name) + '">' + escapeText(name) + '</option>';
      }).join("");

    const priorities = WD ? WD.PRIORITIES : [
      { value: "critical", label: "Crítica" },
      { value: "high", label: "Alta" },
      { value: "medium", label: "Média" },
      { value: "low", label: "Baixa" }
    ];
    const priorityOpts = priorities.map((p) => {
      const sel = p.value === "medium" ? " selected" : "";
      return '<option value="' + escapeText(p.value) + '"' + sel + '>' + escapeText(p.label) + '</option>';
    }).join("");

    // P3a — opcoes de tipo no contexto Trabalho
    const kinds = WD ? WD.ITEM_KINDS : [];
    const kindOpts = kinds.map((k) => {
      const sel = k.value === "task" ? " selected" : "";
      return '<option value="' + escapeText(k.value) + '"' + sel + '>' + escapeText(k.label) + '</option>';
    }).join("");

    el.innerHTML =
      '<form class="hp-capture-form" id="hpCaptureForm" autocomplete="off" data-active="' + ctx + '">' +
        '<div class="hp-capture-toggle" role="tablist" aria-label="Contexto da captura">' +
          '<button type="button" class="hp-capture-toggle-btn" role="tab" data-capture-ctx="work" aria-selected="' + (ctx === "work") + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>' +
            'Trabalho' +
          '</button>' +
          '<button type="button" class="hp-capture-toggle-btn" role="tab" data-capture-ctx="school" aria-selected="' + (ctx === "school") + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 5-10 5L2 8l10-5z"/><path d="M6 10v5c0 2 3 4 6 4s6-2 6-4v-5"/></svg>' +
            'Faculdade' +
          '</button>' +
        '</div>' +
        '<div class="hp-capture-fields">' +
          '<input type="text" name="title" maxlength="200" required class="hp-capture-input hp-capture-input--title" placeholder="O que precisa andar?" />' +
          '<div class="hp-capture-grid">' +
            '<div class="hp-capture-row hp-capture-row--work" data-show-when="work">' +
              '<select name="itemKind" class="hp-capture-input" aria-label="Tipo">' + kindOpts + '</select>' +
              '<select name="companyId" class="hp-capture-input">' + companyOpts + '</select>' +
              '<select name="priority" class="hp-capture-input">' + priorityOpts + '</select>' +
              '<input type="date" name="workDue" class="hp-capture-input" />' +
              '<select name="target" class="hp-capture-input">' +
                '<option value="today" selected>Hoje</option>' +
                '<option value="inbox">Inbox</option>' +
              '</select>' +
            '</div>' +
            '<div class="hp-capture-row hp-capture-row--school" data-show-when="school">' +
              '<select name="subject" class="hp-capture-input">' + subjectOpts + '</select>' +
              '<select name="kind" class="hp-capture-input">' +
                '<option value="entrega">Entrega</option>' +
                '<option value="trabalho">Trabalho</option>' +
                '<option value="leitura">Leitura</option>' +
                '<option value="prova">Prova</option>' +
              '</select>' +
              '<input type="date" name="schoolDue" class="hp-capture-input" required />' +
            '</div>' +
          '</div>' +
          '<div class="hp-capture-actions">' +
            '<button type="submit" class="hp-btn hp-btn--primary">Registrar</button>' +
          '</div>' +
        '</div>' +
      '</form>';

    const form = document.getElementById("hpCaptureForm");
    if (form) {
      form.addEventListener("submit", onCaptureSubmit);
      form.addEventListener("click", onCaptureToggle);
    }
  }

  function onCaptureToggle(event) {
    const btn = event.target && event.target.closest ? event.target.closest("[data-capture-ctx]") : null;
    if (!btn) return;
    const form = btn.closest("form");
    if (!form) return;
    const next = btn.getAttribute("data-capture-ctx") === "school" ? "school" : "work";
    form.setAttribute("data-active", next);
    form.querySelectorAll("[data-capture-ctx]").forEach((b) => {
      b.setAttribute("aria-selected", b.getAttribute("data-capture-ctx") === next ? "true" : "false");
    });
    if (window.state) {
      window.state.appContext = next;
      try { if (typeof window.saveState === "function") window.saveState(); } catch (e) {}
    }
    document.body.setAttribute("data-context", next);
  }

  function onCaptureSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;
    const data = new FormData(form);
    const ctx = form.getAttribute("data-active") === "school" ? "school" : "work";
    const title = String(data.get("title") || "").trim();
    if (!title) return;

    if (ctx === "work") {
      const companyId = String(data.get("companyId") || "");
      const priority  = String(data.get("priority") || "medium");
      const dueDate   = String(data.get("workDue") || "");
      const target    = String(data.get("target") || "today");
      const itemKind  = String(data.get("itemKind") || "task");
      const todayIso  = toIso(new Date());
      const payload = {
        title,
        itemKind,
        companyId: companyId || null,
        scope: companyId ? "company" : "general",
        priority,
        dueDate: dueDate || null,
        scheduledDayIso: target === "today" ? todayIso : null,
        status: target === "today" ? "planned" : "inbox",
        nextAction: title
      };
      if (window.WorkPlanner && typeof window.WorkPlanner.addTask === "function") {
        try {
          window.WorkPlanner.addTask(payload);
          form.reset();
          if (typeof window.showToast === "function") window.showToast("Tarefa de trabalho registrada.");
          renderHomeDashboardV6();
        } catch (e) {
          if (typeof window.showToast === "function") window.showToast("Falha ao registrar tarefa.");
        }
      }
    } else {
      // Faculdade: cria deadline em state.deadlines
      const subjectKey = String(data.get("subject") || "");
      const kind       = String(data.get("kind") || "entrega");
      const dueDate    = String(data.get("schoolDue") || "");
      if (!dueDate) {
        if (typeof window.showToast === "function") window.showToast("Defina uma data para a entrega.");
        return;
      }
      try {
        if (!Array.isArray(window.state.deadlines)) window.state.deadlines = [];
        const id = "dl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        window.state.deadlines.push({
          id,
          title,
          subject: subjectKey || null,
          kind,
          date: dueDate,
          done: false,
          createdAt: new Date().toISOString()
        });
        if (typeof window.saveState === "function") window.saveState();
        form.reset();
        if (typeof window.showToast === "function") window.showToast("Compromisso acadêmico registrado.");
        renderHomeDashboardV6();
      } catch (e) {
        if (typeof window.showToast === "function") window.showToast("Falha ao registrar compromisso.");
      }
    }
  }

  /* ───────────────────────── Helpers comuns ───────────────────────── */

  function emptyMsg(text) {
    return '<p class="hp-empty-line">' + escapeText(text) + '</p>';
  }

  /* ───────────────────────── Render principal ───────────────────────── */

  function renderHomeDashboardV6(/* plan, queue, ref */) {
    const root = document.getElementById("homeDashboardRoot");
    if (!root) return;
    try { renderMasthead();    } catch (e) { console.error("[home-panel] masthead", e); }
    try { renderWorkColumn();  } catch (e) { console.error("[home-panel] work column", e); }
    try { renderSchoolColumn();} catch (e) { console.error("[home-panel] school column", e); }
    try { renderCapture();     } catch (e) { console.error("[home-panel] capture", e); }
    try { animateAfterRender(root); } catch (e) { /* ignore */ }
  }

  function animateAfterRender(root) {
    if (!window.Anim) return;
    const blocks = [];
    const m = root.querySelector("#hpMasthead");
    if (m) blocks.push(m);
    root.querySelectorAll(".hp-column").forEach((c) => blocks.push(c));
    const cap = root.querySelector(".hp-capture-strip");
    if (cap) blocks.push(cap);
    if (blocks.length) window.Anim.fadeUpStagger(blocks, { duration: 0.42, stagger: 0.06 });
    if (typeof window.Anim.bindHoverLiftAll === "function") {
      window.Anim.bindHoverLiftAll(".hp-co-tile-sm", root, { y: -1 });
    }
  }

  window.renderHomeDashboard = renderHomeDashboardV6;

  /* ───────────────── Eventos delegados ───────────────── */

  function setupHomePanelEvents() {
    if (document.body.getAttribute("data-home-panel-bound") === "true") return;
    document.body.setAttribute("data-home-panel-bound", "true");

    function handleNav(target, event) {
      const page = document.getElementById("homePage");
      if (!page || !page.contains(target)) return;
      if (target.classList && target.classList.contains("tb-nav-btn")) return;
      const pageName = target.getAttribute("data-nav-page");
      if (!pageName) return;
      const workFilter = target.getAttribute("data-home-work-filter");
      if (workFilter && window.WorkPlanner && typeof window.WorkPlanner.setFilter === "function") {
        try { window.WorkPlanner.setFilter(workFilter); } catch (e) {}
      }
      if (typeof window.openPage === "function") window.openPage(pageName);
      if (event) event.preventDefault();
    }

    document.addEventListener("click", function (event) {
      const t = event.target && event.target.closest ? event.target.closest("[data-nav-page]") : null;
      if (!t) return;
      handleNav(t, event);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const t = event.target && event.target.closest ? event.target.closest("[data-nav-page]") : null;
      if (!t || !t.hasAttribute("role")) return;
      handleNav(t, event);
    });
  }
  setupHomePanelEvents();

  if (window.StudyApp && typeof window.StudyApp.onStateReplaced === "function") {
    window.StudyApp.onStateReplaced(function () {
      const page = document.getElementById("homePage");
      if (page && !page.hasAttribute("hidden")) renderHomeDashboardV6();
    });
  }
  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(function () {
      const page = document.getElementById("homePage");
      if (page && !page.hasAttribute("hidden")) renderHomeDashboardV6();
    });
  }

  // Atualiza só o masthead a cada 30s
  setInterval(function () {
    const page = document.getElementById("homePage");
    if (page && !page.hasAttribute("hidden")) {
      try { renderMasthead(); } catch (e) {}
    }
  }, 30000);

  console.log("[home-panel] v6 inicializado (duas colunas paralelas)");
})();
