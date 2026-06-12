"""Coupled-mode browser run of the Schemati Browser flow:
log in, save the example flow into Laravel through the proxy, open it in the
editor at flow.schemati.test, Run, and verify the search results table and
the fetched schematic arrive from the platform.
"""
import json, sys
from playwright.sync_api import sync_playwright

flow = json.load(open("/tmp/schemati-browser-flow.json"))

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {str(extra)[:300]}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1700, "height": 1000})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto("https://schemati.test/dev/login-admin", timeout=30000)
    page.wait_for_timeout(1200)
    page.goto("https://flow.schemati.test", timeout=30000)
    page.wait_for_timeout(2500)

    saved = page.evaluate(
        """async (flow) => {
            const r = await fetch('/api/flows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: 'Schemati node browser probe', nodes: flow.nodes, edges: flow.edges }),
            });
            return r.json();
        }""",
        flow,
    )
    flow_id = (saved.get("flow") or {}).get("id")
    check("flow saved into Laravel", bool(flow_id), saved)

    page.goto(f"https://flow.schemati.test/editor/{flow_id}", timeout=30000)
    page.wait_for_timeout(6000)
    check("both schemati nodes render", page.locator(".react-flow__node-code").count() >= 2)

    page.locator("button:has-text('Run')").first.click()
    page.wait_for_timeout(15000)  # search + download + render
    body = page.inner_text("body")

    check("search results table shows door schematics", "door" in body.lower() and ("litematic" in body or "schem" in body),
          body[-400:].replace("\n", " | "))
    check("fetch node completed (name output visible or node ready)",
          page.locator("text=✗").count() == 0 and "error" not in body.lower(), body[-300:])
    # the viewer should be showing a schematic canvas
    check("3D preview canvas present", page.locator(".react-flow__node-viewer canvas, canvas").count() >= 1)

    page.screenshot(path="/tmp/schemati-node-browser.png", full_page=False)
    real_errors = [e for e in errors if "WebSocket" not in e]
    check("no page errors", not real_errors, "; ".join(real_errors[:3]))
    b.close()

print("SCHEMATI_NODE_BROWSER_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
