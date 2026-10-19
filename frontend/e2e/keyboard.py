"""Keyboard-only check (FE-04). Reuses the mocked API from smoke.py. Run against `vite preview` on :4173."""
import json
src = open(__file__.replace("keyboard.py", "smoke.py")).read().split("results = {")[0]
exec(src)
from playwright.sync_api import sync_playwright

PAGES = ["/home", "/jobs", "/jobs/matches", "/applications", "/automation/campaigns", "/automation/live", "/insights", "/settings/profile", "/settings/resumes", "/settings/preferences", "/settings/connections", "/settings/account"]
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route("**/api/v1/**", handler)
    pg = ctx.new_page()
    for path in PAGES:
        pg.goto(BASE + path); pg.wait_for_timeout(900)
        seen, issues = [], []
        for i in range(60):
            pg.keyboard.press("Tab"); pg.wait_for_timeout(250)  # let CSS transitions settle
            info = pg.evaluate("""() => { const e=document.activeElement; if(!e||e===document.body) return null;
              const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
              const name=(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||e.getAttribute('placeholder')||'').trim().slice(0,30);
              const ring = cs.outlineStyle!=='none' && parseFloat(cs.outlineWidth)>0 || cs.boxShadow!=='none';
              return {tag:e.tagName, name, ring, w:r.width, h:r.height, top:r.top}; }""")
            if info is None: continue
            key = (info["tag"], info["name"], round(info["top"]))
            if key in seen[:1] and i > 2: break  # wrapped
            seen.append(key)
            if not info["ring"]: issues.append(f"no focus ring: {info['tag']} '{info['name']}'")
            if not info["name"] and info["tag"] in ("BUTTON", "A"): issues.append(f"unnamed {info['tag']}")
        print(f"{path}: {len(seen)} tab stops, {len(issues)} issues"); bad += len(issues)
        for x in issues[:5]: print("   ", x)
    # Esc closes drawer and restores focus
    pg.goto(BASE + "/applications"); pg.wait_for_timeout(900)
    pg.get_by_text("Staff Engineer").first.click(); pg.wait_for_timeout(400)
    pg.goto(BASE + "/applications/app1"); pg.wait_for_selector("role=dialog")
    inside = pg.evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)")
    print("focus inside drawer on open:", inside)
    for _ in range(40): pg.keyboard.press("Tab")
    still = pg.evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)")
    print("focus trapped after 40 tabs:", still)
    b.close()
print("TOTAL issues:", bad)
