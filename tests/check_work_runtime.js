// Smoke test runtime do work-planner em JSDOM.
// Carrega index.html + scripts essenciais (work-domain, work-planner, anim, etc),
// simula StudyApp.onReady, alterna o filtro pra cada visao, valida que renderiza.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "outside-only",
  pretendToBeVisual: true
});

const { window } = dom;

// Stubs essenciais
window.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => "" });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// Carrega scripts em ordem manualmente, pulando módulos pesados não relevantes
const SCRIPT_ORDER = [
  "assets/js/polyfills.js",
  "assets/js/store.js",
  "assets/js/dates.js",
  "assets/js/work-domain.js",
  "assets/js/anim.js"
];

for (const rel of SCRIPT_ORDER) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  try {
    window.eval(src);
  } catch (err) {
    console.error("FALHA ao carregar", rel, ":", err.message);
    process.exit(1);
  }
}

// Stub do StudyApp/state — work-planner depende disso
window.state = {
  workTasks: [
    { id: "t1", itemKind: "task",     title: "Validar Q1 BENEVA",     companyId: "beneva",    status: "planned",  scope: "company", priority: "high",     scheduledDayIso: window.WorkDomain.todayIso(), nextAction: "Validar Q1", area: "financeiro" },
    { id: "t2", itemKind: "followup", title: "Cobrar minuta TSEA",     companyId: "tsea",      status: "waiting",  scope: "company", priority: "medium",   dueDate: "2026-04-20", nextAction: "Ligar pro juridico",  lastInteractionAt: "2026-04-22T10:00:00Z", area: "followup" },
    { id: "t3", itemKind: "meeting",  title: "Reuniao Itamaraca SPE",  companyId: "itamaraca-spe", status: "planned", scope: "company", priority: "critical", dueDate: "2026-04-26", meetingTime: "14:30", nextAction: "Confirmar agenda", area: "reuniao" },
    { id: "t4", itemKind: "email",    title: "Responder CFO",          companyId: "beneva",    status: "inbox",    scope: "company", priority: "low",      emailFrom: "cfo@beneva.com", area: "operacional" },
    { id: "t5", itemKind: "document", title: "Revisar contrato",       companyId: "tsea",      status: "planned",  scope: "company", priority: "medium",   dueDate: "2026-05-05", documentUrl: "https://exemplo.com/doc.pdf", scheduledDayIso: "2026-04-28", area: "auditoria" }
  ],
  workFilter: "today",
  workWeekAnchor: window.WorkDomain.todayIso(),
  deadlines: [],
  appContext: "work"
};

window.saveState = () => {};
window.showToast = (msg) => console.log("  toast:", msg);
window.openPage = () => {};

// Mini StudyApp (so o suficiente pro work-planner)
const readyCallbacks = [];
const stateReplacedCallbacks = [];
window.StudyApp = {
  onReady(cb) { readyCallbacks.push(cb); },
  onStateReplaced(cb) { stateReplacedCallbacks.push(cb); },
  requestRender() {}
};

// Carrega work-planner
try {
  const wpSrc = fs.readFileSync(path.join(ROOT, "assets/js/work-planner.js"), "utf8");
  window.eval(wpSrc);
} catch (err) {
  console.error("FALHA ao carregar work-planner:", err.message);
  console.error(err.stack);
  process.exit(1);
}

// Dispara onReady para inicializar
try {
  readyCallbacks.forEach((cb) => cb(window.StudyApp));
} catch (err) {
  console.error("FALHA no init do work-planner:", err.message);
  console.error(err.stack);
  process.exit(1);
}

const doc = window.document;

// Tira o hidden do workPage (em produção isso é feito pelo home-dashboard)
const workPage = doc.getElementById("workPage");
if (!workPage) {
  console.error("FAIL: #workPage não existe no HTML");
  process.exit(1);
}
workPage.removeAttribute("hidden");

console.log("=== Verificacao Runtime · Aba Trabalho ===\n");

if (!window.WorkPlanner) {
  console.error("FAIL: WorkPlanner não foi exposto");
  process.exit(1);
}

// API publica intacta
const api = ["render", "addTask", "updateTask", "deleteTask", "openCapture", "closeCapture", "setFilter", "getCurrentWeekStart"];
let bad = 0;
api.forEach((m) => {
  if (typeof window.WorkPlanner[m] !== "function") {
    console.log("FAIL: WorkPlanner." + m + " ausente");
    bad++;
  } else {
    console.log("OK:   WorkPlanner." + m);
  }
});

// Renderiza
try {
  window.WorkPlanner.render();
  console.log("OK:   render() sem throw");
} catch (err) {
  console.log("FAIL: render() lançou:", err.message);
  console.error(err.stack);
  bad++;
}

