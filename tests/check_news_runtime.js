// Smoke runtime do news-feed em JSDOM.
// Carrega scripts essenciais, simula StudyApp.onReady, dispara fetch e
// verifica que tudo renderiza nas regiões certas.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const newsPayload = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/news.json"), "utf8"));

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "outside-only",
  pretendToBeVisual: true
});
const w = dom.window;

// fetch stub que devolve o news.json
w.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => newsPayload,
  text: async () => JSON.stringify(newsPayload)
});
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);

// Stubs de state e StudyApp
w.state = {
  newsCategory: "all",
  newsSource: "all",
  newsSeenIds: [],
  newsKnownIds: [],
  newsBrowserNotificationsEnabled: false,
  newsLastSyncAt: null
};
w.saveState = () => {};
w.showToast = (m) => console.log("  toast:", m);

const readyCbs = [];
w.StudyApp = {
  onReady(cb) { readyCbs.push(cb); },
  onStateReplaced(cb) {},
  requestRender() {},
  getStateSnapshot() { return w.state; },
  commitState(updater, opts) {
    const draft = JSON.parse(JSON.stringify(w.state));
    updater(draft);
    Object.assign(w.state, draft);
    return draft;
  },
  showToast: (m) => console.log("  toast:", m),
  newsConfig: { pollMinutes: 999, newWindowMinutes: 180, maxInboxItems: 12 }
};

// Carrega news-feed (não precisa de outros scripts pra news funcionar)
const src = fs.readFileSync(path.join(ROOT, "assets/js/news-feed.js"), "utf8");
try { w.eval(src); }
catch (err) {
  console.error("Falha ao avaliar news-feed.js:", err.message);
  console.error(err.stack);
  process.exit(1);
}

// Inicializa
console.log("=== News Runtime Smoke Test ===\n");

if (!w.NewsFeed) {
  console.error("FAIL: window.NewsFeed não exposto");
  process.exit(1);
}

// Tira hidden do newsPage
const newsPage = w.document.getElementById("newsPage");
if (newsPage) newsPage.removeAttribute("hidden");

// Initialize
w.NewsFeed.init();

// Dispara fetch e aguarda
(async () => {
  try {
    await w.NewsFeed.fetchFeed({ silent: true });
    console.log("OK:   fetchFeed completou");
  } catch (err) {
    console.error("FAIL: fetchFeed lançou:", err.message);
    console.error(err.stack);
    process.exit(1);
  }

  // Verificação do DOM populado
  const d = w.document;
  function check(label, sel, expect) {
    const el = d.querySelector(sel);
    if (!el) { console.log("FAIL:", label, "(seletor", sel, "não encontrado)"); return false; }
    const ok = expect ? expect(el) : (el.children.length > 0 || el.innerHTML.trim().length > 0);
    console.log((ok ? "OK:  " : "FAIL:") + " " + label + " " + (ok ? "(ok)" : "(vazio)"));
    return ok;
  }

  let bad = 0;
  if (!check("Hero populado", "#newsLeadCard")) bad++;
  if (!check("Feed populado", "#newsFeedList")) bad++;
  if (!check("Inbox populada", "#newsInboxCard")) bad++;
  if (!check("Digest populada", "#newsDigestCard")) bad++;
  if (!check("Filtros categoria", "#newsCategoryFilters")) bad++;
  if (!check("Filtros fonte", "#newsSourceFilters")) bad++;

  // Conta cards no feed
  const cards = d.querySelectorAll("#newsFeedList .nx-card");
  console.log("OK:   Feed tem " + cards.length + " cards");

  // Verifica que getItems retorna algo
  const items = w.NewsFeed.getItems({ limit: 5 });
  console.log("OK:   getItems retornou " + items.length + " itens");

  // Click no botão "Atualizar agora" deve disparar fetch novamente
  const refreshBtn = d.getElementById("newsRefreshBtn");
  if (!refreshBtn) {
    console.log("FAIL: Botão Atualizar não encontrado");
    bad++;
  } else {
    let fetchCount = 0;
    const origFetch = w.fetch;
    w.fetch = async (url) => { fetchCount++; return origFetch(url); };
    refreshBtn.click();
    await new Promise(r => setTimeout(r, 50));
    if (fetchCount > 0) {
      console.log("OK:   Click em Atualizar disparou novo fetch");
    } else {
      console.log("FAIL: Click em Atualizar NÃO disparou novo fetch");
      bad++;
    }
  }

  // Click em pill de categoria deve filtrar
  const catPill = d.querySelector("[data-news-category]");
  if (catPill) {
    catPill.click();
    await new Promise(r => setTimeout(r, 30));
    console.log("OK:   Click em filtro de categoria não lançou erro");
  }

  console.log("\n" + (bad === 0 ? "=> NEWS RUNTIME OK" : "=> " + bad + " FALHAS"));
  process.exit(bad === 0 ? 0 : 1);
})();
