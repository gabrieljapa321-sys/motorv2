# Arquitetura

Resumo operacional do app `motor/` apos o refactor em 7 passos.

## Shell

- `index.html`: shell estatico do app, navegacao primaria/secundaria, modais e ordem de scripts.
- `assets/css/app.css`: agregador das folhas por dominio.
- `service-worker.js`: politica de cache centralizada do PWA.

## Dados

- `assets/js/app-data.js`: carrega `study-data.json`, `ui-config.json` e `exercises.json` via `fetch` assincrono.
- `window.__studyDataReady`: promise global usada pelo boot.
- `window.StudyData`: store vivo com `data`, `config`, `exercises` e `load()`.

## Runtime central

- `assets/js/app-core.js`: estado principal, roteamento por hash, boot, render raiz e ciclo de vida do app.
- `assets/js/home-dashboard.js`: dominio da home extraido do nucleo.
- `assets/js/app-pages.js`: renderizadores centrais restantes.
- `assets/js/grades-page.js`: dominio de notas extraido de `app-pages.js`.

## Estado

- `assets/js/store.js`: schema, hidratacao, migracao, merge e normalizacao.
- `state` continua central no runtime, mas o app agora expoe hooks explicitos em `window.StudyApp`.

## Hooks do StudyApp

- `onReady(listener)`: dispara quando o app terminou de bootar.
- `onStateReplaced(listener)`: dispara quando o estado inteiro e substituido.
- `requestRender()`: pede re-render do app raiz.
- `replaceState(nextState, reason)`: troca o estado central com notificacao.

Esses hooks existem para impedir polling e monkey patch em modulos perifericos.

## Modulos desacoplados

- `assets/js/week-planner.js`: inicia com `StudyApp.onReady(...)` e reage a `onStateReplaced(...)`.
- `assets/js/work-planner.js`: mesmo padrao; nao depende mais de `window.render`.
- `assets/js/firebase-sync.js`: usa `StudyApp.replaceState(...)` quando a nuvem injeta estado novo.

## Sync

- `assets/js/sync-service.js`: login/logout, leitura/escrita em nuvem e reconciliacao silenciosa.
- O popup de escolha de versao foi removido.
- Quando local e nuvem divergem, o servico resolve automaticamente entre:
  - manter local
  - aceitar nuvem
  - mesclar

## Cache

- `service-worker.js` usa buckets estaveis:
  - `motor-shell`
  - `motor-data`
  - `motor-runtime`
- Navegacao, JS, CSS e JSON usam `network-first`.
- Imagens usam `stale-while-revalidate`.
- O HTML nao depende mais de `?v=` manual em assets locais.

## Guardrails

- `tests/test_static_validation.py`: garante ordem de scripts, ausencia de handlers inline, sem funcoes duplicadas em `app-core`, boot assincrono de dados e ausencia de cache busting manual.
- `tests/test_browser_smoke.py`: cobre navegacao, noticias, ticker, notas, calendario, flashcards e trabalho.
- `tools/run-tests.ps1`: executa validacao estatica + smoke tests.

## Regra pratica para proximas mudancas

1. Nao reintroduzir `waitForApp(...)`.
2. Nao sobrescrever `hydrateStateFromRaw`.
3. Nao usar `window.render` em modulos perifericos; usar `StudyApp.requestRender()`.
4. Nao voltar a usar `?v=` em assets locais.
5. Sempre rodar `tools/run-tests.ps1` antes de publicar.
