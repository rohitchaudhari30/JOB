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
       "company": "Acme", "platform": "linkedin", "match_score": 91, "screenshot_file_path": "shots/app1.png"}
OVERVIEW = {"today_applied_count": 3, "effective_daily_limit": 25, "quota_remaining": 22, "quota_percentage": 12.0,
  "active_run": {"is_running": False, "run_id": None, "campaign_id": None, "campaign_name": None, "status": "IDLE",
                 "current_job_title": None, "current_platform": None, "progress_percentage": 0.0},
  "needs_attention": [{"id": "a1", "type": "AUTH_EXPIRED", "title": "Linkedin Disconnected", "description": "Session expired",
                       "action_label": "Reconnect", "action_url": "/settings/connections", "severity": "HIGH"}],
  "readiness": [{"key": "platform", "title": "Job Platform Connected", "is_ready": False, "action_label": "Connect Portal", "action_url": "/settings/connections"}],
  "top_matches": [{"job_id": "job1", "title": "Staff Engineer", "company": "Acme", "location": "Remote", "platform": "LinkedIn", "match_score": 94.5, "decision": "AUTO_APPLY"}]}
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
JOB = {"id": "job1", "source_id": "s1", "source_type": "linkedin", "external_job_id": "x1", "title": "Staff Engineer", "company": "Acme",
       "location": "Remote", "apply_url": "https://example.com/apply", "raw_description": "Build things.", "is_active": True,
       "posted_at": "2026-10-15T10:00:00Z", "freshness_bucket": "LAST_7_DAYS"}
MATCH = {"id": "m1", "user_id": "u1", "job_id": "job1", "match_score": 88, "overall_score": 88, "hard_filter_passed": True,
         "skill_match_score": 80, "semantic_score": 70, "reasoning_summary": "Strong fit for the role.", "matched_skills": ["python"],
         "missing_skills": ["go"], "decision": "REQUIRE_APPROVAL", "ai_provider_used": "test", "job": JOB, "job_title": "Staff Engineer",
         "company": "Acme", "location": "Remote"}
STATS = {"total": 1, "applied": 0, "paused": 0, "failed": 0, "approval_required": 0, "reconciliation_required": 1, "needs_attention": 1}

