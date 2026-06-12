"""Authenticated coupled-mode round-trip:
1. Log in via the dev admin route on schemati.test (session cookie .schemati.test)
2. Open flow.schemati.test — /api/user should authenticate through the proxy
3. Create a flow in the editor and Save → lands in Laravel's flows table
4. Publish it as a module → lands in Laravel's flow_modules table
5. Confirm both via Laravel API responses
"""
import sys, time
from playwright.sync_api import sync_playwright

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {extra}"))
    if not ok: fails.append(label)

STAMP = str(int(time.time()))
FLOW_NAME = f"coupling-probe-{STAMP}"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1500, "height": 950})
    page = ctx.new_page()

    # 1. dev login
    page.goto("https://schemati.test/dev/login-admin", timeout=30000)
    page.wait_for_timeout(1500)
    cookies = {c["name"]: c.get("domain") for c in ctx.cookies()}
    check("session cookie on .schemati.test", any(d and d.startswith(".schemati") for d in cookies.values()), cookies)

    # 2. flow app sees the session
    r = page.goto("https://flow.schemati.test", timeout=30000)
    page.wait_for_timeout(4000)
    user_json = page.evaluate("fetch('/api/user', {credentials:'include'}).then(r=>r.json())")
    check("/api/user authenticated via proxy", user_json.get("authenticated") is True or bool(user_json.get("user")), user_json)

    # 3. blank editor -> drop a Code node -> Save (creates 'Untitled Flow' in Laravel)
    before = page.evaluate("fetch('/api/flows', {credentials:'include'}).then(r=>r.json())")
    before_ids = {f.get("id") for f in before.get("flows", [])}

    page.goto("https://flow.schemati.test/editor", timeout=30000)
    page.wait_for_timeout(4000)
    # drag the 'Code' palette entry onto the canvas
    palette = page.locator("text=Run a code block").first
    pal_box = palette.bounding_box()
    canvas = page.locator(".react-flow__pane").first
    box = canvas.bounding_box()
    page.mouse.move(pal_box["x"] + pal_box["width"] / 2, pal_box["y"] + pal_box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.45, steps=12)
    page.mouse.up()
    page.wait_for_timeout(1200)
    check("code node added to canvas", page.locator(".react-flow__node-code").count() >= 1)
    save = page.locator("button:has-text('Save')").first
    save.click()
    page.wait_for_timeout(3000)

    flows = page.evaluate("fetch('/api/flows', {credentials:'include'}).then(r=>r.json())")
    new_flows = [f for f in flows.get("flows", []) if f.get("id") not in before_ids]
    check("Save created a flow in Laravel /api/flows", len(new_flows) == 1,
          [f.get("name") for f in flows.get("flows", [])][:10])
    if new_flows:
        check("new flow is owned + editable", new_flows[0].get("isOwner") and new_flows[0].get("canEdit"), new_flows[0])

    # 4. publish as module via File menu
    publish_responses = []
    page.on("response", lambda r: publish_responses.append((r.status, r.url))
            if "/api/modules" in r.url else None)
    page.locator("button:has-text('File')").first.click()
    page.wait_for_timeout(500)
    pub = page.locator("text=Publish flow as module").first
    check("publish menu item present", pub.count() > 0)
    if pub.count():
        pub.click()
        page.wait_for_timeout(3500)
    print("module POST responses:", publish_responses)
    print("toast/body tail:", page.inner_text("body")[-300:].replace("\n", " | "))
    mods = page.evaluate("fetch('/api/modules', {credentials:'include'}).then(r=>r.json())")
    mod_names = [m.get("name") for m in mods.get("modules", [])]
    check("published module visible in Laravel /api/modules", "Untitled Flow" in mod_names, mod_names[:10])

    page.screenshot(path="/tmp/coupled-auth.png")
    b.close()

print("COUPLED_AUTH_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
