(() => {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     NEWS FEED · v3 — Editorial Bloomberg/FT
     ─────────────────────────────────────────────────────────────────
     Estrutura de render:
       hero (#newsLeadCard)        — manchete principal com imagem grande
       feed list (#newsFeedList)   — grid editorial denso
       aside inbox (#newsInboxCard)
       aside digest (#newsDigestCard)
       filters (#newsCategoryFilters / #newsSourceFilters)

     Contratos preservados:
       window.NewsFeed.{init, render, fetchFeed, getItems}
       state.newsCategory / newsSource / newsSeenIds / newsKnownIds
       Delegação [data-news-category|source|open|mark-read|show-more]
     ═══════════════════════════════════════════════════════════════════ */

  const NEWS_PATH = "assets/data/news.json";
  const DEFAULT_CONFIG = { pollMinutes: 5, newWindowMinutes: 180, maxInboxItems: 12 };

  const runtime = {
    payload: null,
    pollTimer: null,
    fetchPromise: null,
    initialized: false,
    lastNotifiedSignature: "",
    lastFetchError: null,
    feedVisibleCount: 9,
    isRefreshing: false
  };

  function getApp() { return window.StudyApp || null; }
  function getConfig() { const a = getApp(); return { ...DEFAULT_CONFIG, ...((a && a.newsConfig) || {}) }; }
  function getState() { const a = getApp(); return a && typeof a.getStateSnapshot === "function" ? a.getStateSnapshot() : {}; }
  function commitState(updater, opts = {}) { const a = getApp(); if (!a || typeof a.commitState !== "function") return {}; return a.commitState(updater, opts); }
  function showToast(msg) { const a = getApp(); if (a && typeof a.showToast === "function") a.showToast(msg); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function normalizeKey(value) {
    return String(value || "").normalize("NFD")
      .replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function ensureArray(value) { return Array.isArray(value) ? value : []; }

  function formatDateTime(value) {
    if (!value) return "Sem horário";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatRelativeTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    const fmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
    if (Math.abs(diffMin) < 60) return fmt.format(diffMin, "minute");
    const diffHr = Math.round(diffMin / 60);
    if (Math.abs(diffHr) < 36) return fmt.format(diffHr, "hour");
    const diffDay = Math.round(diffHr / 24);
    return fmt.format(diffDay, "day");
  }

  function dedupeIds(values, limit = 600) {
    const seen = new Set(); const output = [];
    ensureArray(values).forEach((v) => {
      if (typeof v !== "string") return;
      const c = v.trim();
      if (!c || seen.has(c)) return;
      seen.add(c); output.push(c);
    });
    return output.slice(0, limit);
  }

  /* ───────────── Sanitização (mesmo shape do v2) ───────────── */

  function sanitizeItem(raw, index) {
    const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt : null;
    const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : "Fonte";
    const category = typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "latest";
    const idBase = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : normalizeKey(`${category}-${source}-${raw.title || index}`);
    return {
      id: idBase || `news-item-${index}`,
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Sem título",
      summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 380) : "",
      details: typeof raw.details === "string" ? raw.details.trim().slice(0, 420) : "",
      imageUrl: typeof raw.imageUrl === "string" && raw.imageUrl.trim() ? raw.imageUrl.trim() : "",
      url: typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : "#",
      source,
      category,
      tags: ensureArray(raw.tags).filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 5),
      publishedAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : publishedAt,
      premium: Boolean(raw.premium),
      sourceQuery: typeof raw.sourceQuery === "string" ? raw.sourceQuery.trim() : ""
    };
  }

  function sanitizePayload(payload) {
    const items = ensureArray(payload && payload.items)
      .map(sanitizeItem)
      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    const categories = ensureArray(payload && payload.categories).filter((c) => c && typeof c === "object");
    return {
      updatedAt: payload && typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
      generatedAt: payload && typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      sources: ensureArray(payload && payload.sources).filter((s) => s && typeof s === "object"),
      categories: categories.length ? categories : [
        { id: "all", label: "Tudo" },
        ...Array.from(new Set(items.map((i) => i.category))).map((c) => ({ id: c, label: c === "latest" ? "Última hora" : c }))
      ],
      items
    };
  }

  /* ───────────── Mídia com fallback ───────────── */

  function renderMedia(item, mediaClass) {
    const initial = escapeHtml((item.source || item.category || "N").slice(0, 1).toUpperCase());
    if (item.imageUrl) {
      const url = encodeURI(item.imageUrl);
      return `<div class="${mediaClass}" data-news-media="true" aria-hidden="true">
        <img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-news-media-img="true">
        <span class="${mediaClass}-fallback-glyph">${initial}</span>
      </div>`;
    }
    return `<div class="${mediaClass} ${mediaClass}--fallback" aria-hidden="true">
      <span class="${mediaClass}-fallback-glyph">${initial}</span>
    </div>`;
  }

  function setupNewsMediaErrorHandler() {
    if (document.body.getAttribute("data-news-media-err-bound") === "true") return;
    document.body.setAttribute("data-news-media-err-bound", "true");
    document.addEventListener("error", function (event) {
      const img = event.target;
      if (!img || img.tagName !== "IMG") return;
      if (img.getAttribute("data-news-media-img") !== "true") return;
      const container = img.parentElement;
      if (!container) return;
      const baseClass = Array.prototype.find.call(container.classList, function (c) {
        return c.startsWith("nx-") && c.endsWith("-media");
      });
      if (baseClass) container.classList.add(baseClass + "--fallback");
      img.remove();
    }, true);
  }
  setupNewsMediaErrorHandler();

  /* ───────────── Helpers de itens ───────────── */

  function getUnreadItems(state = getState(), payload = runtime.payload) {
    if (!payload) return [];
    const seen = new Set(ensureArray(state.newsSeenIds));
    return payload.items.filter((it) => !seen.has(it.id));
  }

  function getFilteredItems(state = getState(), payload = runtime.payload) {
    if (!payload) return [];
    const category = typeof state.newsCategory === "string" ? state.newsCategory : "all";
    const source = typeof state.newsSource === "string" ? state.newsSource : "all";
    return payload.items.filter((it) => {
      if (category !== "all" && it.category !== category) return false;
      if (source !== "all" && normalizeKey(it.source) !== source) return false;
      return true;
    });
  }

  function getSourceOptions(payload = runtime.payload) {
    if (!payload) return [];
    const seen = new Map();
    payload.items.forEach((it) => {
      const key = normalizeKey(it.source);
      if (!key || seen.has(key)) return;
      seen.set(key, { id: key, label: it.source });
    });
    return [{ id: "all", label: "Todas" }, ...Array.from(seen.values())];
  }

  function categoryLabel(cat) {
    if (cat === "latest") return "Última hora";
    if (!cat) return "Geral";
    return cat;
  }

  function updateNavBadge() {
    const badge = document.getElementById("newsNavBadge");
    if (!badge) return;
    const n = getUnreadItems().length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  /* ───────────── Renderers (visual editorial novo) ───────────── */

  function renderFilters() {
    const catHost = document.getElementById("newsCategoryFilters");
    const srcHost = document.getElementById("newsSourceFilters");
    if (!catHost || !srcHost || !runtime.payload) return;
    const state = getState();

    const cats = runtime.payload.categories || [];
    const activeCat = state.newsCategory || "all";
    catHost.innerHTML = cats.map((c) => {
      const sel = c.id === activeCat ? ' aria-pressed="true"' : '';
      return `<button type="button" class="nx-pill" data-news-category="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.label)}</button>`;
    }).join("");

    const srcs = getSourceOptions();
    const activeSrc = state.newsSource || "all";
    srcHost.innerHTML = srcs.map((s) => {
      const sel = s.id === activeSrc ? ' aria-pressed="true"' : '';
      return `<button type="button" class="nx-pill" data-news-source="${escapeHtml(s.id)}"${sel}>${escapeHtml(s.label)}</button>`;
    }).join("");
  }

  function renderHero(items) {
    const host = document.getElementById("newsLeadCard");
    if (!host) return;

    // Estado de erro de fetch tem precedência: mostra mensagem visível e botão de retry.
    if (runtime.lastFetchError && (!runtime.payload || runtime.payload.items.length === 0)) {
      const msg = runtime.lastFetchError.message || "erro desconhecido";
      host.innerHTML = `<div class="nx-empty nx-empty--error">
        <strong>Não consegui carregar o feed.</strong><br>
        <span style="display:block;margin-top:6px;font-size:12px;font-style:normal;">${escapeHtml(msg)}</span>
        <button type="button" class="nx-btn nx-btn--primary" id="newsRetryBtn" style="margin-top:14px;">Tentar de novo</button>
      </div>`;
      const retry = host.querySelector("#newsRetryBtn");
      if (retry) retry.addEventListener("click", () => {
        runtime.lastFetchError = null;
        fetchFeed({ force: true, showSuccess: true });
      });
      return;
    }

    const item = items[0];
    if (!item) {
      host.innerHTML = runtime.payload
        ? '<div class="nx-empty">Nenhuma notícia disponível com os filtros atuais.</div>'
        : '<div class="nx-empty">Carregando feed…</div>';
      return;
    }
    const unread = !((getState().newsSeenIds || []).includes(item.id));
    const summary = item.details || item.summary || "";
    host.innerHTML = `
      <a class="nx-hero-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-news-open="${escapeHtml(item.id)}">
        ${renderMedia(item, "nx-hero-media")}
        <div class="nx-hero-body">
          <div class="nx-hero-meta">
            <span class="nx-hero-cat">${escapeHtml(categoryLabel(item.category))}</span>
            <span class="nx-hero-source">${escapeHtml(item.source)}</span>
            <span class="nx-hero-time">${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
            ${unread ? '<span class="nx-flag-new" aria-label="Não lida">Nova</span>' : ''}
          </div>
          <h2 class="nx-hero-title">${escapeHtml(item.title)}</h2>
          ${summary ? `<p class="nx-hero-summary">${escapeHtml(summary.slice(0, 280))}</p>` : ''}
          <div class="nx-hero-byline">
            <span class="nx-hero-byline-text">Abrir matéria</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>
        </div>
      </a>
    `;
  }

  function renderFeed(items) {
    const host = document.getElementById("newsFeedList");
    if (!host) return;
    const state = getState();
    const seen = new Set(ensureArray(state.newsSeenIds));

    // pula o primeiro (já está no hero) quando há mais de 1
    const remaining = items.length > 1 ? items.slice(1) : items;
    if (!remaining.length) {
      host.innerHTML = '<div class="nx-empty">Nenhuma manchete adicional para os filtros atuais.</div>';
      return;
    }

    const visible = remaining.slice(0, runtime.feedVisibleCount);
    const cards = visible.map((item) => {
      const unread = !seen.has(item.id);
      const tags = (item.tags || []).slice(0, 2).map((t) => `<span class="nx-tag">${escapeHtml(t)}</span>`).join("");
      return `
      <article class="nx-card${unread ? " nx-card--unread" : ""}" data-news-item-id="${escapeHtml(item.id)}">
        <a class="nx-card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-news-open="${escapeHtml(item.id)}">
          ${renderMedia(item, "nx-card-media")}
          <div class="nx-card-body">
            <div class="nx-card-meta">
              <span class="nx-card-source">${escapeHtml(item.source)}</span>
              <span class="nx-card-time">${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
              ${unread ? '<span class="nx-flag-new" aria-label="Não lida">Nova</span>' : ''}
              ${item.premium ? '<span class="nx-flag-premium">Premium</span>' : ''}
            </div>
            <h3 class="nx-card-title">${escapeHtml(item.title)}</h3>
            ${item.summary ? `<p class="nx-card-summary">${escapeHtml(item.summary.slice(0, 160))}</p>` : ''}
            <div class="nx-card-foot">
              <span class="nx-card-cat">${escapeHtml(categoryLabel(item.category))}</span>
              ${tags}
            </div>
          </div>
        </a>
        ${unread ? `<button type="button" class="nx-card-read-btn" data-news-mark-read="${escapeHtml(item.id)}" aria-label="Marcar como lida"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
      </article>
    `}).join("");

    const more = remaining.length > runtime.feedVisibleCount
      ? `<div class="nx-feed-more"><button type="button" class="nx-btn nx-btn--ghost" data-news-show-more>Mostrar mais ${Math.min(6, remaining.length - runtime.feedVisibleCount)}</button></div>`
      : "";

    host.innerHTML = `<div class="nx-card-grid">${cards}</div>${more}`;
  }

  function renderInbox() {
    const host = document.getElementById("newsInboxCard");
    if (!host) return;
    const state = getState();
    const config = getConfig();
    const unread = getUnreadItems(state).slice(0, Math.min(config.maxInboxItems, 5));
    host.innerHTML = `
      <header class="nx-aside-head">
        <span class="nx-aside-eyebrow">Caixa</span>
        <h3 class="nx-aside-title">Não lidas</h3>
        <span class="nx-aside-count">${unread.length}</span>
      </header>
      ${unread.length ? `
        <ul class="nx-inbox-list" role="list">
          ${unread.map((item) => `
            <li class="nx-inbox-item">
              <button type="button" class="nx-inbox-row" data-news-open="${escapeHtml(item.id)}">
                <span class="nx-inbox-headline">${escapeHtml(item.title)}</span>
                <span class="nx-inbox-meta">${escapeHtml(item.source)} <span class="nx-sep" aria-hidden="true">·</span> ${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
              </button>
            </li>
          `).join("")}
        </ul>
      ` : '<p class="nx-empty">Inbox limpa. Quando surgirem novas manchetes, elas aparecem aqui.</p>'}
    `;
  }

  function renderDigest(items) {
    const host = document.getElementById("newsDigestCard");
    if (!host) return;
    const state = getState();
    const updatedAt = runtime.payload ? formatDateTime(runtime.payload.updatedAt) : "—";
    const browserStatus = !("Notification" in window) ? "sem suporte"
      : Notification.permission === "granted" ? (state.newsBrowserNotificationsEnabled ? "ativos" : "desativados")
      : Notification.permission === "denied" ? "bloqueado"
      : "pendente";
    const sources = getSourceOptions().filter((s) => s.id !== "all").slice(0, 8);

    host.innerHTML = `
      <header class="nx-aside-head">
        <span class="nx-aside-eyebrow">Resumo</span>
        <h3 class="nx-aside-title">Estado do feed</h3>
      </header>
      <div class="nx-digest-rows">
        <div class="nx-digest-row">
          <span class="nx-digest-key">Itens visíveis</span>
          <span class="nx-digest-val">${items.length}</span>
        </div>
        <div class="nx-digest-row">
          <span class="nx-digest-key">Última coleta</span>
          <span class="nx-digest-val">${escapeHtml(updatedAt)}</span>
        </div>
        <div class="nx-digest-row">
          <span class="nx-digest-key">Alertas</span>
          <span class="nx-digest-val">${escapeHtml(browserStatus)}</span>
        </div>
      </div>
      ${sources.length ? `
      <div class="nx-digest-sources">
        <span class="nx-digest-key">Fontes ativas</span>
        <div class="nx-digest-source-row">
          ${sources.map((s) => `<span class="nx-tag">${escapeHtml(s.label)}</span>`).join("")}
        </div>
      </div>
      ` : ''}
    `;
  }

  function renderStatus() {
    const updatedAtChip = document.getElementById("newsUpdatedAtChip");
    const unreadChip = document.getElementById("newsUnreadChip");
    const permissionBtn = document.getElementById("newsPermissionBtn");
    const unread = getUnreadItems().length;

    if (updatedAtChip) {
      const label = runtime.isRefreshing ? "Atualizando…"
        : runtime.payload ? `Atualizado ${formatRelativeTime(runtime.payload.updatedAt)}`
        : "Sem feed";
      updatedAtChip.textContent = label;
    }
    if (unreadChip) {
      unreadChip.textContent = `${unread} ${unread === 1 ? "nova" : "novas"}`;
      unreadChip.dataset.tone = unread ? "accent" : "neutral";
    }
    if (permissionBtn) {
      const enabled = getState().newsBrowserNotificationsEnabled;
      if (!("Notification" in window)) {
        permissionBtn.textContent = "Sem suporte";
        permissionBtn.disabled = true;
      } else if (Notification.permission === "granted") {
        permissionBtn.textContent = enabled ? "Alertas ativos" : "Ativar alertas";
      } else if (Notification.permission === "denied") {
        permissionBtn.textContent = "Alertas bloqueados";
      } else {
        permissionBtn.textContent = "Alertas";
      }
    }
  }

  function setRefreshButtonState(isRefreshing) {
    runtime.isRefreshing = Boolean(isRefreshing);
    const btn = document.getElementById("newsRefreshBtn");
    if (btn) {
      btn.disabled = runtime.isRefreshing;
      btn.setAttribute("aria-busy", runtime.isRefreshing ? "true" : "false");
      btn.classList.toggle("nx-btn--busy", runtime.isRefreshing);
      const span = btn.querySelector("span");
      if (span) span.textContent = runtime.isRefreshing ? "Atualizando…" : "Atualizar";
    }
    renderStatus();
  }

  function render() {
    updateNavBadge();
    renderStatus();
    renderFilters();
    const items = getFilteredItems();
    renderHero(items);
    renderFeed(items);
    renderInbox();
    renderDigest(items);

    // Animação stagger nos cards (suave) — só na primeira render do batch
    if (window.Anim && typeof window.Anim.fadeUpStagger === "function") {
      const cards = document.querySelectorAll("#newsFeedList .nx-card");
      if (cards.length) window.Anim.fadeUpStagger(cards, { duration: 0.32, stagger: 0.03 });
    }
  }

  /* ───────────── Estado: marcação de lidas ───────────── */

  function markItemsAsRead(ids) {
    const next = dedupeIds([...(getState().newsSeenIds || []), ...ids]);
    commitState((draft) => { draft.newsSeenIds = next; }, { render: false });
    render();
  }

  function findItem(id) {
    return runtime.payload ? runtime.payload.items.find((i) => i.id === id) || null : null;
  }

  function handleOpenItem(id, opts = {}) {
    if (!id) return;
    markItemsAsRead([id]);
    if (!opts.openSource) return;
    const item = findItem(id);
    if (item && item.url && item.url !== "#") window.open(item.url, "_blank", "noopener");
  }

  /* ───────────── Notificações de novas ───────────── */

  function maybeNotify(newItems) {
    if (!newItems.length) return;
    const state = getState();
    const sig = newItems.map((i) => i.id).join("|");
    if (runtime.lastNotifiedSignature === sig) return;
    runtime.lastNotifiedSignature = sig;
    showToast(`${newItems.length} ${newItems.length === 1 ? "notícia nova" : "notícias novas"} no feed.`);
    if (!state.newsBrowserNotificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    newItems.slice(0, 3).forEach((item) => {
      try {
        const n = new Notification(item.source, { body: item.title, tag: `news-${item.id}`, silent: false });
        n.onclick = () => { window.focus(); handleOpenItem(item.id, { openSource: true }); n.close(); };
      } catch (_e) { /* ignore */ }
    });
  }

  function handleFetchedPayload(payload) {
    runtime.payload = payload;
    runtime.lastFetchError = null;
    const state = getState();
    const known = dedupeIds(state.newsKnownIds || []);
    const nextKnown = dedupeIds([...payload.items.map((i) => i.id), ...known]);
    const firstLoad = known.length === 0;
    const newIds = payload.items.map((i) => i.id).filter((id) => !known.includes(id));
    commitState((draft) => {
      draft.newsKnownIds = nextKnown;
      draft.newsLastSyncAt = payload.updatedAt || new Date().toISOString();
      // P3: nao auto-marca itens como lidos no primeiro load — deixa o usuario ver tudo como novo.
      if (!Array.isArray(draft.newsSeenIds)) draft.newsSeenIds = [];
    }, { render: false });
    render();
    if (!firstLoad) maybeNotify(payload.items.filter((i) => newIds.includes(i.id)));
  }

  /* ───────────── Fetch ───────────── */

  async function fetchFeed(options = {}) {
    if (runtime.fetchPromise) {
      if (options.force === true) return runtime.fetchPromise.finally(() => fetchFeed({ ...options, force: false }));
      return runtime.fetchPromise;
    }
    console.log("[news-feed] fetchFeed iniciando…", options);
    setRefreshButtonState(true);
    const url = `${NEWS_PATH}?ts=${Date.now()}`;
    runtime.fetchPromise = fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache" },
      credentials: "same-origin"
    })
      .then((r) => {
        console.log("[news-feed] response status:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => {
        const itemCount = payload && Array.isArray(payload.items) ? payload.items.length : 0;
        console.log("[news-feed] payload recebido,", itemCount, "itens");
        handleFetchedPayload(sanitizePayload(payload));
        if (options.showSuccess) showToast("Feed atualizado.");
      })
      .catch((err) => {
        console.error("[news-feed] falha no fetch:", err);
        runtime.lastFetchError = err;
        if (options.silent !== true) showToast("Falha ao carregar feed: " + (err.message || "erro desconhecido"));
        render();
      })
      .finally(() => {
        setRefreshButtonState(false);
        runtime.fetchPromise = null;
      });
    return runtime.fetchPromise;
  }

  /* ───────────── Filtros ───────────── */

  function setCategory(category) {
    runtime.feedVisibleCount = 9;
    commitState((draft) => { draft.newsCategory = typeof category === "string" && category ? category : "all"; }, { render: false });
    render();
  }

  function setSource(source) {
    runtime.feedVisibleCount = 9;
    commitState((draft) => { draft.newsSource = typeof source === "string" && source ? source : "all"; }, { render: false });
    render();
  }

  /* ───────────── Permissão de alertas ───────────── */

  async function toggleBrowserAlerts() {
    if (!("Notification" in window)) { showToast("Seu navegador não suporta notificações."); return; }
    const state = getState();
    if (Notification.permission === "granted") {
      commitState((draft) => { draft.newsBrowserNotificationsEnabled = !Boolean(state.newsBrowserNotificationsEnabled); }, { render: false });
      render();
      showToast(getState().newsBrowserNotificationsEnabled ? "Alertas ativados." : "Alertas desativados.");
      return;
    }
    if (Notification.permission === "denied") { showToast("Permissão bloqueada no navegador."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") {
      commitState((draft) => { draft.newsBrowserNotificationsEnabled = true; }, { render: false });
      render();
      showToast("Alertas ativados.");
    } else {
      showToast("Permissão de notificação não concedida.");
    }
  }

  /* ───────────── Eventos ───────────── */

  function bindEvents() {
    if (document.body.getAttribute("data-news-bound") === "true") return;
    document.body.setAttribute("data-news-bound", "true");

    // Delegação global no document — sobrevive a re-renders e a remoção do newsPage do DOM.
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;

      // Só processa se o click foi dentro do newsPage (ou seus modais/etc)
      const insideNews = target.closest("#newsPage");
      const refresh = target.closest("#newsRefreshBtn");
      const perm = target.closest("#newsPermissionBtn");

      if (refresh) {
        event.preventDefault();
        console.log("[news-feed] click em Atualizar");
        fetchFeed({ silent: false, force: true, showSuccess: true });
        return;
      }
      if (perm) {
        event.preventDefault();
        toggleBrowserAlerts();
        return;
      }
      if (!insideNews) return;

      const cat = target.closest("[data-news-category]");
      if (cat) { setCategory(cat.getAttribute("data-news-category")); return; }
      const src = target.closest("[data-news-source]");
      if (src) { setSource(src.getAttribute("data-news-source")); return; }
      const more = target.closest("[data-news-show-more]");
      if (more) { runtime.feedVisibleCount += 6; render(); return; }
      const open = target.closest("[data-news-open]");
      if (open) { handleOpenItem(open.getAttribute("data-news-open"), { openSource: open.tagName !== "A" }); return; }
      const mark = target.closest("[data-news-mark-read]");
      if (mark) {
        event.preventDefault(); event.stopPropagation();
        markItemsAsRead([mark.getAttribute("data-news-mark-read")]);
        return;
      }
      const markAll = target.closest("#newsMarkAllBtn");
      if (markAll) markItemsAsRead(getUnreadItems().map((i) => i.id));
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchFeed({ silent: true });
    });
  }

  function startPolling() {
    if (runtime.pollTimer) clearInterval(runtime.pollTimer);
    const intervalMs = Math.max(1, getConfig().pollMinutes) * 60 * 1000;
    runtime.pollTimer = window.setInterval(() => fetchFeed({ silent: true }), intervalMs);
  }

  function init() {
    if (runtime.initialized) return;
    runtime.initialized = true;
    bindEvents();
    startPolling();
    fetchFeed({ silent: true });
  }

  function getItems(options) {
    const limit = options && Number.isFinite(options.limit) ? options.limit : 12;
    if (!runtime.payload || !Array.isArray(runtime.payload.items)) return [];
    return runtime.payload.items.slice(0, limit);
  }

  window.NewsFeed = { init, render, fetchFeed, getItems };
  console.log("[news-feed] v3 inicializado (editorial)");
})();
