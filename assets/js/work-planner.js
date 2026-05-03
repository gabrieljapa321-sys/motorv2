(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     WORK PLANNER v3 · Estilo Linear / Asana
     ─────────────────────────────────────────────────────────────────
     Layout:
       sidebar  — visões fixas (hoje, semana, atrasadas, aguardando,
                  inbox, todas) + lista de empresas + tags
       header   — título da visão + contador + busca + botão "Nova"
       capture  — formulário inline expansível (slide-down)
       board    — lista densa por seção (atrasadas, hoje, próximas);
                  na visão "semana" vira kanban de 7 colunas
       aside    — resumo: prazos críticos + aguardando + inbox

     Contratos preservados:
       state.workTasks, state.workFilter, state.workWeekAnchor
       window.WorkPlanner.{render, addTask, updateTask, deleteTask,
                          openCapture, closeCapture, setFilter,
                          getCurrentWeekStart}
       IDs: workPage, workSidebar, workWorkspaceHeader, workCapture,
            workBoard, workAside, homeQuickCaptureForm
       Lifecycle: StudyApp.onReady / onStateReplaced
       Atalhos: n (nova), Alt+Shift+←/→/0 (semana ant/prox/atual)
     Dependências globais: state, WorkDomain (WD), saveState, showToast,
       openPage, StudyApp.
     ═══════════════════════════════════════════════════════════════════ */

  function initWorkPlanner(app) {
    if (window.__workPlannerInitialized) return;
    window.__workPlannerInitialized = true;
    const appApi = app || window.StudyApp || {};
    const WD = window.WorkDomain;
    if (!WD) {
      console.error("[work-planner] WorkDomain ausente");
      return;
    }

    const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // visões aceitas (não-empresa)
    const VIEWS = ["today", "week", "overdue", "waiting", "inbox", "all", "done"];
    // empresas vêm de WD.COMPANIES
    const COMPANY_IDS = WD.COMPANIES.map((c) => c.id);

    let draggingId = null;
    let captureOpen = false;
    let searchTerm = "";
    let selectedTaskId = null;          // QW: linha selecionada para keyboard nav
    let editingTaskId = null;           // QW: tarefa aberta no modal de edicao
    let undoBuffer = null;              // QW: { task, timer }
    let undoTimer = null;

    if (!Array.isArray(state.workTasks)) state.workTasks = [];
    if (!state.workFilter) state.workFilter = "today";

    // backwards compat: se vier filtro antigo ("general"), re-mapeia
    if (state.workFilter === "general") state.workFilter = "all";

    let currentWeekStart = WD.getWeekStart(state.workWeekAnchor || new Date());

    /* ─────────────── Helpers ─────────────── */

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
      return d ? fmtDateShort(d) : "—";
    }

    function relativeDueLabel(iso) {
      if (!iso) return "Sem prazo";
      const today = WD.parseIso(WD.todayIso());
      const due = WD.parseIso(iso);
      if (!today || !due) return "Sem prazo";
      const diff = Math.round((due - today) / 86400000);
      if (diff === 0) return "Hoje";
      if (diff === 1) return "Amanhã";
      if (diff === -1) return "Ontem";
      if (diff < 0) return Math.abs(diff) + "d atrás";
      if (diff < 7) return "em " + diff + "d";
      return fmtDateShort(due);
    }

    function dueTone(iso) {
      if (!iso) return "quiet";
      const today = WD.parseIso(WD.todayIso());
      const due = WD.parseIso(iso);
      if (!today || !due) return "quiet";
      const diff = Math.round((due - today) / 86400000);
      if (diff < 0) return "danger";
      if (diff <= 1) return "warning";
      if (diff <= 3) return "accent";
      return "quiet";
    }

    // P3a — filtros tambem aceitam "kind:<value>"
    const KIND_FILTERS = ["kind:task", "kind:followup", "kind:email", "kind:meeting", "kind:document"];

    function currentFilter() {
      const allowed = VIEWS.concat(COMPANY_IDS).concat(KIND_FILTERS);
      return allowed.indexOf(state.workFilter) === -1 ? "today" : state.workFilter;
    }

    function isCompanyFilter(f) {
      return COMPANY_IDS.indexOf(f || currentFilter()) !== -1;
    }

    function isKindFilter(f) {
      const k = f || currentFilter();
      return typeof k === "string" && k.indexOf("kind:") === 0;
    }

    function kindFromFilter(f) {
      const k = f || currentFilter();
      if (!isKindFilter(k)) return null;
      return k.slice(5);
    }

    function viewMeta(filter) {
      const f = filter || currentFilter();
      switch (f) {
        case "today":    return { title: "Hoje",         hint: "Itens marcados para hoje e atrasados" };
        case "week":     return { title: "Semana",       hint: "Distribuição por dia da semana" };
        case "overdue":  return { title: "Atrasadas",    hint: "Em aberto com prazo vencido" };
        case "waiting":  return { title: "Aguardando",   hint: "Bloqueadas por terceiros" };
        case "inbox":    return { title: "Inbox",        hint: "Sem dia atribuído" };
        case "all":      return { title: "Todas",        hint: "Tudo em aberto, sem filtro" };
        case "done":     return { title: "Concluídas",   hint: "Histórico do que foi fechado" };
        default: {
          if (isKindFilter(f)) {
            const meta = WD.getKindMeta ? WD.getKindMeta(kindFromFilter(f)) : null;
            return {
              title: meta ? meta.label + "s" : "Tipo",
              hint: meta ? "Apenas itens deste tipo" : "Filtro por tipo"
            };
          }
          const co = WD.companyMeta(f);
          if (co) return { title: co.name, hint: "Itens vinculados a esta investida", company: co };
          return { title: "Hoje", hint: "Itens para hoje" };
        }
      }
    }

    function todayIso() { return WD.todayIso(); }

    function openTasks() {
      return (state.workTasks || []).filter(WD.isOpen);
    }

    function applySearch(list) {
      const q = (searchTerm || "").trim().toLowerCase();
      if (!q) return list;
      return list.filter((t) => {
        return (t.title || "").toLowerCase().indexOf(q) !== -1
          || (t.nextAction || "").toLowerCase().indexOf(q) !== -1
          || (t.notes || "").toLowerCase().indexOf(q) !== -1;
      });
    }

    function filterTasks(filter) {
      const f = filter || currentFilter();
      const ref = todayIso();
      // Visao "done" usa state.workTasks (inclui done) — nao openTasks
      if (f === "done") {
        const all = (state.workTasks || []).filter((t) => t.status === "done");
        return applySearch(all).sort((a, b) => {
          const da = a.completedAt || a.updatedAt || "";
          const db = b.completedAt || b.updatedAt || "";
          return db.localeCompare(da);
        });
      }
      const open = openTasks();
      let list;
      if (f === "today") list = open.filter((t) => WD.isToday(t, ref) || WD.isOverdue(t, ref));
      else if (f === "week") {
        const weekSet = new Set(WD.getWeekDays(currentWeekStart).map((d) => d.iso));
        list = open.filter((t) => weekSet.has(t.scheduledDayIso) || (t.dueDate && weekSet.has(t.dueDate)));
      }
      else if (f === "overdue") list = open.filter((t) => WD.isOverdue(t, ref));
      else if (f === "waiting") list = open.filter(WD.isWaiting);
      else if (f === "inbox")   list = open.filter((t) => !t.scheduledDayIso && t.status === "inbox");
      else if (f === "all")     list = open;
      else if (isCompanyFilter(f)) list = open.filter((t) => t.companyId === f);
      else if (isKindFilter(f))    list = open.filter((t) => (t.itemKind || "task") === kindFromFilter(f));
      else list = open;
      return WD.sortTasks(applySearch(list), ref);
    }

    function saveAndRefresh(message) {
      saveState();
      if (message && typeof showToast === "function") showToast(message);
      renderWorkPlanner();
    }

    function persistWeekAnchor() {
      state.workWeekAnchor = WD.toIsoDate(currentWeekStart);
      saveState();
    }

    function applyFilterChange(next) {
      if (next === state.workFilter) return;
      state.workFilter = next;
      saveState();
      renderWorkPlanner();
    }

    /* ─────────────── Sidebar ─────────────── */

    function renderSidebar() {
      const el = document.getElementById("workSidebar");
      if (!el) return;
      const f = currentFilter();
      const open = openTasks();
      const ref = todayIso();

      function count(filter) { return filterTasks(filter).length; }

      const today = open.filter((t) => WD.isToday(t, ref) || WD.isOverdue(t, ref)).length;
      const overdue = open.filter((t) => WD.isOverdue(t, ref)).length;
      const waiting = open.filter(WD.isWaiting).length;
      const inbox = open.filter((t) => !t.scheduledDayIso && t.status === "inbox").length;

      const view = (key, label, icon, n, hint) => {
        const active = f === key ? ' aria-current="page"' : '';
        const cls = "wk-side-item" + (f === key ? " is-active" : "");
        const dot = n > 0 ? '<span class="wk-side-count">' + esc(n) + '</span>' : '';
        const aria = hint ? ' title="' + esc(hint) + '"' : '';
        return (
          '<button type="button" class="' + cls + '" data-work-filter="' + esc(key) + '"' + active + aria + '>' +
            '<span class="wk-side-icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="wk-side-label">' + esc(label) + '</span>' +
            dot +
          '</button>'
        );
      };

      const companyItem = (co) => {
        const n = open.filter((t) => t.companyId === co.id).length;
        const active = f === co.id ? ' aria-current="page"' : '';
        const cls = "wk-side-item wk-side-item--co" + (f === co.id ? " is-active" : "");
        const dot = n > 0 ? '<span class="wk-side-count">' + esc(n) + '</span>' : '';
        return (
          '<button type="button" class="' + cls + '" data-work-filter="' + esc(co.id) + '"' + active + ' style="--co-accent: ' + esc(co.accent) + '">' +
            '<span class="wk-side-co-mark" aria-hidden="true"></span>' +
            '<span class="wk-side-label">' + esc(co.name) + '</span>' +
            dot +
          '</button>'
        );
      };

      // P3a — contadores por tipo
      const kindCounts = {};
      WD.ITEM_KINDS.forEach((k) => {
        kindCounts[k.value] = open.filter((t) => (t.itemKind || "task") === k.value).length;
      });

      const kindItem = (k) => {
        const filterKey = "kind:" + k.value;
        const n = kindCounts[k.value] || 0;
        const active = f === filterKey ? ' aria-current="page"' : '';
        const cls = "wk-side-item" + (f === filterKey ? " is-active" : "");
        const dot = n > 0 ? '<span class="wk-side-count">' + esc(n) + '</span>' : '';
        const icon = svgKind(k.value);
        return (
          '<button type="button" class="' + cls + '" data-work-filter="' + esc(filterKey) + '"' + active + '>' +
            '<span class="wk-side-icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="wk-side-label">' + esc(k.label) + 's</span>' +
            dot +
          '</button>'
        );
      };

      el.innerHTML =
        '<div class="wk-side-section">' +
          '<button type="button" class="wk-side-new" data-work-capture-toggle>' +
            '<span class="wk-side-new-plus" aria-hidden="true">+</span>' +
            'Novo item' +
            '<kbd class="wk-side-kbd">N</kbd>' +
          '</button>' +
        '</div>' +
        '<nav class="wk-side-section" aria-label="Visões">' +
          '<span class="wk-side-heading">Visões</span>' +
          view("today",   "Hoje",       svgFlame(),  today,   "Hoje + atrasadas") +
          view("week",    "Semana",     svgGrid(),   '',      "Kanban semanal") +
          view("overdue", "Atrasadas",  svgClock(),  overdue, "Vencidas em aberto") +
          view("waiting", "Aguardando", svgPause(),  waiting, "Bloqueadas por terceiros") +
          view("inbox",   "Inbox",      svgInbox(),  inbox,   "Sem dia atribuído") +
          view("all",     "Todas",      svgList(),   open.length, "Tudo em aberto") +
          view("done",    "Concluídas", svgCheckSm(), '',         "Histórico de concluídas") +
        '</nav>' +
        '<nav class="wk-side-section" aria-label="Tipos">' +
          '<span class="wk-side-heading">Tipo</span>' +
          WD.ITEM_KINDS.map(kindItem).join("") +
        '</nav>' +
        '<nav class="wk-side-section" aria-label="Investidas">' +
          '<span class="wk-side-heading">Investidas</span>' +
          WD.COMPANIES.map(companyItem).join("") +
        '</nav>';
    }

    function svgKind(kind) {
      switch (kind) {
        case "followup": return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
        case "email":    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 7 12 13 2 7"/></svg>';
        case "meeting":  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>';
        case "document": return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
        default:         return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      }
    }

    /* SVGs minimalistas inline (linha 1.6) */
    function svgFlame() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2 4 5 5 5 9a5 5 0 1 1-10 0c0-2 1-3 1-5 1 1 2 1 2 3 0-3 1-5 2-7z"/></svg>';
    }
    function svgGrid() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
    }
    function svgClock() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    }
    function svgPause() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    }
    function svgInbox() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>';
    }
    function svgList() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
    }
    function svgCheckSm() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    /* ─────────────── Header ─────────────── */

    function renderHeader() {
      const el = document.getElementById("workWorkspaceHeader");
      if (!el) return;
      const f = currentFilter();
      const meta = viewMeta(f);
      const list = filterTasks(f);
      const subline = list.length === 1
        ? "1 item nesta visão"
        : list.length + " itens nesta visão";

      const weekControls = f === "week"
        ? '<div class="wk-head-week">' +
            '<button type="button" class="wk-icon-btn" id="workPrevBtn" title="Semana anterior" aria-label="Semana anterior">' + svgChevronLeft() + '</button>' +
            '<span class="wk-head-week-label">' + esc(weekRangeLabel()) + '</span>' +
            '<button type="button" class="wk-icon-btn" id="workNextBtn" title="Próxima semana" aria-label="Próxima semana">' + svgChevronRight() + '</button>' +
            '<button type="button" class="wk-text-btn" id="workTodayBtn">Hoje</button>' +
          '</div>'
        : '';

      const searchAndCapture =
        '<div class="wk-head-search">' +
          '<span class="wk-head-search-icon" aria-hidden="true">' + svgSearch() + '</span>' +
          '<input type="search" id="workSearchInput" class="wk-head-search-input" placeholder="Buscar item…" value="' + esc(searchTerm) + '" autocomplete="off" />' +
        '</div>' +
        '<button type="button" class="wk-btn wk-btn--primary" data-work-capture-toggle>' +
          '<span aria-hidden="true">+</span> Novo item' +
        '</button>';

      // Pagina de Investida (P3a): header expandido quando filtro é empresa
      if (meta.company) {
        el.innerHTML = renderCompanyPageHeader(meta.company) +
          '<div class="wk-head-actions">' + weekControls + searchAndCapture + '</div>';
        return;
      }

      const titleAccent = '';
      el.innerHTML =
        '<div class="wk-head-text">' +
          '<h1 class="wk-head-title">' + titleAccent + esc(meta.title) + '</h1>' +
          '<p class="wk-head-sub">' + esc(meta.hint) + ' · ' + esc(subline) + '</p>' +
        '</div>' +
        '<div class="wk-head-actions">' +
          weekControls +
          searchAndCapture +
        '</div>';
    }

    // P3a — header da página de Investida.
    function renderCompanyPageHeader(company) {
      const ref = todayIso();
      const all = (state.workTasks || []).filter((t) => t.companyId === company.id);
      const open = all.filter(WD.isOpen);
      const overdue = open.filter((t) => WD.isOverdue(t, ref));
      const today = open.filter((t) => WD.isToday(t, ref) && !WD.isOverdue(t, ref));
      const waiting = open.filter(WD.isWaiting);
      const sorted = WD.sortTasks(open, ref);
      const topNext = sorted[0];

      // Última interação: maior lastInteractionAt OU updatedAt entre os abertos
      let lastIso = null;
      let lastTitle = "";
      open.forEach((t) => {
        const cand = t.lastInteractionAt || t.updatedAt || t.createdAt;
        if (cand && (!lastIso || cand > lastIso)) {
          lastIso = cand;
          lastTitle = t.title;
        }
      });
      const lastLabel = lastIso ? formatRelativeFromIso(lastIso) : "—";

      // Próxima ação primária
      const nextAction = topNext
        ? (topNext.nextAction && topNext.nextAction !== topNext.title ? topNext.nextAction : topNext.title)
        : "Sem próxima ação definida";

      const nextDueLabel = topNext && topNext.dueDate ? relativeDueLabel(topNext.dueDate) : "";

      const stats = [
        '<div class="wk-co-stat"><span class="wk-co-stat-num">' + open.length + '</span><span class="wk-co-stat-lab">abertas</span></div>',
        '<div class="wk-co-stat"' + (today.length ? ' data-tone="accent"' : '') + '><span class="wk-co-stat-num">' + today.length + '</span><span class="wk-co-stat-lab">hoje</span></div>',
        '<div class="wk-co-stat"' + (overdue.length ? ' data-tone="danger"' : '') + '><span class="wk-co-stat-num">' + overdue.length + '</span><span class="wk-co-stat-lab">atrasadas</span></div>',
        '<div class="wk-co-stat"' + (waiting.length ? ' data-tone="warning"' : '') + '><span class="wk-co-stat-num">' + waiting.length + '</span><span class="wk-co-stat-lab">aguardando</span></div>'
      ].join("");

      return (
        '<div class="wk-co-page" style="--co-accent: ' + esc(company.accent) + '">' +
          '<div class="wk-co-page-top">' +
            '<div class="wk-co-page-mark" aria-hidden="true"></div>' +
            '<div class="wk-co-page-id">' +
              '<span class="wk-co-page-eyebrow">Investida</span>' +
              '<h1 class="wk-co-page-name">' + esc(company.name) + '</h1>' +
            '</div>' +
            '<div class="wk-co-page-stats">' + stats + '</div>' +
          '</div>' +
          '<div class="wk-co-page-meta">' +
            '<div class="wk-co-page-block">' +
              '<span class="wk-co-page-label">Próxima ação</span>' +
              '<span class="wk-co-page-value">' + esc(nextAction) + (nextDueLabel ? ' <em class="wk-co-page-when">· ' + esc(nextDueLabel) + '</em>' : '') + '</span>' +
            '</div>' +
            '<div class="wk-co-page-block">' +
              '<span class="wk-co-page-label">Última interação</span>' +
              '<span class="wk-co-page-value">' + esc(lastLabel) + (lastTitle ? ' <em class="wk-co-page-when">· ' + esc(lastTitle) + '</em>' : '') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    // Helper: relativa "há X dias" / "agora" / "ontem" para timestamps ISO completos
    function formatRelativeFromIso(iso) {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "agora";
      if (mins < 60) return mins + " min atrás";
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + "h atrás";
      const days = Math.floor(hrs / 24);
      if (days === 1) return "ontem";
      if (days < 7) return days + " dias atrás";
      return fmtDateShort(d);
    }

    function weekRangeLabel() {
      const days = WD.getWeekDays(currentWeekStart);
      const first = days[0].date;
      const last = days[6].date;
      const sameMonth = first.getMonth() === last.getMonth();
      if (sameMonth) {
        return first.getDate() + "–" + last.getDate() + " " + MONTH_NAMES[last.getMonth()];
      }
      return first.getDate() + " " + MONTH_NAMES[first.getMonth()] + " – " + last.getDate() + " " + MONTH_NAMES[last.getMonth()];
    }

    function svgChevronLeft()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'; }
    function svgChevronRight() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'; }
    function svgSearch() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'; }

    /* ─────────────── Capture (slide-down) ─────────────── */

    function openCapture(forCompany) {
      captureOpen = true;
      renderCapture(forCompany || null);
      const slot = document.getElementById("workCapture");
      if (slot) {
        if (window.Anim && typeof window.Anim.captureSlide === "function") {
          window.Anim.captureSlide(slot, true);
        } else {
          slot.setAttribute("data-open", "true");
        }
      }
      setTimeout(() => {
        const titleField = document.getElementById("workCaptureTitle");
        if (titleField) titleField.focus();
      }, 60);
    }

    function closeCapture() {
      captureOpen = false;
      const slot = document.getElementById("workCapture");
      if (!slot) return;
      if (window.Anim && typeof window.Anim.captureSlide === "function") {
        window.Anim.captureSlide(slot, false);
        // espera animação para limpar HTML
        setTimeout(() => { if (!captureOpen) slot.innerHTML = ""; }, 220);
      } else {
        slot.setAttribute("data-open", "false");
        slot.innerHTML = "";
      }
    }

    function renderCapture(prefill) {
      const slot = document.getElementById("workCapture");
      if (!slot) return;
      if (!captureOpen) {
        slot.innerHTML = "";
        return;
      }

      const f = currentFilter();
      const presetCompany = prefill && prefill.companyId ? prefill.companyId : (isCompanyFilter(f) ? f : "");
      const presetTarget = f === "today" || f === "week" ? "today" : "inbox";

      const companyOpts =
        '<option value="">Geral</option>' +
        WD.COMPANIES.map((co) => {
          const sel = co.id === presetCompany ? ' selected' : '';
          return '<option value="' + esc(co.id) + '"' + sel + '>' + esc(co.name) + '</option>';
        }).join("");

      const priorityOpts = WD.PRIORITIES.map((p) => {
        const sel = p.value === "medium" ? ' selected' : '';
        return '<option value="' + esc(p.value) + '"' + sel + '>' + esc(p.label) + '</option>';
      }).join("");

      const presetKind = isKindFilter(f) ? kindFromFilter(f) : "task";
      const kindOpts = WD.ITEM_KINDS.map((k) => {
        const sel = k.value === presetKind ? ' selected' : '';
        return '<option value="' + esc(k.value) + '"' + sel + '>' + esc(k.label) + '</option>';
      }).join("");

      slot.innerHTML =
        '<form id="workCaptureForm" class="wk-capture" autocomplete="off">' +
          '<div class="wk-capture-row wk-capture-row--main">' +
            '<input type="text" id="workCaptureTitle" name="title" class="wk-capture-title" placeholder="O que precisa andar? (ex: cobrar minuta TSEA)" maxlength="180" required />' +
            '<button type="submit" class="wk-btn wk-btn--primary wk-capture-save">Salvar</button>' +
            '<button type="button" class="wk-btn wk-btn--ghost wk-capture-cancel" data-work-capture-toggle>Cancelar</button>' +
          '</div>' +
          '<div class="wk-capture-row wk-capture-row--meta">' +
            '<label class="wk-capture-field">' +
              '<span>Próxima ação</span>' +
              '<input type="text" name="nextAction" class="wk-capture-input" placeholder="Ex: revisar com financeiro" maxlength="220" />' +
            '</label>' +
          '</div>' +
          '<div class="wk-capture-row wk-capture-row--grid">' +
            '<label class="wk-capture-field">' +
              '<span>Tipo</span>' +
              '<select name="itemKind" class="wk-capture-input">' + kindOpts + '</select>' +
            '</label>' +
            '<label class="wk-capture-field">' +
              '<span>Empresa</span>' +
              '<select name="companyId" class="wk-capture-input">' + companyOpts + '</select>' +
            '</label>' +
            '<label class="wk-capture-field">' +
              '<span>Prioridade</span>' +
              '<select name="priority" class="wk-capture-input">' + priorityOpts + '</select>' +
            '</label>' +
            '<label class="wk-capture-field">' +
              '<span>Prazo</span>' +
              '<input type="date" name="dueDate" class="wk-capture-input" />' +
            '</label>' +
            '<label class="wk-capture-field">' +
              '<span>Destino</span>' +
              '<select name="target" class="wk-capture-input">' +
                '<option value="today"' + (presetTarget === "today" ? " selected" : "") + '>Hoje</option>' +
                '<option value="inbox"' + (presetTarget === "inbox" ? " selected" : "") + '>Inbox</option>' +
              '</select>' +
            '</label>' +
          '</div>' +
        '</form>';
    }

    /* ─────────────── Board ─────────────── */

    function renderBoard() {
      const el = document.getElementById("workBoard");
      if (!el) return;
      const f = currentFilter();
      if (f === "week") {
        renderWeekBoard(el);
        return;
      }
      renderListBoard(el, f);
    }

    function renderListBoard(el, f) {
      const list = filterTasks(f);
      const ref = todayIso();

      if (!list.length) {
        el.innerHTML = renderEmptyState(f);
        return;
      }

      // Em "today" e "all", agrupamos por bucket; nas outras, lista plana.
      let html = "";
      if (f === "today") {
        const overdue = list.filter((t) => WD.isOverdue(t, ref));
        const today = list.filter((t) => WD.isToday(t, ref) && !WD.isOverdue(t, ref));
        if (overdue.length) html += renderListSection("Atrasadas", overdue, { tone: "danger" });
        if (today.length)   html += renderListSection("Hoje", today, { tone: "accent" });
      } else if (f === "all") {
        const overdue = list.filter((t) => WD.isOverdue(t, ref));
        const today = list.filter((t) => WD.isToday(t, ref) && !WD.isOverdue(t, ref));
        const upcoming = list.filter((t) => !WD.isOverdue(t, ref) && !WD.isToday(t, ref) && t.scheduledDayIso);
        const inbox = list.filter((t) => !t.scheduledDayIso && t.status === "inbox");
        const waiting = list.filter(WD.isWaiting);
        if (overdue.length)  html += renderListSection("Atrasadas", overdue, { tone: "danger" });
        if (today.length)    html += renderListSection("Hoje", today, { tone: "accent" });
        if (upcoming.length) html += renderListSection("Próximas", upcoming);
        if (waiting.length)  html += renderListSection("Aguardando", waiting, { tone: "warning" });
        if (inbox.length)    html += renderListSection("Inbox", inbox);
      } else if (f === "done") {
        // QW: agrupa concluidas por periodo
        html += renderDoneGroups(list, ref);
      } else if (isCompanyFilter(f)) {
        // P3c — timeline cronologica mista por investida.
        html += renderCompanyTimeline(list, ref);
      } else {
        html += renderListSection(viewMeta(f).title, list);
      }

      el.innerHTML = html;
    }

    function renderDoneGroups(list, ref) {
      const today = [], thisWeek = [], older = [];
      const weekStart = WD.toIsoDate(WD.getWeekStart(new Date()));
      list.forEach((t) => {
        const d = (t.completedAt || t.updatedAt || "").slice(0, 10);
        if (d === ref) today.push(t);
        else if (d >= weekStart && d < ref) thisWeek.push(t);
        else older.push(t);
      });
      let html = "";
      if (today.length)    html += renderListSection("Concluídas hoje", today, { tone: "accent" });
      if (thisWeek.length) html += renderListSection("Esta semana", thisWeek);
      if (older.length)    html += renderListSection("Mais antigas", older);
      return html;
    }

    // P3c — timeline cronologica por investida (atrasadas no topo, depois hoje, futuras)
    function renderCompanyTimeline(list, ref) {
      // Agrupa por bucket cronologico
      const overdue = list.filter((t) => WD.isOverdue(t, ref));
      const today = list.filter((t) => WD.isToday(t, ref) && !WD.isOverdue(t, ref));
      const future = list.filter((t) => !WD.isOverdue(t, ref) && !WD.isToday(t, ref));

      function timelineGroup(label, tone, rows) {
        if (!rows.length) return "";
        return (
          '<div class="wk-timeline-group" data-tone="' + esc(tone) + '">' +
            '<div class="wk-timeline-label">' + esc(label) + '</div>' +
            '<ul class="wk-timeline-list" role="list">' +
              rows.map(timelineRow).join("") +
            '</ul>' +
          '</div>'
        );
      }

      return (
        '<section class="wk-timeline" aria-label="Linha do tempo da investida">' +
          timelineGroup("Atrasadas", "danger", overdue) +
          timelineGroup("Hoje",      "accent", today) +
          timelineGroup("Próximas",  "quiet",  future) +
        '</section>'
      );
    }

    function timelineRow(task) {
      const ref = todayIso();
      const overdue = WD.isOverdue(task, ref);
      const overdueLvl = WD.overdueLevel ? WD.overdueLevel(task, ref) : (overdue ? 1 : 0);
      const waiting = WD.isWaiting(task);
      const kindMeta = WD.getKindMeta ? WD.getKindMeta(task.itemKind) : null;
      const kind = task.itemKind || "task";
      const dueLabel = task.dueDate ? relativeDueLabel(task.dueDate) : "";
      const dueClass = task.dueDate ? ' data-tone="' + dueTone(task.dueDate) + '"' : '';

      // Dado especifico por tipo
      let typeDetail = "";
      if (kind === "meeting" && task.meetingTime) {
        typeDetail = '<span class="wk-tl-detail wk-tl-detail--time">' + esc(task.meetingTime) + '</span>';
      } else if (kind === "email" && task.emailFrom) {
        typeDetail = '<span class="wk-tl-detail wk-tl-detail--from">de ' + esc(task.emailFrom) + '</span>';
      } else if (kind === "document" && task.documentUrl) {
        typeDetail = '<a class="wk-tl-detail wk-tl-detail--link" href="' + esc(task.documentUrl) + '" target="_blank" rel="noopener noreferrer" data-stop-row="true">abrir documento ↗</a>';
      } else if (kind === "followup" && task.lastInteractionAt) {
        const rel = formatRelativeFromIso(task.lastInteractionAt);
        typeDetail = '<span class="wk-tl-detail wk-tl-detail--last">último contato ' + esc(rel) + '</span>';
      }

      const tags = [];
      if (overdueLvl === 3) tags.push('<span class="wk-tag" data-tone="danger">atrasada 7d+</span>');
      else if (overdueLvl === 2) tags.push('<span class="wk-tag" data-tone="danger">atrasada</span>');
      else if (overdueLvl === 1) tags.push('<span class="wk-tag" data-tone="warning">atrasada 1d</span>');
      else if (waiting) tags.push('<span class="wk-tag" data-tone="warning">aguardando</span>');
      if (task.priority === "critical") tags.push('<span class="wk-tag" data-tone="danger">crítica</span>');
      else if (task.priority === "high") tags.push('<span class="wk-tag" data-tone="accent">alta</span>');

      const next = task.nextAction && task.nextAction !== task.title
        ? '<span class="wk-tl-next">' + esc(task.nextAction) + '</span>'
        : "";

      return (
        '<li class="wk-tl-item" data-work-task-id="' + esc(task.id) + '" data-overdue-level="' + overdueLvl + '" data-kind="' + esc(kind) + '" draggable="true">' +
          '<span class="wk-tl-marker" aria-hidden="true">' + (kindMeta ? esc(kindMeta.glyph) : "■") + '</span>' +
          '<div class="wk-tl-body">' +
            '<div class="wk-tl-line">' +
              '<span class="wk-tl-kind">' + (kindMeta ? esc(kindMeta.label) : "Tarefa") + '</span>' +
              '<span class="wk-tl-title">' + esc(task.title) + '</span>' +
              tags.join("") +
            '</div>' +
            '<div class="wk-tl-meta">' +
              (typeDetail || next || '<span class="wk-tl-muted">—</span>') +
            '</div>' +
          '</div>' +
          (dueLabel ? '<span class="wk-row-due"' + dueClass + '>' + esc(dueLabel) + '</span>' : '') +
        '</li>'
      );
    }

    function renderListSection(title, list, opts) {
      const tone = opts && opts.tone ? opts.tone : "quiet";
      const rows = list.map(taskRow).join("");
      return (
        '<section class="wk-list-section" data-tone="' + esc(tone) + '">' +
          '<header class="wk-list-section-head">' +
            '<h2 class="wk-list-section-title">' + esc(title) + '</h2>' +
            '<span class="wk-list-section-count">' + list.length + '</span>' +
          '</header>' +
          '<ul class="wk-list" role="list">' + rows + '</ul>' +
        '</section>'
      );
    }

    function taskRow(task) {
      const ref = todayIso();
      const overdue = WD.isOverdue(task, ref);
      const overdueLvl = WD.overdueLevel ? WD.overdueLevel(task, ref) : (overdue ? 1 : 0);
      const waiting = WD.isWaiting(task);
      const co = task.companyId ? WD.companyMeta(task.companyId) : null;
      const accent = co ? co.accent : "var(--muted)";
      const dueLabel = task.dueDate ? relativeDueLabel(task.dueDate) : "";
      const dueClass = task.dueDate ? ' data-tone="' + dueTone(task.dueDate) + '"' : '';
      const kindMeta = WD.getKindMeta ? WD.getKindMeta(task.itemKind) : null;
      const kindAttr = task.itemKind && task.itemKind !== "task" ? ' data-kind="' + esc(task.itemKind) + '"' : '';

      const tags = [];
      if (kindMeta && task.itemKind && task.itemKind !== "task") {
        tags.push('<span class="wk-tag wk-tag--kind" data-kind="' + esc(task.itemKind) + '">' + esc(kindMeta.short) + '</span>');
      }
      if (overdueLvl === 3) tags.push('<span class="wk-tag" data-tone="danger">atrasada 7d+</span>');
      else if (overdueLvl === 2) tags.push('<span class="wk-tag" data-tone="danger">atrasada</span>');
      else if (overdueLvl === 1) tags.push('<span class="wk-tag" data-tone="warning">atrasada 1d</span>');
      else if (waiting) tags.push('<span class="wk-tag" data-tone="warning">aguardando</span>');
      if (task.priority === "critical") tags.push('<span class="wk-tag" data-tone="danger">crítica</span>');
      else if (task.priority === "high") tags.push('<span class="wk-tag" data-tone="accent">alta</span>');

      const next = task.nextAction && task.nextAction !== task.title
        ? '<span class="wk-row-next">' + esc(task.nextAction) + '</span>'
        : '';

      const company = co
        ? '<span class="wk-row-company"><span class="wk-row-co-dot" style="--co-accent: ' + esc(co.accent) + '"></span>' + esc(co.name) + '</span>'
        : '<span class="wk-row-company wk-row-company--general">Geral</span>';

      const isDone = task.status === "done";
      const isSelected = selectedTaskId === task.id;
      const checkedAttr = isDone ? ' checked' : '';
      const titleLabel = task.title || "Tarefa";
      return (
        '<li class="wk-row" data-work-task-id="' + esc(task.id) + '" data-overdue-level="' + overdueLvl + '" data-status="' + esc(task.status) + '"' + (isSelected ? ' data-selected="true"' : '') + kindAttr + ' draggable="true">' +
          '<label class="wk-row-check" aria-label="' + esc(isDone ? "Reabrir tarefa" : "Concluir tarefa") + '">' +
            '<input type="checkbox" class="wk-task-checkbox" data-work-task-id="' + esc(task.id) + '"' + checkedAttr + ' />' +
            '<span class="wk-row-check-mark" aria-hidden="true">' + svgCheck() + '</span>' +
          '</label>' +
          '<span class="wk-row-accent" style="--row-accent: ' + esc(accent) + '" aria-hidden="true"></span>' +
          '<button type="button" class="wk-row-body" data-work-edit data-work-task-id="' + esc(task.id) + '" aria-label="Editar tarefa: ' + esc(titleLabel) + '">' +
            '<div class="wk-row-line">' +
              '<span class="wk-row-title">' + esc(task.title) + '</span>' +
              tags.join("") +
            '</div>' +
            '<div class="wk-row-meta">' +
              company +
              next +
            '</div>' +
          '</button>' +
          (dueLabel ? '<span class="wk-row-due"' + dueClass + '>' + esc(dueLabel) + '</span>' : '<span class="wk-row-due wk-row-due--empty">—</span>') +
          '<div class="wk-row-actions">' +
            (task.status !== "waiting"
              ? '<button type="button" class="wk-row-act" data-work-status="waiting" data-work-task-id="' + esc(task.id) + '" aria-label="Marcar como aguardando" title="Marcar como aguardando">' + svgPauseSm() + '</button>'
              : '<button type="button" class="wk-row-act" data-work-status="planned" data-work-task-id="' + esc(task.id) + '" aria-label="Reativar tarefa" title="Reativar">' + svgPlay() + '</button>'
            ) +
            '<button type="button" class="wk-row-act" data-work-move-inbox data-work-task-id="' + esc(task.id) + '" aria-label="Mover para inbox" title="Mover para inbox">' + svgInboxSm() + '</button>' +
            '<button type="button" class="wk-row-act wk-row-act--danger" data-work-delete data-work-task-id="' + esc(task.id) + '" aria-label="Excluir tarefa" title="Excluir">' + svgTrash() + '</button>' +
          '</div>' +
        '</li>'
      );
    }

    function svgCheck()    { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
    function svgPauseSm()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'; }
    function svgPlay()     { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>'; }
    function svgInboxSm()  { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>'; }
    function svgTrash()    { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'; }

    function renderEmptyState(f) {
      const meta = viewMeta(f);
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      const date = now.getDate();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const isMonthEnd = lastDay - date <= 2;
      let title, body;

      if (f === "today") {
        if (day === 5 && hour >= 17) { title = "Sexta de fim de tarde."; body = "Sem pendências. Bom fechamento de semana — pode fechar."; }
        else if (day === 0)          { title = "Domingo."; body = hour < 12 ? "Aproveite o descanso. Trabalho dorme até segunda." : "Sem nada marcado. Segunda começa amanhã."; }
        else if (day === 6)          { title = "Sábado livre."; body = "Sem pendências de trabalho. Aproveite."; }
        else if (isMonthEnd && hour >= 16) { title = "Final de mês limpo."; body = "Sem pendências. Bom indicador de organização."; }
        else if (hour < 8)           { title = "Madrugada."; body = "Dia ainda não começou. Capture o que pintar mais tarde."; }
        else if (hour < 12)          { title = "Manhã limpa."; body = "Sem atrasadas, nada marcado ainda. Bom momento pra capturar."; }
        else if (hour < 14)          { title = "Hora do almoço."; body = "Sem pendências. Pode respirar."; }
        else if (hour >= 19)         { title = "Dia encerrado."; body = "Sem pendências em aberto. Pode fechar o laptop."; }
        else                         { title = "Tudo no controle."; body = "Sem atrasadas nem tarefas pra hoje neste momento."; }
      }
      else if (f === "week") {
        title = (day === 0 || day === 6) ? "Semana ainda não começou." : "Semana em branco.";
        body = "Nada distribuído pelos dias ainda. Arraste da inbox pra começar.";
      }
      else if (f === "overdue") {
        title = "Nada atrasado.";
        body = "Você está em dia com os prazos. Bom estado pra acumular gás pro próximo ciclo.";
      }
      else if (f === "waiting") {
        title = "Sem pendências externas.";
        body = "Nenhuma tarefa bloqueada por terceiros agora.";
      }
      else if (f === "inbox") {
        title = "Inbox limpa.";
        body = "Toda tarefa em aberto já tem um dia atribuído. Inbox-zero raro de ver.";
      }
      else if (f === "all") {
        title = "Sem tarefas em aberto.";
        body = "Capture algo pra começar — atalho N ou ⌘K abre a captura rápida.";
      }
      else if (f === "done") {
        title = "Nada concluído ainda.";
        body = "Quando você marcar tarefas como feitas, elas aparecem aqui.";
      }
      else if (isKindFilter(f)) {
        const kindMeta = WD.getKindMeta ? WD.getKindMeta(kindFromFilter(f)) : null;
        const label = kindMeta ? kindMeta.label.toLowerCase() : "item";
        title = "Sem " + label + "s em aberto.";
        body = "Nenhum " + label + " registrado neste momento.";
      }
      else if (meta.company) {
        title = "Sem itens em " + meta.company.name + ".";
        body = "Nenhuma demanda registrada pra essa investida agora. Bom estado.";
      }
      else { title = "Sem itens em " + meta.title + "."; body = "Nada cadastrado nesta visão."; }

      const showNewBtn = f !== "done";
      return (
        '<div class="wk-empty">' +
          '<div class="wk-empty-glyph" aria-hidden="true">○</div>' +
          '<h3 class="wk-empty-title">' + esc(title) + '</h3>' +
          '<p class="wk-empty-body">' + esc(body) + '</p>' +
          (showNewBtn ? '<button type="button" class="wk-btn wk-btn--primary" data-work-capture-toggle>+ Novo item</button>' : '') +
        '</div>'
      );
    }

    /* ─────────────── Week board (kanban) ─────────────── */

    function renderWeekBoard(el) {
      const days = WD.getWeekDays(currentWeekStart);
      const ref = todayIso();
      const open = openTasks();
      const filtered = applySearch(open);

      // inbox lateral (não planejadas)
      const inbox = WD.sortTasks(filtered.filter((t) => !t.scheduledDayIso), ref);

      const dayCols = days.map((day) => {
        const dayTasks = WD.sortTasks(filtered.filter((t) => t.scheduledDayIso === day.iso), ref);
        const isToday = day.iso === ref;
        const cls = "wk-week-col" + (isToday ? " is-today" : "");
        return (
          '<section class="' + cls + '">' +
            '<header class="wk-week-col-head">' +
              '<span class="wk-week-col-day">' + esc(WEEKDAY_SHORT[day.date.getDay()]) + '</span>' +
              '<span class="wk-week-col-date">' + esc(day.date.getDate()) + '</span>' +
              '<span class="wk-week-col-count">' + dayTasks.length + '</span>' +
            '</header>' +
            '<div class="wk-week-col-body wk-drop-zone" data-work-drop="day" data-day-iso="' + esc(day.iso) + '">' +
              dayTasks.map(weekCard).join("") +
              (dayTasks.length === 0 ? '<div class="wk-week-empty">—</div>' : '') +
            '</div>' +
          '</section>'
        );
      }).join("");

      const inboxCol =
        '<section class="wk-week-col wk-week-col--inbox">' +
          '<header class="wk-week-col-head">' +
            '<span class="wk-week-col-day">Inbox</span>' +
            '<span class="wk-week-col-count">' + inbox.length + '</span>' +
          '</header>' +
          '<div class="wk-week-col-body wk-drop-zone" data-work-drop="inbox">' +
            inbox.map(weekCard).join("") +
            (inbox.length === 0 ? '<div class="wk-week-empty">vazio</div>' : '') +
          '</div>' +
        '</section>';

      el.innerHTML =
        '<div class="wk-week-grid">' +
          inboxCol +
          dayCols +
        '</div>';
    }

    function weekCard(task) {
      const ref = todayIso();
      const overdue = WD.isOverdue(task, ref);
      const waiting = WD.isWaiting(task);
      const co = task.companyId ? WD.companyMeta(task.companyId) : null;
      const accent = co ? co.accent : "var(--muted)";
      const tag = overdue ? '<span class="wk-tag wk-tag--xs" data-tone="danger">atrasada</span>'
        : waiting ? '<span class="wk-tag wk-tag--xs" data-tone="warning">aguardando</span>'
        : task.priority === "critical" ? '<span class="wk-tag wk-tag--xs" data-tone="danger">crítica</span>'
        : task.priority === "high" ? '<span class="wk-tag wk-tag--xs" data-tone="accent">alta</span>'
        : '';
      const due = task.dueDate ? '<span class="wk-week-card-due" data-tone="' + dueTone(task.dueDate) + '">' + esc(relativeDueLabel(task.dueDate)) + '</span>' : '';
      return (
        '<article class="wk-week-card" data-work-task-id="' + esc(task.id) + '" draggable="true" style="--co-accent: ' + esc(accent) + '">' +
          '<div class="wk-week-card-line">' +
            (co ? '<span class="wk-week-card-co" title="' + esc(co.name) + '">' + esc(co.name) + '</span>' : '') +
            tag +
          '</div>' +
          '<div class="wk-week-card-title">' + esc(task.title) + '</div>' +
          (task.nextAction && task.nextAction !== task.title
            ? '<div class="wk-week-card-next">' + esc(task.nextAction) + '</div>'
            : '') +
          (due ? '<footer class="wk-week-card-foot">' + due + '</footer>' : '') +
        '</article>'
      );
    }

    /* ─────────────── Aside ─────────────── */

    function renderAside() {
      const el = document.getElementById("workAside");
      if (!el) return;
      const f = currentFilter();

      // Esconde o aside se a vista já é especificamente um dos blocos (waiting/overdue/inbox)
      if (f === "waiting" || f === "overdue" || f === "inbox" || f === "week") {
        el.innerHTML = "";
        el.setAttribute("hidden", "");
        return;
      }
      el.removeAttribute("hidden");

      const ref = todayIso();
      const open = openTasks();
      const overdue = WD.sortTasks(open.filter((t) => WD.isOverdue(t, ref)), ref).slice(0, 5);
      const waiting = WD.sortTasks(open.filter(WD.isWaiting), ref).slice(0, 5);
      const inbox = WD.sortTasks(open.filter((t) => !t.scheduledDayIso && t.status === "inbox"), ref).slice(0, 5);

      el.innerHTML =
        renderAsideBlock("Atrasadas",  overdue, "overdue", "danger") +
        renderAsideBlock("Aguardando", waiting, "waiting", "warning") +
        renderAsideBlock("Inbox",      inbox,   "inbox",   "quiet");
    }

    function renderAsideBlock(title, list, jumpFilter, tone) {
      if (!list.length) {
        return (
          '<section class="wk-aside-block">' +
            '<header class="wk-aside-head" data-tone="' + esc(tone || "quiet") + '">' +
              '<h3 class="wk-aside-title">' + esc(title) + '</h3>' +
              '<span class="wk-aside-count">0</span>' +
            '</header>' +
            '<p class="wk-aside-empty">—</p>' +
          '</section>'
        );
      }
      const items = list.map((t) => {
        const co = t.companyId ? WD.companyMeta(t.companyId) : null;
        const due = t.dueDate ? relativeDueLabel(t.dueDate) : "";
        return (
          '<li class="wk-aside-item" data-work-filter="' + esc(jumpFilter) + '" role="button" tabindex="0">' +
            '<span class="wk-aside-item-title">' + esc(t.title) + '</span>' +
            '<span class="wk-aside-item-meta">' +
              (co ? esc(co.name) : "Geral") +
              (due ? ' · ' + esc(due) : '') +
            '</span>' +
          '</li>'
        );
      }).join("");
      return (
        '<section class="wk-aside-block">' +
          '<header class="wk-aside-head" data-tone="' + esc(tone || "quiet") + '">' +
            '<h3 class="wk-aside-title">' + esc(title) + '</h3>' +
            '<span class="wk-aside-count">' + list.length + '</span>' +
          '</header>' +
          '<ul class="wk-aside-list">' + items + '</ul>' +
          '<button type="button" class="wk-aside-more" data-work-filter="' + esc(jumpFilter) + '">Ver todas</button>' +
        '</section>'
      );
    }

    /* ─────────────── Render principal ─────────────── */

    function renderWorkPlanner() {
      try { renderSidebar(); } catch (e) { console.error("[work-planner] sidebar", e); }
      try { renderHeader();  } catch (e) { console.error("[work-planner] header", e); }
      try { renderCapture(); } catch (e) { console.error("[work-planner] capture", e); }
      try { renderBoard();   } catch (e) { console.error("[work-planner] board", e); }
      try { renderAside();   } catch (e) { console.error("[work-planner] aside", e); }
      try { animateBoard();  } catch (e) { /* ignore */ }
    }

    function animateBoard() {
      if (!window.Anim) return;
      const board = document.getElementById("workBoard");
      if (!board) return;
      // Anima cada section + linhas internas com stagger curto
      const sections = board.querySelectorAll(".wk-list-section, .wk-empty, .wk-week-grid");
      if (sections.length) {
        window.Anim.fadeUpStagger(sections, { duration: 0.36, stagger: 0.04 });
      }
      // Hover lift nos cards do kanban
      if (typeof window.Anim.bindHoverLiftAll === "function") {
        window.Anim.bindHoverLiftAll(".wk-week-card", board, { y: -2 });
      }
    }

    /* ─────────────── CRUD ─────────────── */

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

    function deleteTask(id, options) {
      const before = state.workTasks.length;
      const removed = state.workTasks.find((t) => t.id === id);
      state.workTasks = state.workTasks.filter((t) => t.id !== id);
      if (state.workTasks.length === before) return;

      // QW: armazena pra desfazer (a menos que o caller diga skipUndo)
      if (!options || options.skipUndo !== true) {
        scheduleUndo(removed);
      }

      // Refresh sem toast normal (mostraremos undo toast em vez disso)
      saveState();
      renderWorkPlanner();
    }

    /* QW — Undo de delete via toastUndo HTML */
    function scheduleUndo(task) {
      if (!task) return;
      undoBuffer = task;
      const toast = document.getElementById("toastUndo");
      const text = document.getElementById("toastUndoText");
      if (text) text.textContent = "Tarefa excluída · " + (task.title || "").slice(0, 40);
      if (toast) toast.classList.add("show");
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        undoBuffer = null;
        if (toast) toast.classList.remove("show");
      }, 5000);
    }

    function performUndo() {
      if (!undoBuffer) return;
      state.workTasks.push(undoBuffer);
      undoBuffer = null;
      const toast = document.getElementById("toastUndo");
      if (toast) toast.classList.remove("show");
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      saveState();
      renderWorkPlanner();
      if (typeof showToast === "function") showToast("Tarefa restaurada.");
    }

    /* QW — Modal de edicao */
    function openEditModal(taskId) {
      const task = (state.workTasks || []).find((t) => t.id === taskId);
      if (!task) return;
      editingTaskId = taskId;

      const backdrop = document.getElementById("wkEditBackdrop");
      const form = document.getElementById("wkEditForm");
      if (!backdrop || !form) return;

      // Popula selects
      const kindSel = document.getElementById("wkEditKind");
      if (kindSel) {
        kindSel.innerHTML = WD.ITEM_KINDS.map((k) =>
          '<option value="' + esc(k.value) + '"' + (k.value === (task.itemKind || "task") ? " selected" : "") + '>' + esc(k.label) + '</option>'
        ).join("");
      }
      const coSel = document.getElementById("wkEditCompany");
      if (coSel) {
        coSel.innerHTML = '<option value="">Geral</option>' + WD.COMPANIES.map((c) =>
          '<option value="' + esc(c.id) + '"' + (c.id === task.companyId ? " selected" : "") + '>' + esc(c.name) + '</option>'
        ).join("");
      }
      const prioSel = document.getElementById("wkEditPriority");
      if (prioSel) {
        prioSel.innerHTML = WD.PRIORITIES.map((p) =>
          '<option value="' + esc(p.value) + '"' + (p.value === task.priority ? " selected" : "") + '>' + esc(p.label) + '</option>'
        ).join("");
      }
      const statusSel = document.getElementById("wkEditStatus");
      if (statusSel) {
        statusSel.innerHTML = WD.STATUSES.map((s) =>
          '<option value="' + esc(s.value) + '"' + (s.value === task.status ? " selected" : "") + '>' + esc(s.label) + '</option>'
        ).join("");
      }

      form.querySelector("#wkEditId").value = task.id;
      form.querySelector("#wkEditTitleInput").value = task.title || "";
      form.querySelector('[name="nextAction"]').value = task.nextAction || "";
      form.querySelector("#wkEditDue").value = task.dueDate || "";
      form.querySelector("#wkEditDay").value = task.scheduledDayIso || "";
      form.querySelector('[name="notes"]').value = task.notes || "";

      backdrop.setAttribute("data-open", "true");
      backdrop.removeAttribute("aria-hidden");
      setTimeout(() => {
        const titleInput = form.querySelector("#wkEditTitleInput");
        if (titleInput) titleInput.focus();
      }, 60);
    }

    function closeEditModal() {
      editingTaskId = null;
      const backdrop = document.getElementById("wkEditBackdrop");
      if (backdrop) {
        backdrop.setAttribute("data-open", "false");
        backdrop.setAttribute("aria-hidden", "true");
      }
    }

    function saveEditModal(form) {
      const id = form.querySelector("#wkEditId").value;
      if (!id) return;
      const data = new FormData(form);
      const companyId = String(data.get("companyId") || "");
      const patch = {
        title: String(data.get("title") || "").trim(),
        nextAction: String(data.get("nextAction") || "").trim() || (data.get("title") || ""),
        itemKind: String(data.get("itemKind") || "task"),
        scope: companyId ? "company" : "general",
        companyId: companyId || null,
        priority: String(data.get("priority") || "medium"),
        status: String(data.get("status") || "planned"),
        dueDate: String(data.get("dueDate") || "") || null,
        scheduledDayIso: String(data.get("scheduledDayIso") || "") || null,
        notes: String(data.get("notes") || "")
      };
      updateTask(id, patch, "Tarefa atualizada.");
      closeEditModal();
    }

    function collectForm(form) {
      const data = new FormData(form);
      const target = String(data.get("target") || "today");
      const companyId = String(data.get("companyId") || "");
      const itemKind = String(data.get("itemKind") || "task");
      const dayIso = target === "today" ? todayIso() : "";
      return {
        title: data.get("title"),
        itemKind,
        nextAction: data.get("nextAction") || data.get("title"),
        description: "",
        scope: companyId ? "company" : "general",
        companyId: companyId || null,
        scheduledDayIso: dayIso,
        dueDate: data.get("dueDate") || "",
        priority: data.get("priority") || "medium",
        status: dayIso ? "planned" : "inbox",
        area: itemKind === "meeting" ? "reuniao" : (itemKind === "followup" ? "followup" : "operacional")
      };
    }

    /* ─────────────── Eventos ─────────────── */

    function taskIdFrom(event) {
      const card = event.target && event.target.closest ? event.target.closest("[data-work-task-id]") : null;
      return card ? card.getAttribute("data-work-task-id") : null;
    }

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
        const captureToggle = event.target.closest("[data-work-capture-toggle]");
        if (captureToggle) {
          captureOpen ? closeCapture() : openCapture();
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
        // QW: click no body da linha abre edicao
        const editBtn = event.target.closest("[data-work-edit]");
        if (editBtn) {
          const id = taskIdFrom(event);
          if (id) {
            selectedTaskId = id;
            openEditModal(id);
          }
          return;
        }
        const prevBtn = event.target.closest("#workPrevBtn");
        if (prevBtn) { currentWeekStart = WD.addDays(currentWeekStart, -7); persistWeekAnchor(); renderWorkPlanner(); return; }
        const todayBtn = event.target.closest("#workTodayBtn");
        if (todayBtn) { currentWeekStart = WD.getWeekStart(new Date()); persistWeekAnchor(); renderWorkPlanner(); return; }
        const nextBtn = event.target.closest("#workNextBtn");
        if (nextBtn) { currentWeekStart = WD.addDays(currentWeekStart, 7); persistWeekAnchor(); renderWorkPlanner(); return; }
      });

      page.addEventListener("keydown", function (event) {
        if (event.target && event.target.matches && event.target.matches(".wk-aside-item")) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const f = event.target.getAttribute("data-work-filter");
            if (f) applyFilterChange(f);
          }
        }
      });

      page.addEventListener("change", function (event) {
        const cb = event.target.closest(".wk-task-checkbox");
        if (!cb) return;
        const id = taskIdFrom(event);
        if (!id) return;
        const task = state.workTasks.find((t) => t.id === id);
        const fallback = task && task.scheduledDayIso ? "planned" : "inbox";
        updateTask(id, { status: cb.checked ? "done" : fallback }, cb.checked ? "Tarefa concluída." : "Tarefa reaberta.");
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

      page.addEventListener("input", function (event) {
        const input = event.target.closest("#workSearchInput");
        if (!input) return;
        searchTerm = input.value;
        // Re-render só do board e aside pra não roubar foco do input
        try { renderBoard(); } catch (e) { /* ignore */ }
        try { renderAside(); } catch (e) { /* ignore */ }
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
          updateTask(id, { scheduledDayIso: null, status: "inbox" }, "Movida para inbox.");
        } else {
          const dayIso = zone.getAttribute("data-day-iso");
          updateTask(id, { scheduledDayIso: dayIso, status: "planned" }, "Agendada para " + fmtIsoShort(dayIso) + ".");
        }
        draggingId = null;
      });

      // Atalhos globais Alt+Shift+Arrows: navegar semana
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
      setupEditModalEvents();
      setupUndoEvents();
      setupKeyboardShortcuts();
    }

    /* QW — Modal de edicao: eventos */
    function setupEditModalEvents() {
      if (document.body.getAttribute("data-wk-edit-bound") === "true") return;
      document.body.setAttribute("data-wk-edit-bound", "true");

      const backdrop = document.getElementById("wkEditBackdrop");
      if (!backdrop) return;

      const close = () => closeEditModal();

      const closeBtn = document.getElementById("wkEditCloseBtn");
      const cancelBtn = document.getElementById("wkEditCancelBtn");
      const deleteBtn = document.getElementById("wkEditDeleteBtn");
      const form = document.getElementById("wkEditForm");

      if (closeBtn) closeBtn.addEventListener("click", close);
      if (cancelBtn) cancelBtn.addEventListener("click", close);

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close();
      });

      if (form) form.addEventListener("submit", (e) => {
        e.preventDefault();
        saveEditModal(form);
      });

      if (deleteBtn) deleteBtn.addEventListener("click", () => {
        if (!editingTaskId) return;
        const id = editingTaskId;
        close();
        deleteTask(id);
      });

      // Esc fecha o modal de edicao (capture pra ter prioridade sobre outros listeners)
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && backdrop.getAttribute("data-open") === "true") {
          e.preventDefault();
          close();
        }
      }, true);
    }

    /* QW — Undo via toastUndo */
    function setupUndoEvents() {
      if (document.body.getAttribute("data-wk-undo-bound") === "true") return;
      document.body.setAttribute("data-wk-undo-bound", "true");
      const btn = document.getElementById("toastUndoBtn");
      if (btn) btn.addEventListener("click", performUndo);
    }

    /* QW — Pacote completo de keyboard shortcuts */
    function setupKeyboardShortcuts() {
      if (document.body.getAttribute("data-wk-shortcuts-bound") === "true") return;
      document.body.setAttribute("data-wk-shortcuts-bound", "true");

      const VIEW_BY_NUM = { "1": "today", "2": "week", "3": "overdue", "4": "waiting", "5": "inbox", "6": "all" };

      document.addEventListener("keydown", (event) => {
        const page = document.getElementById("workPage");
        if (!page || page.hasAttribute("hidden")) return;

        // Quando o modal de edicao ou de atalhos esta aberto, deixa eles tratarem
        const editOpen = document.getElementById("wkEditBackdrop");
        const shortcutsOpen = document.getElementById("wkShortcutsBackdrop");
        if (editOpen && editOpen.getAttribute("data-open") === "true") return;
        if (shortcutsOpen && shortcutsOpen.getAttribute("data-open") === "true") {
          if (event.key === "Escape") {
            event.preventDefault();
            shortcutsOpen.setAttribute("data-open", "false");
            shortcutsOpen.setAttribute("aria-hidden", "true");
          }
          return;
        }

        const t = event.target;
        const isEditable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (isEditable) {
          if (event.key === "/" && t.id !== "workSearchInput") {
            // Allow / in editable fields
          }
          return;
        }

        // ? abre overlay de atalhos
        if (event.key === "?" || (event.shiftKey && event.key === "/")) {
          event.preventDefault();
          openShortcutsOverlay();
          return;
        }

        // / focus search
        if (event.key === "/") {
          event.preventDefault();
          const input = document.getElementById("workSearchInput");
          if (input) input.focus();
          return;
        }

        // 1..6 muda visao
        if (VIEW_BY_NUM[event.key]) {
          event.preventDefault();
          applyFilterChange(VIEW_BY_NUM[event.key]);
          return;
        }

        // n nova tarefa
        if (event.key === "n" || event.key === "N") {
          event.preventDefault();
          openCapture();
          return;
        }

        // j/ArrowDown / k/ArrowUp navegam selecao
        if (event.key === "j" || event.key === "ArrowDown") {
          event.preventDefault();
          moveSelection(1);
          return;
        }
        if (event.key === "k" || event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(-1);
          return;
        }

        // Acoes sobre selecao
        if (!selectedTaskId) return;

        if (event.key === "Enter") {
          event.preventDefault();
          openEditModal(selectedTaskId);
          return;
        }
        if (event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          const task = (state.workTasks || []).find((t) => t.id === selectedTaskId);
          if (!task) return;
          const fallback = task.scheduledDayIso ? "planned" : "inbox";
          updateTask(selectedTaskId, { status: task.status === "done" ? fallback : "done" }, task.status === "done" ? "Tarefa reaberta." : "Tarefa concluída.");
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          deleteTask(selectedTaskId);
          return;
        }
      });
    }

    function moveSelection(delta) {
      const rows = Array.from(document.querySelectorAll("#workBoard [data-work-task-id]"));
      if (!rows.length) return;
      const ids = rows.map((r) => r.getAttribute("data-work-task-id"));
      let idx = ids.indexOf(selectedTaskId);
      if (idx < 0) idx = delta > 0 ? -1 : 0;
      idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
      selectedTaskId = ids[idx];
      // Atualiza atributos sem re-render completo
      rows.forEach((r) => {
        if (r.getAttribute("data-work-task-id") === selectedTaskId) {
          r.setAttribute("data-selected", "true");
          r.scrollIntoView({ block: "nearest" });
        } else {
          r.removeAttribute("data-selected");
        }
      });
    }

    function openShortcutsOverlay() {
      const backdrop = document.getElementById("wkShortcutsBackdrop");
      if (!backdrop) return;
      backdrop.setAttribute("data-open", "true");
      backdrop.removeAttribute("aria-hidden");
      const closeBtn = document.getElementById("wkShortcutsCloseBtn");
      if (closeBtn && !closeBtn._bound) {
        closeBtn._bound = true;
        closeBtn.addEventListener("click", () => {
          backdrop.setAttribute("data-open", "false");
          backdrop.setAttribute("aria-hidden", "true");
        });
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) {
            backdrop.setAttribute("data-open", "false");
            backdrop.setAttribute("aria-hidden", "true");
          }
        });
      }
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
        addTask(payload, "Tarefa capturada.");
        form.reset();
        if (typeof appApi.requestRender === "function") appApi.requestRender();
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

    /* ─────────────── API pública ─────────────── */

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
        if (!state.workFilter) state.workFilter = "today";
        if (state.workFilter === "general") state.workFilter = "all";
        const page = document.getElementById("workPage");
        if (page && !page.hasAttribute("hidden")) renderWorkPlanner();
        if (typeof appApi.requestRender === "function") appApi.requestRender();
      });
    }

    console.log("[work-planner] v3 inicializado (Linear/Asana)");
  }

  if (window.StudyApp && typeof window.StudyApp.onReady === "function") {
    window.StudyApp.onReady(initWorkPlanner);
  } else {
    setTimeout(function () { initWorkPlanner(window.StudyApp); }, 0);
  }
})();