def handler(route):
    req = route.request
    path = req.url.split("/api/v1", 1)[1].split("?")[0]
    m = req.method
    if path == "/auth/refresh" and m == "POST":
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"id": "u1", "email": "a@b.c", "access_token": "mem-token"}))
    if path.endswith("/screenshot"):
        return route.fulfill(status=200, content_type="image/png", body=PNG)
    if path.endswith("/connect"):
        return  # never answered: keeps the "waiting for login" dialog open
    body = []
    if path == "/auth/me": body = USER
    elif path == "/automation/active": body = {"status": "IDLE"}
    elif path == "/dashboard/overview": body = OVERVIEW
    elif path == "/jobs/matches": body = [MATCH]
    elif path == "/jobs": body = {"items": [JOB], "total": 1}
    elif path == "/jobs/discover": body = {}
    elif path == "/resumes": body = []
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
    check("tokens are not kept in browser storage (SEC-08)", pg.evaluate("[...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => /token|auth/i.test(k)).length") == 0 and "mem-token" not in pg.content())
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900})
    ctx2.route("**/api/v1/**", lambda r: r.fulfill(status=401, content_type="application/json", body='{"detail":"x"}'))
    out = ctx2.new_page(); out.goto(BASE + "/home"); out.wait_for_selector("text=Sign In to Console", timeout=10000)
    check("signed-out visit (no refresh cookie) shows the login page", out.get_by_text("Sign In to Console").count() >= 1)
    ctx2.close()
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

    # ---- shared Modal in a real browser: New Campaign
    pg = new_page(1280)
    pg.goto(BASE + "/automation/campaigns"); pg.wait_for_timeout(900)
    pg.get_by_role("button", name="New Campaign").first.click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog")
    check("modal: New Campaign opens as a dialog", dlg.is_visible())
    check("modal: focus lands in the name field", pg.evaluate("document.activeElement && document.activeElement.id") == "new-campaign-name")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("modal: Esc closes it", dlg.count() == 0)
    pg.context.close()

    # ---- Jobs and Matches detail drawers (shared JobDetailDrawer)
    pg = new_page(1280)
    pg.goto(BASE + "/jobs/job1"); pg.wait_for_selector("role=dialog", timeout=10000)
    dlg = pg.get_by_role("dialog")
    check("jobs: deep link /jobs/job1 opens the drawer", dlg.count() == 1 and pg.url.endswith("/jobs/job1"), pg.url)
    check("jobs: drawer shows the job title and company", dlg.get_by_text("Staff Engineer").count() >= 1 and dlg.get_by_text("Acme").count() >= 1)
    pg.evaluate(AXE)
    res = pg.evaluate("axe.run(document.querySelector('[role=dialog]'), {resultTypes:['violations']}).then(r => r.violations.map(v => v.id))")
    check("jobs: drawer has no axe violations", res == [], res)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("jobs: Esc closes the drawer and returns to /jobs", pg.get_by_role("dialog").count() == 0 and pg.url.endswith("/jobs"), pg.url)
    pg.goto(BASE + "/jobs/matches/job1"); pg.wait_for_selector("role=dialog", timeout=10000)
    dlg = pg.get_by_role("dialog")
    check("matches: deep link opens the drawer with the match summary", dlg.count() == 1 and dlg.get_by_text("Strong fit for the role.").count() >= 1, pg.url)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("matches: Esc closes the drawer", pg.get_by_role("dialog").count() == 0 and pg.url.endswith("/jobs/matches"), pg.url)
    pg.context.close()

    # ---- Applications: the reconciliation dialog opens from the row and closes with Esc
    pg = new_page(1280)
    pg.goto(BASE + "/applications"); pg.wait_for_selector("text=Staff Engineer", timeout=10000)
    pg.get_by_role("button", name="Verify Outcome").first.click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog")
    check("applications: Verify Outcome opens a dialog", dlg.count() == 1 and dlg.is_visible())
    pg.evaluate(AXE)
    res = pg.evaluate("axe.run(document.querySelector('[role=dialog]'), {resultTypes:['violations']}).then(r => r.violations.map(v => v.id))")
    check("applications: reconciliation dialog has no axe violations", res == [], res)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("applications: Esc closes the reconciliation dialog", pg.get_by_role("dialog").count() == 0)
    pg.context.close()

    # ---- Rationale and Screenshot dialogs, and the platform login dialog
    pg = new_page(1280)
    pg.goto(BASE + "/applications"); pg.wait_for_selector("text=Staff Engineer", timeout=10000)
    pg.get_by_role("button", name="Why?").first.click(); pg.wait_for_timeout(300)
    check("rationale: Why? opens a dialog with its title", pg.get_by_role("dialog").count() == 1 and pg.get_by_text("decision rationale").count() >= 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("rationale: Esc closes it", pg.get_by_role("dialog").count() == 0)
    pg.locator("tr", has_text="Staff Engineer").locator("button[aria-expanded]").first.click(); pg.wait_for_timeout(300)
    shot = pg.get_by_role("button", name="View Screenshot Artifact")
    shot.first.click(); pg.wait_for_timeout(500)
    check("screenshot: opens a dialog with the image", pg.get_by_role("dialog").count() == 1 and pg.get_by_role("dialog").locator("img").count() == 1)
    pg.evaluate(AXE)
    res = pg.evaluate("axe.run(document.querySelector('[role=dialog]'), {resultTypes:['violations']}).then(r => r.violations.map(v => v.id))")
    check("screenshot: dialog has no axe violations", res == [], res)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("screenshot: Esc closes it", pg.get_by_role("dialog").count() == 0)
    pg.context.close()

    pg = new_page(1280)
    pg.goto(BASE + "/settings/connections"); pg.wait_for_timeout(900)
    pg.get_by_role("button", name="Connect").first.click(); pg.wait_for_timeout(500)
    dlg = pg.get_by_role("dialog")
    check("login dialog: opens while waiting for the portal login", dlg.count() == 1 and dlg.get_by_text("Awaiting login completion").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("login dialog: Esc does NOT close it (not dismissible)", pg.get_by_role("dialog").count() == 1)
    pg.context.close()

    # ---- Insights: one section at a time, kept in the URL
    pg = new_page(1280)
    pg.goto(BASE + "/insights"); pg.wait_for_selector("role=tablist", timeout=10000)
    tabs = pg.get_by_role("tab").all_inner_texts()
    check("insights: six sections", len(tabs) == 6, tabs)
    pg.get_by_role("tab", name="Sources").click(); pg.wait_for_timeout(300)
    check("insights: choosing Sources updates the URL and selection", "view=sources" in pg.url and pg.get_by_role("tab", name="Sources").get_attribute("aria-selected") == "true", pg.url)
    pg.goto(BASE + "/insights?view=scoring"); pg.wait_for_timeout(800)
    check("insights: ?view=scoring opens that section", pg.get_by_role("tab", name="Scoring weights").get_attribute("aria-selected") == "true")
    pg.context.close()

    # ---- Platform connections: cards render with their action
    pg = new_page(1280)
    pg.goto(BASE + "/settings/connections"); pg.wait_for_timeout(900)
    check("connections: a platform card renders with a Connect action", pg.get_by_text("LinkedIn").count() >= 1 and pg.get_by_role("button", name="Connect").count() >= 1)
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
page_errors = [e for e in results["console_errors"] if "pageerror" in e]
print(f"uncaught page errors: {len(page_errors)}")
for e in sorted(set(page_errors))[:10]:
    print("  ", e)
