(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     COMMAND PALETTE · ⌘K / Ctrl+K
     ─────────────────────────────────────────────────────────────────
     Mostra ações navegáveis, atalhos e investidas/disciplinas.
     Filtragem por substring (case-insensitive, sem acento).
     Atalhos:
       Cmd/Ctrl+K  abre
       Esc         fecha
       ↑ ↓         navega
       ↵           executa
     ═══════════════════════════════════════════════════════════════════ */

  let backdrop, input, listEl, currentItems = [], cursor = 0;

  function escapeText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function deburr(str) {
    return String(str || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function svg(name) {
    const map = {
      arrow:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
      plus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      moon:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      work:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
      school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 5-10 5L2 8l10-5z"/><path d="M6 10v5c0 2 3 4 6 4s6-2 6-4v-5"/></svg>',
      home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v9h14v-9"/></svg>',
      news:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="13" y2="17"/></svg>',
      circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/></svg>'
    };
    return map[name] || map.circle;
  }

  /* ─────────────── Catálogo de comandos ─────────────── */

  function buildCommands() {
    const items = [];

    // Navegação
    items.push({
      group: "Ir para",
      label: "Painel principal",
      hint: "Painel",
      icon: svg("home"),
      keywords: "painel home dashboard inicio",
      run: function () { if (typeof window.openPage === "function") window.openPage("home"); }
    });
    items.push({
      group: "Ir para",
      label: "Trabalho",
      hint: "Workspace de gestão",
      icon: svg("work"),
      keywords: "trabalho work investidas tarefas",
      run: function () { if (typeof window.openPage === "function") window.openPage("work"); }
    });
    items.push({
      group: "Ir para",
      label: "Faculdade",
      hint: "Estudos e disciplinas",
      icon: svg("school"),
      keywords: "faculdade estudos universidade poli usp escola",
      run: function () { if (typeof window.openPage === "function") window.openPage("studies"); }
    });
    items.push({
      group: "Ir para",
      label: "Notícias",
      hint: "Feed de mercado",
      icon: svg("news"),
      keywords: "noticias mercado feed",
      run: function () { if (typeof window.openPage === "function") window.openPage("news"); }
    });

    // Empresas
    if (window.WorkDomain && Array.isArray(window.WorkDomain.COMPANIES)) {
      window.WorkDomain.COMPANIES.forEach(function (co) {
        items.push({
          group: "Investida",
          label: co.name,
          hint: "Filtrar Trabalho",
          icon: svg("circle"),
          keywords: "empresa investida " + co.name,
          run: function () {
            try {
              if (window.WorkPlanner && typeof window.WorkPlanner.setFilter === "function") {
                window.WorkPlanner.setFilter(co.id);
              }
              if (typeof window.openPage === "function") window.openPage("work");
            } catch (e) {}
          }
        });
      });
    }

    // Disciplinas (do DATA.subjects) — agora abrem o modal P3b
    if (window.DATA && Array.isArray(window.DATA.subjects)) {
      window.DATA.subjects.slice(0, 12).forEach(function (subj) {
        const name = subj.name || subj.shortName || subj.code || subj.id;
        const subjectKey = subj.id || subj.code || subj.shortName || subj.name;
        items.push({
          group: "Disciplina",
          label: name,
          hint: "Abrir página",
          icon: svg("school"),
          keywords: "disciplina materia " + name + " " + (subj.code || ""),
          run: function () {
            if (window.SubjectPage && typeof window.SubjectPage.open === "function") {
              window.SubjectPage.open(subjectKey);
            } else if (typeof window.openPage === "function") {
              window.openPage("studies");
            }
          }
        });
      });
    }

    // Visões de trabalho
    [
      { id: "today", label: "Hoje (Trabalho)" },
      { id: "week", label: "Semana (Trabalho)" },
      { id: "overdue", label: "Atrasadas" },
      { id: "waiting", label: "Aguardando" },
      { id: "inbox", label: "Inbox de Trabalho" }
    ].forEach(function (v) {
      items.push({
        group: "Visão de Trabalho",
        label: v.label,
        hint: "Abrir filtro",
        icon: svg("arrow"),
        keywords: "visao trabalho " + v.label,
        run: function () {
          try {
            if (window.WorkPlanner && typeof window.WorkPlanner.setFilter === "function") {
              window.WorkPlanner.setFilter(v.id);
            }
            if (typeof window.openPage === "function") window.openPage("work");
          } catch (e) {}
        }
      });
    });

    // Ações
    items.push({
      group: "Ações",
      label: "Nova tarefa de Trabalho",
      hint: "Abrir captura no planner",
      icon: svg("plus"),
      keywords: "nova tarefa trabalho add capturar",
      run: function () {
        if (typeof window.openPage === "function") window.openPage("work");
        setTimeout(function () {
          if (window.WorkPlanner && typeof window.WorkPlanner.openCapture === "function") {
            window.WorkPlanner.openCapture();
          }
        }, 80);
      }
    });
    items.push({
      group: "Ações",
      label: "Alternar tema (claro/escuro)",
      hint: "Tema",
      icon: svg("moon"),
      keywords: "tema dark light claro escuro modo",
      run: function () {
        const btn = document.getElementById("tbThemeBtn");
        if (btn) btn.click();
      }
    });
    items.push({
      group: "Ações",
      label: "Trocar contexto para Trabalho",
      hint: "Contexto",
      icon: svg("work"),
      keywords: "contexto trabalho switch",
      run: function () {
        if (window.state) window.state.appContext = "work";
        try { if (typeof window.saveState === "function") window.saveState(); } catch (e) {}
        document.body.setAttribute("data-context", "work");
        if (typeof window.openPage === "function") window.openPage("work");
      }
    });
    items.push({
      group: "Ações",
      label: "Trocar contexto para Faculdade",
      hint: "Contexto",
      icon: svg("school"),
      keywords: "contexto faculdade estudos switch",
      run: function () {
        if (window.state) window.state.appContext = "school";
        try { if (typeof window.saveState === "function") window.saveState(); } catch (e) {}
        document.body.setAttribute("data-context", "school");
        if (typeof window.openPage === "function") window.openPage("studies");
      }
    });

    return items;
  }

  /* ─────────────── Render ─────────────── */

  function render(query) {
    if (!listEl) return;
    const q = deburr(query || "");
    const all = buildCommands();
    let filtered;
    if (!q) {
      filtered = all;
    } else {
      filtered = all.filter(function (it) {
        const hay = deburr(it.label + " " + (it.keywords || "") + " " + (it.group || ""));
        return hay.indexOf(q) !== -1;
      });
    }

    currentItems = filtered;
    if (cursor >= currentItems.length) cursor = 0;

    if (!filtered.length) {
      listEl.innerHTML = '<div class="cmdk-empty">Nenhum comando encontrado para "' + escapeText(query) + '".</div>';
      return;
    }

    // Agrupa
    const byGroup = {};
    filtered.forEach(function (it) {
      const g = it.group || "Comandos";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(it);
    });

    let html = "";
    let idx = 0;
    Object.keys(byGroup).forEach(function (group) {
      html += '<div class="cmdk-section">';
      html += '<div class="cmdk-section-title">' + escapeText(group) + '</div>';
      byGroup[group].forEach(function (it) {
        const i = idx++;
        const sel = i === cursor ? ' aria-selected="true"' : '';
        html += '<button type="button" class="cmdk-item" role="option" data-cmdk-i="' + i + '"' + sel + '>' +
                  '<span class="cmdk-item-icon" aria-hidden="true">' + it.icon + '</span>' +
                  '<span class="cmdk-item-label">' + escapeText(it.label) + '</span>' +
                  (it.hint ? '<span class="cmdk-item-hint">' + escapeText(it.hint) + '</span>' : '') +
                '</button>';
      });
      html += '</div>';
    });
    listEl.innerHTML = html;
  }

  function updateCursor(delta) {
    if (!currentItems.length) return;
    cursor = (cursor + delta + currentItems.length) % currentItems.length;
    listEl.querySelectorAll(".cmdk-item").forEach(function (el) {
      const i = Number(el.getAttribute("data-cmdk-i"));
      el.setAttribute("aria-selected", i === cursor ? "true" : "false");
    });
    const active = listEl.querySelector('[aria-selected="true"]');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  }

  function execute(i) {
    const idx = typeof i === "number" ? i : cursor;
    const item = currentItems[idx];
    if (!item || typeof item.run !== "function") return;
    close();
    setTimeout(function () { try { item.run(); } catch (e) { console.error("[cmdk]", e); } }, 60);
  }

  /* ─────────────── Open / close ─────────────── */

  function open() {
    if (!backdrop) return;
    backdrop.setAttribute("data-open", "true");
    backdrop.removeAttribute("aria-hidden");
    cursor = 0;
    if (input) {
      input.value = "";
      input.focus();
    }
    render("");
  }

  function close() {
    if (!backdrop) return;
    backdrop.setAttribute("data-open", "false");
    backdrop.setAttribute("aria-hidden", "true");
    if (input) input.blur();
  }

  /* ─────────────── Init ─────────────── */

  function init() {
    backdrop = document.getElementById("cmdkBackdrop");
    input    = document.getElementById("cmdkInput");
    listEl   = document.getElementById("cmdkList");
    if (!backdrop || !input || !listEl) return;

    // Atalho global
    document.addEventListener("keydown", function (event) {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        if (backdrop.getAttribute("data-open") === "true") close();
        else open();
        return;
      }
      if (backdrop.getAttribute("data-open") !== "true") return;

      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateCursor(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateCursor(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        execute();
      }
    });

    // Input filtra
    input.addEventListener("input", function () { cursor = 0; render(input.value); });

    // Click no item
    listEl.addEventListener("click", function (event) {
      const btn = event.target.closest(".cmdk-item");
      if (!btn) return;
      execute(Number(btn.getAttribute("data-cmdk-i")));
    });

    // Click no backdrop fecha
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CommandPalette = { open: open, close: close };
  console.log("[cmdk] palette inicializado");
})();
