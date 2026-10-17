"""Browser smoke test for the redesigned shell (NOT part of CI; needs a browser).

Runs against a built app served by `npm run build && npx vite preview --port 4173`,
with every /api/v1 call mocked in-browser, so it has no backend and no side effects.

  pip install playwright && playwright install chromium     # or use a preinstalled Chromium
  npm i --no-save axe-core                                   # provides axe.min.js
  AXE_PATH=node_modules/axe-core/axe.min.js python3 e2e/smoke.py

Checks: legacy URL redirects, 6-item nav, honest idle status, alert deep links,
/applications/:id drawer + Esc, URL-bound filters, no horizontal scroll at
375/768px, mobile drawer behaviour, and axe violations per page (printed).
Console errors for blocked web fonts / missing WebSocket are expected without a backend.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:4173")
AXE = open(os.environ["AXE_PATH"]).read()

USER = {"id": "u1", "email": "demo@example.com", "full_name": "Demo User"}
APP = {"id": "app1", "user_id": "u1", "job_id": "job1", "idempotency_key": "k", "workflow_state": "RECONCILIATION_REQUIRED",
       "outcome_status": "NOT_SUBMITTED", "created_at": "2026-10-01T10:00:00Z", "questions": [], "job_title": "Staff Engineer",
       "company": "Acme", "platform": "linkedin", "match_score": 91}
OVERVIEW = {"today_applied_count": 3, "effective_daily_limit": 25, "quota_remaining": 22, "quota_percentage": 12.0,
  "active_run": {"is_running": False, "run_id": None, "campaign_id": None, "campaign_name": None, "status": "IDLE",
                 "current_job_title": None, "current_platform": None, "progress_percentage": 0.0},
  "needs_attention": [{"id": "a1", "type": "AUTH_EXPIRED", "title": "Linkedin Disconnected", "description": "Session expired",
                       "action_label": "Reconnect", "action_url": "/settings/connections", "severity": "HIGH"}],
  "readiness": [{"key": "platform", "title": "Job Platform Connected", "is_ready": False, "action_label": "Connect Portal", "action_url": "/settings/connections"}],
  "top_matches": [{"job_id": "job1", "title": "Staff Engineer", "company": "Acme", "location": "Remote", "platform": "LinkedIn", "match_score": 94.5, "decision": "AUTO_APPLY"}]}
STATS = {"total": 1, "applied": 0, "paused": 0, "failed": 0, "approval_required": 0, "reconciliation_required": 1, "needs_attention": 1}

def handler(route):
    req = route.request
    path = req.url.split("/api/v1", 1)[1].split("?")[0]
    m = req.method
    body = []
    if path == "/auth/me": body = USER
    elif path == "/automation/active": body = {"status": "IDLE"}
    elif path == "/dashboard/overview": body = OVERVIEW
    elif path == "/applications": body = [APP]
    elif path == "/applications/stats": body = STATS
    elif path == "/applications/applied-map": body = {}
    elif path == "/connections": body = [{"platform": "linkedin", "display_name": "LinkedIn", "status": "DISCONNECTED", "session_active": False, "category": "PORTAL_DISCOVERY", "connection_type": "BROWSER_SESSION", "is_auth_required": True, "capabilities": ["discover"], "description": "demo"}]
    elif path == "/profile": body = {}
    elif path.startswith("/analytics/funnel"): body = {"stages": [], "total": 0}
    elif path.startswith("/analytics/weights-tuning"): body = {}
    elif path.startswith("/analytics/ai-status"): body = {}
    elif path.startswith("/analytics"): body = []
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

results = {"checks": [], "console_errors": [], "axe": {}}
def check(name, ok, detail=""):
    results["checks"].append({"name": name, "ok": bool(ok), "detail": str(detail)})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    def new_page(w, h=900):
        ctx = b.new_context(viewport={"width": w, "height": h})
        ctx.add_init_script("localStorage.setItem('auth_token','t'); localStorage.setItem('refresh_token','r');")
        ctx.route("**/api/v1/**", handler)
        pg = ctx.new_page()
        pg.on("console", lambda msg: results["console_errors"].append(f"{w}px {msg.type}: {msg.text[:160]}") if msg.type == "error" else None)
        pg.on("pageerror", lambda e: results["console_errors"].append(f"{w}px pageerror: {str(e)[:200]}"))
        return pg

    # ---- desktop
    pg = new_page(1280)
    pg.goto(BASE + "/dashboard"); pg.wait_for_selector("text=Command Center", timeout=10000)
    check("legacy /dashboard redirects to /home", pg.url.endswith("/home"), pg.url)
    nav_items = pg.locator("nav[aria-label='Primary navigation'] a").all_inner_texts()
    check("sidebar has 6 items", len(nav_items) == 6, nav_items)
    check("sidebar footer is honest when idle", pg.locator("text=No active run").count() >= 1 and pg.locator("text=Autopilot Active").count() == 0)
    check("no pause/stop controls on Dashboard", pg.get_by_role("button", name="Pause").count() == 0 and pg.get_by_role("button", name="Stop").count() == 0)
    pg.get_by_role("button", name="Reconnect").first.click(); pg.wait_for_timeout(500)
    check("Reconnect alert opens Platform connections", pg.url.endswith("/settings/connections"), pg.url)
    check("Settings sub-tabs present", pg.get_by_role("link", name="Profile & resumes").count() == 1 and pg.get_by_role("link", name="Platform connections").count() == 1)

    pg.goto(BASE + "/applications/app1"); pg.wait_for_selector("role=dialog", timeout=10000)
    check("deep link /applications/app1 opens drawer and keeps URL", pg.url.endswith("/applications/app1") and pg.get_by_role("dialog").count() == 1, pg.url)
    check("uncertain outcome offers Verify, not Retry", pg.get_by_text("Verify submission").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("Esc closes drawer and returns to /applications", pg.url.endswith("/applications") and pg.get_by_role("dialog").count() == 0, pg.url)

    pg.goto(BASE + "/applications?status=Failed"); pg.wait_for_timeout(800)
    check("filters read from URL (?status=Failed kept)", "status=Failed" in pg.url, pg.url)

    pg.goto(BASE + "/jobs?view=matches"); pg.wait_for_timeout(800)
    check("legacy /jobs?view=matches -> /jobs/matches", pg.url.endswith("/jobs/matches"), pg.url)
    pg.goto(BASE + "/schedules"); pg.wait_for_timeout(800)
    check("/schedules -> campaigns safety deep link", pg.url.endswith("/automation/campaigns/safety"), pg.url)

    # axe on each primary page
    for path in ["/home", "/jobs", "/jobs/matches", "/applications", "/automation/campaigns", "/automation/live", "/insights", "/settings/profile", "/settings/connections"]:
        pg.goto(BASE + path); pg.wait_for_timeout(900)
        pg.evaluate(AXE)
        res = pg.evaluate("axe.run(document, {resultTypes:['violations']}).then(r => r.violations.map(v => ({id:v.id, impact:v.impact, n:v.nodes.length})))")
        results["axe"][path] = res
        serious = [v for v in res if v["impact"] in ("serious", "critical")]
        print(f"axe {path}: {len(res)} violations, {len(serious)} serious/critical", [(v['id'], v['n']) for v in serious])
    pg.context.close()

    # ---- unsaved-changes guard on Profile
    pg = new_page(1280)
    dialogs = []
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    pg.goto(BASE + "/settings/profile"); pg.wait_for_timeout(900)
    pg.get_by_role("link", name="Home").first.click(); pg.wait_for_timeout(300)
    check("profile: no prompt when nothing was edited", not dialogs and pg.url.endswith("/home"), pg.url)
    pg.goto(BASE + "/settings/profile"); pg.wait_for_timeout(900)
    box = pg.locator("input[type=text], input[type=tel], textarea").first
    box.fill("edited value"); pg.wait_for_timeout(200)
    pg.get_by_role("link", name="Home").first.click(); pg.wait_for_timeout(300)
    check("profile: prompts after an edit and stays when dismissed", len(dialogs) == 1 and pg.url.endswith("/settings/profile"), f"{dialogs} {pg.url}")
    pg.context.close()

    # ---- mobile + tablet overflow and drawer
    for w in (375, 768):
        pg = new_page(w, 800)
        for path in ["/home", "/jobs", "/jobs/matches", "/applications", "/automation/campaigns", "/automation/live", "/insights", "/settings/profile", "/settings/connections"]:
            pg.goto(BASE + path); pg.wait_for_timeout(700)
            sw = pg.evaluate("document.documentElement.scrollWidth"); iw = pg.evaluate("window.innerWidth")
            check(f"{w}px no horizontal page scroll on {path}", sw <= iw + 1, f"scrollWidth={sw} innerWidth={iw}")
        pg.goto(BASE + "/home"); pg.wait_for_timeout(600)
        nav_visible = pg.locator("#primary-navigation").is_visible()
        check(f"{w}px sidebar hidden by default", not nav_visible)
        pg.get_by_label("Open navigation menu").click(); pg.wait_for_timeout(200)
        check(f"{w}px menu opens drawer", pg.locator("#primary-navigation").is_visible())
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check(f"{w}px Esc closes drawer", not pg.locator("#primary-navigation").is_visible())
        pg.get_by_label("Open navigation menu").click(); pg.get_by_role("link", name="Insights").click(); pg.wait_for_timeout(400)
        check(f"{w}px picking a page navigates and closes drawer", pg.url.endswith("/insights") and not pg.locator("#primary-navigation").is_visible(), pg.url)
        pg.context.close()
    b.close()

json.dump(results, open(os.environ.get("RESULTS_PATH", "e2e-results.json"), "w"), indent=1)
fails = [c for c in results["checks"] if not c["ok"]]
print(f"\n{len(results['checks'])-len(fails)}/{len(results['checks'])} checks passed; console errors: {len(results['console_errors'])}")