// Verifica DOM populado
function assertDom(selector, label) {
  const el = doc.querySelector(selector);
  if (el && el.children.length > 0) {
    console.log("OK:   " + label + " populado (" + el.children.length + " filhos)");
  } else if (el) {
    console.log("WARN: " + label + " presente mas vazio");
  } else {
    console.log("FAIL: " + label + " ausente");
    bad++;
  }
}

assertDom("#workSidebar", "Sidebar");
assertDom("#workWorkspaceHeader", "Header");
assertDom("#workBoard", "Board");

// Conta filtros e itens da sidebar
const sideItems = doc.querySelectorAll("#workSidebar [data-work-filter]");
console.log("OK:   Sidebar tem " + sideItems.length + " itens de filtro");

// Para cada visao principal: troca filtro e re-renderiza
const filters = ["today", "week", "overdue", "waiting", "inbox", "all", "kind:followup", "kind:email", "kind:meeting", "kind:document", "beneva", "tsea", "itamaraca-spe"];
console.log("\n--- Trocando entre filtros ---");
filters.forEach((f) => {
  try {
    window.WorkPlanner.setFilter(f);
    const board = doc.getElementById("workBoard");
    const html = board.innerHTML;
    if (html.length > 0) {
      console.log("OK:   filter=" + f + " — board com " + html.length + " chars");
    } else {
      console.log("FAIL: filter=" + f + " — board vazio");
      bad++;
    }
  } catch (err) {
    console.log("FAIL: filter=" + f + " lançou:", err.message);
    bad++;
  }
});

// Captura
console.log("\n--- Captura ---");
try {
  window.WorkPlanner.openCapture();
  const slot = doc.getElementById("workCapture");
  const form = doc.getElementById("workCaptureForm");
  if (form) {
    console.log("OK:   openCapture() criou form");
    const kindSelect = form.querySelector("select[name=itemKind]");
    if (kindSelect && kindSelect.options.length === 5) {
      console.log("OK:   campo Tipo tem 5 opções (" + Array.from(kindSelect.options).map(o=>o.value).join(",") + ")");
    } else {
      console.log("FAIL: campo Tipo ausente ou com opções erradas");
      bad++;
    }
  } else {
    console.log("FAIL: openCapture() não criou form");
    bad++;
  }
  window.WorkPlanner.closeCapture();
  console.log("OK:   closeCapture() não lançou");
} catch (err) {
  console.log("FAIL: capture:", err.message);
  bad++;
}

// addTask
console.log("\n--- addTask ---");
try {
  const task = window.WorkPlanner.addTask({
    title: "Teste runtime",
    itemKind: "followup",
    companyId: "beneva",
    scope: "company",
    priority: "high",
    nextAction: "Cobrar"
  });
  if (task && task.id && task.itemKind === "followup") {
    console.log("OK:   addTask criou task " + task.id + " kind=" + task.itemKind);
  } else {
    console.log("FAIL: addTask retornou " + JSON.stringify(task));
    bad++;
  }
} catch (err) {
  console.log("FAIL: addTask:", err.message);
  bad++;
}

// Filtro de empresa: deve mostrar pagina de Investida
console.log("\n--- Pagina de Investida ---");
try {
  window.WorkPlanner.setFilter("beneva");
  const head = doc.getElementById("workWorkspaceHeader");
  if (head.querySelector(".wk-co-page")) {
    console.log("OK:   Header da Investida (.wk-co-page) renderizado");
    const stats = head.querySelectorAll(".wk-co-stat");
    if (stats.length === 4) console.log("OK:   4 stats no header (abertas/hoje/atrasadas/aguardando)");
    else { console.log("FAIL: stats=" + stats.length + " (esperado 4)"); bad++; }
  } else {
    console.log("FAIL: Header da Investida não foi renderizado");
    bad++;
  }
  // Timeline mista no board
  const board = doc.getElementById("workBoard");
  if (board.querySelector(".wk-timeline")) {
    console.log("OK:   Timeline mista (.wk-timeline) renderizada");
    const tlItems = board.querySelectorAll(".wk-tl-item");
    console.log("OK:   " + tlItems.length + " itens na timeline");
  } else {
    console.log("FAIL: Timeline não foi renderizada");
    bad++;
  }
} catch (err) {
  console.log("FAIL: pagina investida:", err.message);
  console.error(err.stack);
  bad++;
}

console.log("\n" + (bad === 0 ? "=> ABA TRABALHO OK NO RUNTIME" : "=> " + bad + " FALHAS"));
process.exit(bad === 0 ? 0 : 1);
