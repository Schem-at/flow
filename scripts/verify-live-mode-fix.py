"""Verify the live-mode freeze fix in coupled mode:
1. Open the Schemati Browser flow, enable Live Mode, run once.
2. Tweak the limit slider repeatedly (changes search inputs but NOT the top
   match) — the fetch node must NOT re-download: count /download requests.
3. Change the tag to a different value — fetch MUST re-download (cache busts).
4. Measure main-thread stalls (rAF gaps) while tweaking.
Also: the new 'Schemati' palette category renders with Search/Fetch/Upload.
"""
import json, sys, urllib.request, ssl
from playwright.sync_api import sync_playwright

API = "https://schemati.test"
sctx = ssl.create_default_context(); sctx.check_hostname = False; sctx.verify_mode = ssl.CERT_NONE

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {str(extra)[:280]}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1700, "height": 1000})
    page = ctx.new_page()
    downloads = []
    page.on("request", lambda r: downloads.append(r.url) if "/download" in r.url else None)

    page.goto("https://schemati.test/dev/login-admin", timeout=30000)
    page.wait_for_timeout(1200)

    # Find the existing Schemati Browser probe flow
    page.goto("https://flow.schemati.test", timeout=30000)
    page.wait_for_timeout(2500)
    flows = page.evaluate("fetch('/api/flows', {credentials:'include'}).then(r=>r.json())")
    probe = next((f for f in flows.get("flows", []) if "Schemati node browser probe" in f.get("name", "")), None)
    if not probe:
        print("FAIL: probe flow missing"); sys.exit(1)

    page.goto(f"https://flow.schemati.test/editor/{probe['id']}", timeout=30000)
    page.wait_for_timeout(6000)

    # New palette category (expanded by default like other primitives)
    body = page.inner_text("body")
    check("'Schemati' palette lists Search/Fetch/Upload",
          "Schemati" in body and "Fetch" in body and "Upload" in body, body[:600])

    # Enable live mode + initial run
    page.locator("button[title='Live Mode']").first.click()
    page.wait_for_timeout(500)
    page.locator("button:has-text('Run')").first.click()
    page.wait_for_timeout(14000)
    base_downloads = len(downloads)
    check("initial run downloaded the top match", base_downloads >= 1, downloads)

    # rAF stall monitor
    page.evaluate("""() => {
        window.__stalls = [];
        let last = performance.now();
        const tick = (t) => { if (t - last > 250) window.__stalls.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    }""")

    # Tweak the limit slider 4 times (search re-runs; top match id unchanged)
    slider = page.locator(".react-flow__node-input input[type=range]").first
    sbox = slider.bounding_box()
    for frac in (0.3, 0.6, 0.4, 0.8):
        page.mouse.click(sbox["x"] + sbox["width"] * frac, sbox["y"] + sbox["height"] / 2)
        page.wait_for_timeout(2500)
    page.wait_for_timeout(6000)

    # The first incremental run after a manual full Run primes the value cache
    # (the full-run loop doesn't populate it), so allow exactly one fetch; the
    # remaining tweaks must all be skipped.
    tweak_downloads = len(downloads) - base_downloads
    check("limit tweaks don't repeatedly re-download (≤1 cache-priming fetch)", tweak_downloads <= 1,
          f"{tweak_downloads} extra downloads: {downloads[base_downloads:]}")

    stalls = page.evaluate("window.__stalls")
    check("no long main-thread stalls while tweaking (>1s)", all(s < 1000 for s in stalls), stalls)
    print(f"  (rAF gaps >250ms during tweaks: {stalls})")

    # Change the tag → different top match → MUST re-download
    tag_input = page.locator(".react-flow__node-input input[type=text]").first
    tag_input.fill("farm")
    page.wait_for_timeout(12000)
    after_tag = len(downloads) - base_downloads - tweak_downloads
    check("tag change DOES re-download (cache busts correctly)", after_tag >= 1,
          downloads[base_downloads + tweak_downloads:])

    page.screenshot(path="/tmp/live-mode-fix.png")
    b.close()

print("LIVE_MODE_FIX_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
