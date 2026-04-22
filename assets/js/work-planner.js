(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     WORK PLANNER v2 · Hub por empresa
     - Lista lateral de empresas (+ visao "Todas")
     - Workspace focado na empresa selecionada
     - Captura inline com 1 campo + expansao opcional
     - Board semanal drag-and-drop por dia
     - Prazos criticos, aguardando e notas por empresa
     Preserva o contrato: state.workTasks, state.workFilter,
     state.workWeekAnchor, WorkDomain, hooks StudyApp e globais do app-core.
     ═══════════════════════════════════════════════════════════════════ */

  function initWorkPlanner(app) {
    if (window.__workPlannerInitialized) return;
    window.__workPlannerInitialized = true;
    const appApi = app || window.StudyApp || {};
    const WD = window.WorkDomain;
    const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const WEEKDAY_FULL = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const SCOPE_FILTERS = ["today", "overdue", "waiting", "general"];
    const COMPANY_IDS = WD.COMPANIES.map((c) => c.id);

    let draggingId = null;
    let captureOpen = false;
    let captureCompanyLock = null;

    if (!Array.isArray(state.workTasks)) state.workTasks = [];
    if (!state.workFilter) state.workFilter = "all";

    let currentWeekStart = WD.getWeekStart(state.workWeekAnchor || new Date());

    /* ─────────────────────────────────────────────────────────────── */
    /* Helpers                                                         */
    /* ─────────────────────────────────────────────────────────────── */

    function esc(value) {
      if (value == null) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function fmtDateShort(date) {
      return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
    }

    function fmtIsoShort(iso) {
      const d = WD.parseIso(iso);
      return d ? fmtDateShort(d) : "sem prazo";
    }

    function relativeDueLabel(iso) {
      if (!iso) return "Sem prazo";
      const today = WD.parseIso(WD.todayIso());
      const due = WD.parseIso(iso);
      if (!today || !due) return "Sem prazo";
      const diff = Math.round((due - today) / 86400000);
      if (diff === 0) return "Hoje";
      if (diff === 1) return "Amanha";
      if (diff === -1) return "Ontem";
      if (diff < 0) return Math.abs(diff) + " dias atras";
      if (diff < 7) return "em " + diff + " dias";
      return fmtDateShort(due);
    }

    function currentWeekIsos() {
      return WD.getWeekDays(currentWeekStart).map((d) => d.iso);
    }

    function currentFilter() {
      const allowed = ["all"].concat(SCOPE_FILTERS).concat(COMPANY_IDS);
      return allowed.indexOf(state.workFilter) === -1 ? "all" : state.workFilter;
    }

    function currentCompanyMeta() {
      const f = currentFilter();
      return WD.companyMeta(f);
    }

    function isCompanyFilter() {
      return !!currentCompanyMeta();
    }

    function logoMarkHtml(company, size) {
      const meta = WD.companyMeta(company.id) || company;
      const sz = size || "md";
      const blend = meta.logoBlend && meta.logoBlend !== "normal"
        ? ' style="mix-blend-mode:' + esc(meta.logoBlend) + ';"'
        : "";
      return '<span class="wk-logo wk-logo--' + sz + ' wk-logo--' + esc(meta.logoSurface || "brand-light") + '" data-company-id="' + esc(company.id) + '">' +
        '<img src="' + esc(meta.logoPath) + '" alt="" aria-hidden="true"' + blend + ' loading="lazy" decoding="async" />' +
        '</span>';
    }

    function visibleTasksFor(filterKey) {
      return WD.applyFilter(state.workTasks || [], filterKey || currentFilter(), WD.todayIso());
    }

    function openTasks() {
      return (state.workTasks || []).filter(WD.isOpen);
    }

    function saveAndRefresh(message) {
      saveState();
      if (message && typeof showToast === "function") showToast(message);
      renderWorkPlanner();
      if (state.currentPage !== "work" && typeof appApi.requestRender === "function") {
        appApi.requestRender();
      }
    }

    function persistWeekAnchor() {
      state.workWeekAnchor = WD.toIsoDate(currentWeekStart);
      saveState();
    }

    function taskIdFrom(event) {
      const card = event.target && event.target.closest ? event.target.closest("[data-work-task-id]") : null;
      return card ? card.getAttribute("data-work-task-id") : null;
    }

    function applyFilterChange(next) {
      state.workFilter = next || "all";
      captureOpen = false;
      captureCompanyLock = null;
      saveState();
      renderWorkPlanner();
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Task card                                                       */
    /* ─────────────────────────────────────────────────────────────── */

    function taskCardHtml(task, opts) {
      const options = opts || {};
      const today = WD.todayIso();
      const overdue = WD.isOverdue(task, today);
      const due = task.dueDate ? relativeDueLabel(task.dueDate) : "Sem prazo";
      const hasCompany = task.scope === "company" && task.companyId;
      const companyName = hasCompany ? WD.companyName(task.companyId) : "Geral";
      const prio = WD.priorityLabel(task.priority);
      const statusLabel = WD.statusLabel(task.status);
      const area = WD.areaLabel(task.area);
      const draggable = options.draggable !== false;
      const density = options.density || "normal";

      const chipsHtml =
        (options.hideCompanyChip || !hasCompany
          ? ""
          : '<span class="wk-chip wk-chip--company" data-company-id="' + esc(task.companyId) + '">' +
              logoMarkHtml({ id: task.companyId }, "xs") +
              '<span>' + esc(companyName) + '</span>' +
            '</span>') +
        '<span class="wk-chip wk-chip--prio wk-chip--' + esc(task.priority) + '">' + esc(prio) + '</span>' +
        '<span class="wk-chip wk-chip--due' + (overdue ? ' wk-chip--danger' : '') + '">' + esc(due) + '</span>' +
        (area && task.area ? '<span class="wk-chip wk-chip--area">' + esc(area) + '</span>' : '') +
        (task.status && task.status !== "inbox" && task.status !== "planned"
          ? '<span class="wk-chip wk-chip--status wk-chip--' + esc(task.status) + '">' + esc(statusLabel) + '</span>'
          : '');

      const statusButton = task.status === "waiting"
        ? '<button class="wk-btn wk-btn--mini" type="button" data-work-status="planned" title="Retomar">Retomar</button>'
        : '<button class="wk-btn wk-btn--mini" type="button" data-work-status="waiting" title="Aguardar terceiros">Aguardar</button>';

      return '<article class="wk-task wk-task--' + density +
        '" data-work-task-id="' + esc(task.id) +
        '" data-priority="' + esc(task.priority) + '"' +
        (hasCompany ? ' data-company-id="' + esc(task.companyId) + '"' : '') +
        (overdue ? ' data-overdue="true"' : '') +
        (task.status === "done" ? ' data-done="true"' : '') +
        (draggable ? ' draggable="true"' : '') +
        '>' +
          '<label class="wk-task-check">' +
            '<input type="checkbox" class="wk-task-checkbox"' + (task.status === "done" ? ' checked' : '') + ' aria-label="Concluir tarefa" />' +
          '</label>' +
          '<div class="wk-task-body">' +
            '<div class="wk-task-title">' + esc(task.title) + '</div>' +
            (task.nextAction && task.nextAction !== task.title
              ? '<div class="wk-task-next"><span aria-hidden="true">→</span>' + esc(task.nextAction) + '</div>'
              : '') +
            (task.description
              ? '<div class="wk-task-notes">' + esc(task.description) + '</div>'
              : '') +
            '<div class="wk-task-chips">' + chipsHtml + '</div>' +
          '</div>' +
          '<div class="wk-task-actions">' +
            statusButton +
            (task.status !== "inbox"
              ? '<button class="wk-btn wk-btn--mini" type="button" data-work-move-inbox="true" title="Mover para inbox">Inbox</button>'
              : '') +
            '<button class="wk-btn wk-btn--mini wk-btn--danger" type="button" data-work-delete="true" aria-label="Excluir tarefa" title="Excluir">×</button>' +
          '</div>' +
        '</article>';
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Sidebar                                                         */
    /* ─────────────────────────────────────────────────────────────── */

    function renderSidebar() {
      const el = document.getElementById("workSidebar");
      if (!el) return;
      const today = WD.todayIso();
      const tasks = state.workTasks || [];
      const active = currentFilter();

      const counts = {
        all: tasks.filter(WD.isOpen).length,
        today: tasks.filter((t) => WD.isToday(t, today)).length,
        overdue: tasks.filter((t) => WD.isOverdue(t, today)).length,
        waiting: tasks.filter(WD.isWaiting).length,
        general: tasks.filter((t) => WD.isOpen(t) && t.scope === "general").length
      };

      const globalFiltersHtml = [
        scopeBtnHtml("all", "Todas as tarefas", counts.all, active === "all"),
        scopeBtnHtml("today", "Hoje", counts.today, active === "today"),
        scopeBtnHtml("overdue", "Atrasadas", counts.overdue, active === "overdue"),
        scopeBtnHtml("waiting", "Aguardando", counts.waiting, active === "waiting"),
        scopeBtnHtml("general", "Geral", counts.general, active === "general")
      ].join("");

      const companiesHtml = WD.COMPANIES.map((company) => {
        const s = WD.companySummaries(tasks, today, currentWeekIsos())
          .find((item) => item.company.id === company.id) || { openCount: 0, overdueCount: 0, waitingCount: 0 };
        const isActive = active === company.id;
        const tone = s.overdueCount ? "danger" : (s.waitingCount ? "warning" : "quiet");
        const badge = s.overdueCount
          ? '<span class="wk-pill wk-pill--danger">' + s.overdueCount + ' atraso</span>'
          : (s.waitingCount ? '<span class="wk-pill wk-pill--warning">' + s.waitingCount + ' aguard.</span>' : '');
        return '<button type="button" class="wk-company-row" data-work-filter="' + esc(company.id) + '" data-tone="' + tone + '"' + (isActive ? ' data-active="true"' : '') + '>' +
          logoMarkHtml(company, "md") +
          '<span class="wk-company-row-body">' +
            '<span class="wk-company-row-name">' + esc(company.name) + '</span>' +
            '<span class="wk-company-row-sub">' +
              '<span class="wk-company-row-count">' + s.openCount + ' abertas</span>' +
              badge +
            '</span>' +
          '</span>' +
        '</button>';
      }).join("");

      el.innerHTML =
        '<div class="wk-side-header">' +
          '<span class="wk-side-eyebrow">Portfolio FIPs</span>' +
          '<h2 class="wk-side-title">Motor executivo</h2>' +
        '</div>' +
        '<button type="button" class="wk-capture-trigger" data-work-capture-toggle="true">' +
          '<span class="wk-capture-trigger-icon" aria-hidden="true">+</span>' +
          '<span>Capturar tarefa</span>' +
          '<kbd>N</kbd>' +
        '</button>' +
        '<div class="wk-side-group">' +
          '<div class="wk-side-group-label">Visoes</div>' +
          globalFiltersHtml +
        '</div>' +
        '<div class="wk-side-group">' +
          '<div class="wk-side-group-label">Empresas</div>' +
          companiesHtml +
        '</div>';
    }

    function scopeBtnHtml(key, label, count, isActive) {
      return '<button type="button" class="wk-side-link" data-work-filter="' + esc(key) + '"' + (isActive ? ' data-active="true"' : '') + '>' +
        '<span>' + esc(label) + '</span>' +
        '<span class="wk-count">' + count + '</span>' +
      '</button>';
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Workspace header                                                */
    /* ─────────────────────────────────────────────────────────────── */

    function renderWorkspaceHeader() {
      const el = document.getElementById("workWorkspaceHeader");
      if (!el) return;
      const today = WD.todayIso();
      const filter = currentFilter();
      const company = currentCompanyMeta();
      const weekStart = currentWeekStart;
      const weekEnd = WD.addDays(weekStart, 6);
      const weekLabel = fmtDateShort(weekStart) + " - " + fmtDateShort(weekEnd) + " · " + WEEKDAY_FULL[weekStart.getDay()] + " a " + WEEKDAY_FULL[weekEnd.getDay()];

      let eyebrow = "Todas as tarefas";
      let title = "Centro de comando do portfolio";
      let subtitle = "Uma visao consolidada das 3 investidas e tarefas gerais.";
      let logoHtml = "";
      let accentStyle = "";
      let pillHtml = "";

      const tasks = state.workTasks || [];
      const open = tasks.filter(WD.isOpen);
      const weekSet = new Set(currentWeekIsos());

      let openCount, weekCount, overdueCount, waitingCount, todayCount;
      let scoped;

      if (company) {
        scoped = tasks.filter((t) => t.companyId === company.id);
        eyebrow = "Investida";
        title = company.name;
        subtitle = "Tocando o dia a dia. Prazos, proximas acoes e aguardos.";
        logoHtml = logoMarkHtml(company, "xl");
        accentStyle = ' style="--wk-accent: ' + esc(company.accent) + '"';
        const openS = scoped.filter(WD.isOpen);
        openCount = openS.length;
        todayCount = openS.filter((t) => WD.isToday(t, today)).length;
        weekCount = openS.filter((t) => weekSet.has(t.scheduledDayIso) || weekSet.has(t.dueDate)).length;
        overdueCount = openS.filter((t) => WD.isOverdue(t, today)).length;
        waitingCount = openS.filter(WD.isWaiting).length;
        pillHtml = overdueCount
          ? '<span class="wk-state-pill wk-state-pill--danger">' + overdueCount + ' em atraso</span>'
          : (waitingCount
              ? '<span class="wk-state-pill wk-state-pill--warning">' + waitingCount + ' aguardando</span>'
              : '<span class="wk-state-pill wk-state-pill--success">sem pressao</span>');
      } else {
        if (filter === "today") { eyebrow = "Visao"; title = "Foco de hoje"; subtitle = "Tudo que precisa sair hoje."; }
        else if (filter === "overdue") { eyebrow = "Visao"; title = "Atrasadas"; subtitle = "Prazos estourados. Fechar ou replanejar."; }
        else if (filter === "waiting") { eyebrow = "Visao"; title = "Aguardando terceiros"; subtitle = "Dependencias externas em andamento."; }
        else if (filter === "general") { eyebrow = "Visao"; title = "Tarefas gerais"; subtitle = "Sem empresa associada."; }
        openCount = open.length;
        todayCount = open.filter((t) => WD.isToday(t, today)).length;
        weekCount = open.filter((t) => weekSet.has(t.scheduledDayIso) || weekSet.has(t.dueDate)).length;
        overdueCount = open.filter((t) => WD.isOverdue(t, today)).length;
        waitingCount = open.filter(WD.isWaiting).length;
      }

      el.innerHTML =
        '<div class="wk-ws-head"' + accentStyle + '>' +
          '<div class="wk-ws-head-left">' +
            (logoHtml ? '<div class="wk-ws-head-logo">' + logoHtml + '</div>' : '') +
            '<div class="wk-ws-head-copy">' +
              '<span class="wk-eyebrow">' + esc(eyebrow) + '</span>' +
              '<h1 class="wk-ws-title">' + esc(title) + '</h1>' +
              '<p class="wk-ws-sub">' + esc(subtitle) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="wk-ws-head-right">' +
            '<div class="wk-ws-week">' +
              '<span class="wk-eyebrow">Semana</span>' +
              '<span class="wk-ws-week-label">' + esc(weekLabel) + '</span>' +
              '<div class="wk-ws-week-ctrls">' +
                '<button class="wk-btn wk-btn--ghost" type="button" id="workPrevBtn" aria-keyshortcuts="Alt+Shift+ArrowLeft" title="Semana anterior">‹</button>' +
                '<button class="wk-btn wk-btn--ghost" type="button" id="workTodayBtn" aria-keyshortcuts="Alt+Shift+0">Hoje</button>' +
                '<button class="wk-btn wk-btn--ghost" type="button" id="workNextBtn" aria-keyshortcuts="Alt+Shift+ArrowRight" title="Proxima semana">›</button>' +
              '</div>' +
            '</div>' +
            (pillHtml ? '<div class="wk-ws-state">' + pillHtml + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="wk-kpis">' +
          kpiHtml("Abertas", openCount, "ativas") +
          kpiHtml("Hoje", todayCount, "no foco") +
          kpiHtml("Semana", weekCount, "planejadas") +
          kpiHtml("Atrasadas", overdueCount, "prazo vencido", overdueCount ? "danger" : "") +
          kpiHtml("Aguardando", waitingCount, "terceiros", waitingCount ? "warning" : "") +
        '</div>';
    }

    function kpiHtml(label, value, sub, tone) {
      return '<div class="wk-kpi' + (tone ? ' wk-kpi--' + tone : '') + '">' +
        '<div class="wk-kpi-value">' + value + '</div>' +
        '<div class="wk-kpi-label">' + esc(label) + '</div>' +
        '<div class="wk-kpi-sub">' + esc(sub) + '</div>' +
      '</div>';
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Captura inline                                                  */
    /* ─────────────────────────────────────────────────────────────── */

    function renderCapture() {
      const el = document.getElementById("workCapture");
      if (!el) return;
      if (!captureOpen) {
        el.innerHTML = '';
        el.dataset.open = "false";
        return;
      }
      el.dataset.open = "true";
      const company = captureCompanyLock || currentCompanyMeta();
      const companyLockedHtml = company
        ? '<div class="wk-cap-lock">' +
            logoMarkHtml(company, "sm") +
            '<span>' + esc(company.name) + '</span>' +
            '<button class="wk-btn wk-btn--mini wk-btn--ghost" type="button" data-work-unlock-company="true">trocar empresa</button>' +
          '</div>'
        : '';

      const companySelectHtml = company
        ? ''
        : '<label class="wk-cap-field"><span>Empresa</span><select name="companyId">' +
            '<option value="">Geral</option>' +
            WD.COMPANIES.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join("") +
          '</select></label>';

      const daySelectHtml = '<label class="wk-cap-field"><span>Quando</span><select name="scheduledDayIso">' +
        '<option value="">Inbox (sem dia)</option>' +
        WD.getWeekDays(currentWeekStart).map((d) =>
          '<option value="' + d.iso + '"' + (d.iso === WD.todayIso() ? ' selected' : '') + '>' +
            WEEKDAY_FULL[d.date.getDay()] + ' · ' + fmtDateShort(d.date) +
          '</option>'
        ).join("") +
      '</select></label>';

      const prioritySelectHtml = '<label class="wk-cap-field"><span>Prioridade</span><select name="priority">' +
        WD.PRIORITIES.map((p) => '<option value="' + esc(p.value) + '"' + (p.value === "medium" ? ' selected' : '') + '>' + esc(p.label) + '</option>').join("") +
      '</select></label>';

      const areaSelectHtml = '<label class="wk-cap-field"><span>Area</span><select name="area">' +
        WD.AREAS.map((a) => '<option value="' + esc(a.value) + '"' + (a.value === "followup" ? ' selected' : '') + '>' + esc(a.label) + '</option>').join("") +
      '</select></label>';

      el.innerHTML =
        '<form id="workCaptureForm" class="wk-cap-form" autocomplete="off">' +
          (company ? '<input type="hidden" name="companyId" value="' + esc(company.id) + '" />' : '') +
          companyLockedHtml +
          '<div class="wk-cap-main">' +
            '<input type="text" class="wk-cap-title" name="title" maxlength="180" required autofocus placeholder="O que precisa andar? (Enter para capturar)" />' +
            '<button class="wk-btn wk-btn--primary" type="submit">Capturar</button>' +
            '<button class="wk-btn wk-btn--ghost" type="button" data-work-capture-toggle="true">Cancelar</button>' +
          '</div>' +
          '<div class="wk-cap-next">' +
            '<input type="text" name="nextAction" maxlength="220" placeholder="Proxima acao concreta (opcional)" />' +
          '</div>' +
          '<div class="wk-cap-grid">' +
            companySelectHtml +
            daySelectHtml +
            '<label class="wk-cap-field"><span>Prazo real</span><input type="date" name="dueDate" /></label>' +
            prioritySelectHtml +
            areaSelectHtml +
          '</div>' +
          '<details class="wk-cap-more"><summary>Notas</summary>' +
            '<textarea name="description" rows="2" maxlength="1000" placeholder="Contexto minimo, links ou observacoes"></textarea>' +
          '</details>' +
        '</form>';

      // Auto-foco
      const titleInput = el.querySelector(".wk-cap-title");
      if (titleInput) setTimeout(() => titleInput.focus(), 10);
    }

    function openCapture(forCompany) {
      captureOpen = true;
      captureCompanyLock = forCompany ? (WD.companyMeta(forCompany) || null) : currentCompanyMeta();
      renderCapture();
    }

    function closeCapture() {
      captureOpen = false;
      captureCompanyLock = null;
      renderCapture();
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Board semanal + listas                                          */
    /* ─────────────────────────────────────────────────────────────── */

    function renderBoard() {
      const el = document.getElementById("workBoard");
      if (!el) return;
      const today = WD.todayIso();
      const company = currentCompanyMeta();
      const scoped = company
        ? (state.workTasks || []).filter((t) => t.companyId === company.id)
        : visibleTasksFor(currentFilter());
      const openScoped = scoped.filter(WD.isOpen);

      const days = WD.getWeekDays(currentWeekStart);
      const dayColsHtml = days.map((day) => {
        const dayTasks = WD.sortTasks(openScoped.filter((t) => t.scheduledDayIso === day.iso), today);
        const isToday = day.iso === today;
        const count = dayTasks.length;
        const weekday = WEEKDAY_NAMES[day.date.getDay()];
        return '<div class="wk-day wk-drop-zone" data-work-drop="day" data-day-iso="' + day.iso + '"' + (isToday ? ' data-today="true"' : '') + '>' +
          '<div class="wk-day-head">' +
            '<div class="wk-day-head-main">' +
              '<span class="wk-day-weekday">' + esc(weekday) + '</span>' +
              '<span class="wk-day-date">' + fmtDateShort(day.date) + '</span>' +
            '</div>' +
            '<span class="wk-day-count">' + count + '</span>' +
          '</div>' +
          '<div class="wk-day-list">' +
            (dayTasks.length
              ? dayTasks.map((t) => taskCardHtml(t, { density: "compact", hideCompanyChip: !!company })).join("")
              : '<div class="wk-day-empty">arraste aqui</div>') +
          '</div>' +
        '</div>';
      }).join("");

      // Pool de nao-agendadas (substitui inbox em workspace por empresa)
      const unscheduled = WD.sortTasks(openScoped.filter((t) => !t.scheduledDayIso), today);
      const unschedHtml = unscheduled.length
        ? unscheduled.map((t) => taskCardHtml(t, { density: "compact", hideCompanyChip: !!company })).join("")
        : '<div class="wk-day-empty wk-day-empty--lg">Nenhuma tarefa nao planejada. Use <strong>Capturar tarefa</strong> para adicionar.</div>';

      el.innerHTML =
        '<div class="wk-board-head">' +
          '<h2 class="wk-section-title">Planner da semana</h2>' +
          '<span class="wk-muted">Arraste cards entre os dias. ' + (company ? esc(company.name) : "Visao: " + esc(scopeLabel(currentFilter()))) + '</span>' +
        '</div>' +
        '<div class="wk-board">' + dayColsHtml + '</div>' +
        '<div class="wk-unsched">' +
          '<div class="wk-unsched-head">' +
            '<h3 class="wk-section-title wk-section-title--sm">Nao planejadas</h3>' +
            '<span class="wk-muted">' + unscheduled.length + ' abertas sem dia · arraste para um dia da semana</span>' +
          '</div>' +
          '<div class="wk-unsched-list wk-drop-zone" data-work-drop="inbox">' + unschedHtml + '</div>' +
        '</div>';
    }

    function scopeLabel(key) {
      if (key === "today") return "Hoje";
      if (key === "overdue") return "Atrasadas";
      if (key === "waiting") return "Aguardando";
      if (key === "general") return "Gerais";
      return "todas";
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Prazos criticos + aguardando (aside)                            */
    /* ─────────────────────────────────────────────────────────────── */

    function renderAside() {
      const el = document.getElementById("workAside");
      if (!el) return;
      const today = WD.todayIso();
      const company = currentCompanyMeta();
      const base = company
        ? (state.workTasks || []).filter((t) => t.companyId === company.id)
        : (state.workTasks || []);
      const buckets = WD.dashboardBuckets(base, today, currentWeekStart);

      const criticalList = buckets.critical.slice(0, 8);
      const waitingList = buckets.waiting.slice(0, 8);

      const criticalHtml = criticalList.length
        ? criticalList.map((t) => taskCardHtml(t, { density: "compact", draggable: false, hideCompanyChip: !!company })).join("")
        : '<div class="wk-empty">Sem prazo critico.</div>';

      const waitingHtml = waitingList.length
        ? waitingList.map((t) => {
            const since = t.waitingSince ? new Date(t.waitingSince) : null;
            const daysAgo = since ? Math.max(0, Math.round((Date.now() - since.getTime()) / 86400000)) : null;
            const ageChip = daysAgo !== null
              ? '<span class="wk-chip wk-chip--age">' + (daysAgo === 0 ? "hoje" : daysAgo + "d aguard.") + '</span>'
              : '';
            return '<article class="wk-mini-task" data-work-task-id="' + esc(t.id) + '">' +
              '<div class="wk-mini-task-title">' + esc(t.title) + '</div>' +
              '<div class="wk-mini-task-meta">' +
                (!company && t.companyId ? '<span class="wk-chip wk-chip--company">' + esc(WD.companyName(t.companyId)) + '</span>' : '') +
                ageChip +
                (t.nextAction ? '<span class="wk-mini-task-next">→ ' + esc(t.nextAction) + '</span>' : '') +
              '</div>' +
              '<div class="wk-mini-task-actions">' +
                '<button class="wk-btn wk-btn--mini" type="button" data-work-status="planned">Retomar</button>' +
                '<button class="wk-btn wk-btn--mini" type="button" data-work-status="done">Resolvido</button>' +
              '</div>' +
            '</article>';
          }).join("")
        : '<div class="wk-empty">Nada aguardando.</div>';

      const nextActionsHtml = company
        ? renderNextActionsForCompany(company, base.filter(WD.isOpen), today)
        : renderPortfolioResume(today);

      el.innerHTML =
        '<section class="wk-aside-card">' +
          '<div class="wk-aside-head">' +
            '<h3 class="wk-section-title wk-section-title--sm">Prazos criticos</h3>' +
            '<span class="wk-count wk-count--danger">' + buckets.critical.length + '</span>' +
          '</div>' +
          '<div class="wk-aside-list">' + criticalHtml + '</div>' +
        '</section>' +
        '<section class="wk-aside-card">' +
          '<div class="wk-aside-head">' +
            '<h3 class="wk-section-title wk-section-title--sm">Aguardando terceiros</h3>' +
            '<span class="wk-count wk-count--warning">' + buckets.waiting.length + '</span>' +
          '</div>' +
          '<div class="wk-aside-list">' + waitingHtml + '</div>' +
        '</section>' +
        nextActionsHtml;
    }

    function renderNextActionsForCompany(company, openTasks, today) {
      const top = WD.sortTasks(openTasks, today).slice(0, 6);
      const list = top.length
        ? '<ol class="wk-next-list">' + top.map((t) =>
            '<li>' +
              '<div class="wk-next-text">' + esc(t.nextAction || t.title) + '</div>' +
              '<div class="wk-next-meta">' +
                '<span>' + esc(t.dueDate ? relativeDueLabel(t.dueDate) : "sem prazo") + '</span>' +
                '<span>·</span>' +
                '<span>' + esc(WD.priorityLabel(t.priority)) + '</span>' +
                '<span>·</span>' +
                '<span>' + esc(WD.statusLabel(t.status)) + '</span>' +
              '</div>' +
            '</li>'
          ).join("") + '</ol>'
        : '<div class="wk-empty">Nenhuma proxima acao ativa.</div>';
      return '<section class="wk-aside-card">' +
        '<div class="wk-aside-head">' +
          '<h3 class="wk-section-title wk-section-title--sm">Proximas acoes · ' + esc(company.name) + '</h3>' +
        '</div>' +
        list +
      '</section>';
    }

    function renderPortfolioResume(today) {
      const summaries = WD.companySummaries(state.workTasks || [], today, currentWeekIsos());
      return '<section class="wk-aside-card">' +
        '<div class="wk-aside-head">' +
          '<h3 class="wk-section-title wk-section-title--sm">Resumo do portfolio</h3>' +
        '</div>' +
        '<div class="wk-portfolio">' + summaries.map((s) => {
          const tone = s.overdueCount ? "danger" : (s.waitingCount ? "warning" : "success");
          const stateLabel = s.overdueCount
            ? s.overdueCount + " em atraso"
            : (s.waitingCount ? s.waitingCount + " aguardando" : "fluxo limpo");
          return '<button type="button" class="wk-portfolio-row" data-work-filter="' + esc(s.company.id) + '" data-tone="' + tone + '">' +
            logoMarkHtml(s.company, "sm") +
            '<div class="wk-portfolio-row-body">' +
              '<div class="wk-portfolio-row-top">' +
                '<strong>' + esc(s.company.name) + '</strong>' +
                '<span class="wk-pill wk-pill--' + tone + '">' + esc(stateLabel) + '</span>' +
              '</div>' +
              '<div class="wk-portfolio-row-nums">' +
                '<span><strong>' + s.openCount + '</strong> abertas</span>' +
                '<span><strong>' + s.weekCount + '</strong> semana</span>' +
                '<span><strong>' + s.overdueCount + '</strong> atrasadas</span>' +
                '<span><strong>' + s.waitingCount + '</strong> aguard.</span>' +
              '</div>' +
            '</div>' +
          '</button>';
        }).join("") + '</div>' +
      '</section>';
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Render root                                                     */
    /* ─────────────────────────────────────────────────────────────── */

    function renderWorkPlanner() {
      renderSidebar();
      renderWorkspaceHeader();
      renderCapture();
      renderBoard();
      renderAside();
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* CRUD                                                             */
    /* ─────────────────────────────────────────────────────────────── */

    function addTask(input, message) {
      const task = WD.createTask(input || {});
      state.workTasks.push(task);
      saveAndRefresh(message || "Tarefa capturada.");
      return task;
    }

    function updateTask(id, patch, message) {
      const idx = (state.workTasks || []).findIndex((t) => t.id === id);
      if (idx === -1) return null;
      state.workTasks[idx] = WD.patchTask(state.workTasks[idx], patch || {});
      saveAndRefresh(message || "Tarefa atualizada.");
      return state.workTasks[idx];
    }

    function deleteTask(id) {
      const before = state.workTasks.length;
      state.workTasks = state.workTasks.filter((t) => t.id !== id);
      if (state.workTasks.length !== before) saveAndRefresh("Tarefa removida.");
    }

    function collectForm(form) {
      const data = new FormData(form);
      return {
        title: data.get("title"),
        nextAction: data.get("nextAction") || data.get("title"),
        description: data.get("description") || "",
        scope: data.get("companyId") ? "company" : "general",
        companyId: data.get("companyId") || null,
        scheduledDayIso: data.get("scheduledDayIso") || "",
        dueDate: data.get("dueDate") || "",
        priority: data.get("priority") || "medium",
        status: data.get("scheduledDayIso") ? "planned" : "inbox",
        area: data.get("area") || "followup"
      };
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* Eventos                                                          */
    /* ─────────────────────────────────────────────────────────────── */

    function setupEvents() {
      const page = document.getElementById("workPage");
      if (!page || page.getAttribute("data-work-bound") === "true") return;
      page.setAttribute("data-work-bound", "true");

      page.addEventListener("click", function (event) {
        const filterBtn = event.target.closest("[data-work-filter]");
        if (filterBtn) {
          applyFilterChange(filterBtn.getAttribute("data-work-filter"));
          return;
        }
        const toggleCapture = event.target.closest("[data-work-capture-toggle]");
        if (toggleCapture) {
          captureOpen ? closeCapture() : openCapture();
          return;
        }
        const unlock = event.target.closest("[data-work-unlock-company]");
        if (unlock) {
          captureCompanyLock = null;
          renderCapture();
          return;
        }
        const statusBtn = event.target.closest("[data-work-status]");
        if (statusBtn) {
          const id = taskIdFrom(event);
          if (id) updateTask(id, { status: statusBtn.getAttribute("data-work-status") });
          return;
        }
        const inboxBtn = event.target.closest("[data-work-move-inbox]");
        if (inboxBtn) {
          const id = taskIdFrom(event);
          if (id) updateTask(id, { scheduledDayIso: null, status: "inbox" }, "Tarefa movida para inbox.");
          return;
        }
        const deleteBtn = event.target.closest("[data-work-delete]");
        if (deleteBtn) {
          const id = taskIdFrom(event);
          if (id) deleteTask(id);
          return;
        }
        const prevBtn = event.target.closest("#workPrevBtn");
        if (prevBtn) { currentWeekStart = WD.addDays(currentWeekStart, -7); persistWeekAnchor(); renderWorkPlanner(); return; }
        const todayBtn = event.target.closest("#workTodayBtn");
        if (todayBtn) { currentWeekStart = WD.getWeekStart(new Date()); persistWeekAnchor(); renderWorkPlanner(); return; }
        const nextBtn = event.target.closest("#workNextBtn");
        if (nextBtn) { currentWeekStart = WD.addDays(currentWeekStart, 7); persistWeekAnchor(); renderWorkPlanner(); return; }
      });

      page.addEventListener("change", function (event) {
        const cb = event.target.closest(".wk-task-checkbox");
        if (!cb) return;
        const id = taskIdFrom(event);
        if (!id) return;
        const task = state.workTasks.find((t) => t.id === id);
        const fallback = task && task.scheduledDayIso ? "planned" : "inbox";
        updateTask(id, { status: cb.checked ? "done" : fallback }, cb.checked ? "Tarefa concluida." : "Tarefa reaberta.");
      });

      page.addEventListener("submit", function (event) {
        const form = event.target.closest("#workCaptureForm");
        if (!form) return;
        event.preventDefault();
        const payload = collectForm(form);
        if (!String(payload.title || "").trim()) return;
        addTask(payload, "Tarefa capturada.");
        closeCapture();
      });

      page.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && captureOpen) {
          event.preventDefault();
          closeCapture();
          return;
        }
        const target = event.target;
        const isEditable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
        if (!isEditable && (event.key === "n" || event.key === "N")) {
          event.preventDefault();
          openCapture();
        }
      });

      // Drag & drop
      page.addEventListener("dragstart", function (event) {
        const card = event.target.closest("[data-work-task-id]");
        if (!card || card.getAttribute("draggable") !== "true") return;
        draggingId = card.getAttribute("data-work-task-id");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggingId);
        card.setAttribute("data-dragging", "true");
      });
      page.addEventListener("dragend", function () {
        draggingId = null;
        document.querySelectorAll("[data-dragging], .wk-drop-zone[data-drag-over]").forEach((el) => {
          el.removeAttribute("data-dragging");
          el.removeAttribute("data-drag-over");
        });
      });
      page.addEventListener("dragover", function (event) {
        const zone = event.target.closest(".wk-drop-zone");
        if (!zone || !draggingId) return;
        event.preventDefault();
        zone.setAttribute("data-drag-over", "true");
      });
      page.addEventListener("dragleave", function (event) {
        const zone = event.target.closest(".wk-drop-zone");
        if (zone) zone.removeAttribute("data-drag-over");
      });
      page.addEventListener("drop", function (event) {
        const zone = event.target.closest(".wk-drop-zone");
        if (!zone) return;
        event.preventDefault();
        const id = draggingId || event.dataTransfer.getData("text/plain");
        if (!id) return;
        if (zone.getAttribute("data-work-drop") === "inbox") {
          updateTask(id, { scheduledDayIso: null, status: "inbox" }, "Movida para nao planejadas.");
        } else {
          const dayIso = zone.getAttribute("data-day-iso");
          updateTask(id, { scheduledDayIso: dayIso, status: "planned" }, "Agendada para " + fmtIsoShort(dayIso) + ".");
        }
        draggingId = null;
      });

      // Atalhos globais Alt+Shift+Arrows funcionam so no workPage visivel
      if (!document.body.getAttribute("data-work-shortcuts-bound")) {
        document.body.setAttribute("data-work-shortcuts-bound", "true");
        document.addEventListener("keydown", function (event) {
          if (!page || page.hasAttribute("hidden")) return;
          const t = event.target;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
          if (event.altKey && event.shiftKey && event.key === "ArrowLeft") {
            event.preventDefault(); currentWeekStart = WD.addDays(currentWeekStart, -7); persistWeekAnchor(); renderWorkPlanner();
          } else if (event.altKey && event.shiftKey && event.key === "ArrowRight") {
            event.preventDefault(); currentWeekStart = WD.addDays(currentWeekStart, 7); persistWeekAnchor(); renderWorkPlanner();
          } else if (event.altKey && event.shiftKey && event.key === "0") {
            event.preventDefault(); currentWeekStart = WD.getWeekStart(new Date()); persistWeekAnchor(); renderWorkPlanner();
          }
        });
      }

      setupHomeQuickCapture();
      setupObserver();
    }

    function setupHomeQuickCapture() {
      if (document.body.getAttribute("data-home-work-capture-bound") === "true") return;
      document.body.setAttribute("data-home-work-capture-bound", "true");
      document.addEventListener("submit", function (event) {
        const form = event.target.closest("#homeQuickCaptureForm");
        if (!form) return;
        event.preventDefault();
        const data = new FormData(form);
        const target = String(data.get("target") || "inbox");
        const companyId = String(data.get("companyId") || "");
        const payload = {
          title: data.get("title"),
          nextAction: data.get("nextAction") || data.get("title"),
          scope: companyId ? "company" : "general",
          companyId: companyId || null,
          scheduledDayIso: target === "today" ? WD.todayIso() : "",
          dueDate: data.get("dueDate") || "",
          priority: data.get("priority") || "medium",
          status: target === "today" ? "planned" : "inbox",
          area: "followup",
          description: ""
        };
        if (!String(payload.title || "").trim()) return;
        addTask(payload, "Captura rapida adicionada.");
        form.reset();
        if (typeof appApi.requestRender === "function") appApi.requestRender();
      });
      document.addEventListener("click", function (event) {
        const openWork = event.target.closest("[data-open-work]");
        if (openWork && typeof openPage === "function") {
          openPage("work");
        }
        const filter = event.target.closest("[data-home-work-filter]");
        if (filter && typeof openPage === "function") {
          state.workFilter = filter.getAttribute("data-home-work-filter") || "all";
          saveState();
          openPage("work");
        }
      });
    }

    function setupObserver() {
      const page = document.getElementById("workPage");
      if (!page || page.getAttribute("data-observer-bound") === "true") return;
      page.setAttribute("data-observer-bound", "true");
      const observer = new MutationObserver(function () {
        if (!page.hasAttribute("hidden")) renderWorkPlanner();
      });
      observer.observe(page, { attributes: true, attributeFilter: ["hidden"] });
    }

    /* ─────────────────────────────────────────────────────────────── */
    /* API publica                                                      */
    /* ─────────────────────────────────────────────────────────────── */

    window.WorkPlanner = {
      render: renderWorkPlanner,
      addTask: addTask,
      updateTask: updateTask,
      deleteTask: deleteTask,
      openCapture: openCapture,
      closeCapture: closeCapture,
      setFilter: applyFilterChange,
      getCurrentWeekStart: function () { return new Date(currentWeekStart.getTime()); }
    };

    setupEvents();
    renderWorkPlanner();

    if (typeof appApi.onStateReplaced === "function") {
      appApi.onStateReplaced(function () {
        if (!Array.isArray(state.workTasks)) state.workTasks = [];
        if (!state.workFilter) state.workFilter = "all";
        const page = document.getElementById("workPage");
        if (page && !page.hasAttribute("hidden")) renderWorkPlanner();
        if (typeof appApi.requestRender === "function") appApi.requestRender();
      });
    }

    console.log("[workPlanner] v2 inicializado");
  }

  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(initWorkPlanner);
  } else {
    setTimeout(function () { initWorkPlanner(window.StudyApp); }, 0);
  }
})();
