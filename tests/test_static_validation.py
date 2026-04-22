import pathlib
import re
import unittest
import json
from collections import Counter

import esprima


ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
JS_DIR = ROOT / "assets" / "js"
CSS_DIR = ROOT / "assets" / "css"
DATA_DIR = ROOT / "assets" / "data"
MANIFEST = ROOT / "manifest.webmanifest"
SERVICE_WORKER = ROOT / "service-worker.js"
APP_DATA = JS_DIR / "app-data.js"
APP_INIT = JS_DIR / "app-init.js"
APP_CORE = JS_DIR / "app-core.js"
WEEK_PLANNER = JS_DIR / "week-planner.js"
WORK_PLANNER = JS_DIR / "work-planner.js"
SYNC_SERVICE = JS_DIR / "sync-service.js"
ARCHITECTURE_DOC = ROOT / "ARCHITECTURE.md"
DOM_DUMP = ROOT / "dom_dump.html"


class StaticValidationTests(unittest.TestCase):
    def test_index_has_no_inline_handlers(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIsNone(
            re.search(r"on(click|change|submit|input|keydown)\s*=", html),
            "index.html não deve conter handlers inline",
        )

    def test_index_has_no_manual_asset_version_queries(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        local_asset_refs = re.findall(r'(?:src|href)="([^"]+)"', html)
        local_asset_refs = [ref for ref in local_asset_refs if not ref.startswith("http")]
        self.assertFalse(
            any("?v=" in ref for ref in local_asset_refs),
            "Assets locais nao devem depender de query string manual para cache busting.",
        )

    def test_accessibility_status_regions_exist(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIn('id="toast" role="status" aria-live="polite"', html)
        self.assertIn('id="authSyncStatus" class="auth-panel-sync" role="status" aria-live="polite"', html)
        self.assertIn('aria-keyshortcuts="Alt+ArrowLeft"', html)
        self.assertIn('aria-keyshortcuts="Alt+ArrowRight"', html)

    def test_navigation_is_split_between_primary_and_study_levels(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        main_nav_block = re.search(r'<nav class="tb-nav".*?</nav>', html, flags=re.S).group(0)
        self.assertEqual(re.findall(r'data-nav-page="([^"]+)"', main_nav_block), ["home", "studies", "news", "work"])
        self.assertIn('id="studyNavBar"', html)
        self.assertIn('data-study-page="dashboard"', html)
        self.assertIn('data-study-page="week"', html)
        self.assertIn('data-study-page="fc"', html)
        self.assertIn('data-study-page="calendar"', html)
        self.assertIn('data-study-page="grades"', html)

    def test_script_order_includes_new_architecture_layers(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        order = [
            "assets/js/store.js",
            "assets/js/dates.js",
            "assets/js/work-domain.js",
            "assets/js/theme.js",
            "assets/js/backup.js",
            "assets/js/sync-service.js",
            "assets/js/app-core.js",
            "assets/js/home-dashboard.js",
            "assets/js/home-panel.js",
            "assets/js/app-pages.js",
            "assets/js/grades-page.js",
            "assets/js/week-planner.js",
            "assets/js/study-features.js",
            "assets/js/flashcards-exams.js",
            "assets/js/app-actions.js",
            "assets/js/work-planner.js",
            "assets/js/news-feed.js",
            "assets/js/ticker-tape.js",
            "assets/js/app-init.js",
            "assets/js/firebase-init.js",
            "assets/js/auth-panel.js",
            "assets/js/firebase-sync.js",
        ]
        positions = [html.index(path) for path in order]
        self.assertEqual(positions, sorted(positions))

    def test_app_css_imports_domain_files(self):
        css = (CSS_DIR / "app.css").read_text(encoding="utf-8")
        for name in ["base.css", "dashboard.css", "calendar.css", "grades.css", "week.css", "flashcards.css", "news.css", "ticker.css", "work.css"]:
            self.assertIn(name, css)

    def test_json_data_files_exist_and_are_valid(self):
        for name in ["study-data.json", "ui-config.json", "exercises.json", "news.json", "ticker-tape.json"]:
            payload = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
            self.assertIsInstance(payload, dict)

    def test_manifest_and_service_worker_exist(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["start_url"], "./")
        self.assertIn("icons", manifest)
        esprima.parseScript(SERVICE_WORKER.read_text(encoding="utf-8"), {"tolerant": False})

    def test_app_data_uses_async_fetch_loader(self):
        code = APP_DATA.read_text(encoding="utf-8")
        self.assertIn("fetch(", code)
        self.assertNotIn("XMLHttpRequest", code)
        self.assertIn("window.__studyDataReady", code)

    def test_app_init_waits_for_data_before_boot(self):
        code = APP_INIT.read_text(encoding="utf-8")
        self.assertIn("await window.StudyData.load()", code)
        self.assertIn("window.bootStudyApp()", code)

    def test_app_init_registers_service_worker_without_version_query(self):
        code = APP_INIT.read_text(encoding="utf-8")
        self.assertIn('register("./service-worker.js")', code)
        self.assertNotIn('service-worker.js?v=', code)

    def test_architecture_doc_exists_and_describes_runtime_contracts(self):
        self.assertTrue(ARCHITECTURE_DOC.exists(), "ARCHITECTURE.md deve existir.")
        doc = ARCHITECTURE_DOC.read_text(encoding="utf-8")
        for snippet in [
            "window.StudyData",
            "window.StudyApp",
            "onReady(listener)",
            "onStateReplaced(listener)",
            "motor-shell",
            "network-first",
            "tools/run-tests.ps1",
        ]:
            self.assertIn(snippet, doc)

    def test_sync_service_uses_silent_conflict_resolution(self):
        code = SYNC_SERVICE.read_text(encoding="utf-8")
        self.assertIn("resolveConflictSilently", code)
        self.assertIn("silent-merge-resolution", code)
        self.assertNotIn("requestConflictResolution(", code)

    def test_dom_dump_artifact_removed(self):
        self.assertFalse(DOM_DUMP.exists(), "dom_dump.html nao deve voltar para o repo.")

    def test_planners_use_explicit_app_lifecycle_hooks(self):
        app_core_code = APP_CORE.read_text(encoding="utf-8")
        week_code = WEEK_PLANNER.read_text(encoding="utf-8")
        work_code = WORK_PLANNER.read_text(encoding="utf-8")

        self.assertIn("onReady", app_core_code)
        self.assertIn("onStateReplaced", app_core_code)
        self.assertIn("requestRender", app_core_code)

        self.assertNotIn("waitForApp(", week_code)
        self.assertNotIn("hydrateStateFromRaw =", week_code)
        self.assertIn("onReady(initWeekPlanner)", week_code)
        self.assertIn("onStateReplaced", week_code)

        self.assertNotIn("waitForApp(", work_code)
        self.assertNotIn("window.render", work_code)
        self.assertIn("onReady(initWorkPlanner)", work_code)
        self.assertIn("requestRender", work_code)

    def test_all_js_files_parse(self):
        for path in sorted(JS_DIR.glob("*.js")):
            code = path.read_text(encoding="utf-8")
            if path.name == "firebase-init.js" or "import " in code or "export " in code:
                esprima.parseModule(code, {"tolerant": False})
            else:
                esprima.parseScript(code, {"tolerant": False})

    def test_app_core_has_no_duplicate_function_declarations(self):
        code = (JS_DIR / "app-core.js").read_text(encoding="utf-8")
        names = re.findall(r"^[ \t]*function\s+([A-Za-z0-9_]+)\s*\(", code, flags=re.M)
        duplicates = sorted(name for name, count in Counter(names).items() if count > 1)
        self.assertEqual(duplicates, [], f"app-core.js tem funcoes duplicadas: {duplicates}")


if __name__ == "__main__":
    unittest.main()
