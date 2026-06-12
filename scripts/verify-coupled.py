"""Coupled-mode communication check through the dev proxy:
- https://schemati.test (Laravel) loads
- https://flow.schemati.test (flow client in docker) loads, lists flows from
  Laravel through the Vite /api proxy, and reflects auth state
"""
import sys
from playwright.sync_api import sync_playwright

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {extra}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    api_responses = {}
    page.on("response", lambda r: api_responses.update({r.url.split("schemati.test")[-1]: r.status})
            if "/api/" in r.url else None)

    # Laravel main site
    page.goto("https://schemati.test", timeout=30000)
    page.wait_for_timeout(3000)
    body = page.inner_text("body")
    check("Laravel site loads", len(body) > 100, body[:150].replace("\n", " | "))

    # Flow app through the proxy
    page.goto("https://flow.schemati.test", timeout=30000)
    page.wait_for_timeout(5000)
    body = page.inner_text("body")
    check("flow client loads via proxy", "Flows" in body or "WORKSPACE" in body, body[:200].replace("\n", " | "))
    check("auth state shown (Sign in or username)", "Sign in" in body or "Sign" in body or "@" in body)
    print("api calls observed:", {k: v for k, v in api_responses.items() if k.startswith("/api")})
    check("/api/flows proxied to Laravel", any(k.startswith("/api/flows") for k in api_responses),
          api_responses)

    page.screenshot(path="/tmp/coupled-flow.png")
    b.close()

print("COUPLED_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
