"""Verify the DX batch in the browser (local dev :5199):
1. Monaco autocomplete in the editor CodePanel: typing `Noise.` suggests the
   real provider methods; `Schemati.` suggests uploadSchematic etc.
2. Docs modal: Docs button opens API Reference; search finds set_block with
   its real signature from the nucleation .d.ts.
3. UI pass: Home renders with Figtree + brand fuchsia accents (screenshot).
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5199"
fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {str(extra)[:280]}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1700, "height": 1000})
    page.goto(f"{BASE}/editor", timeout=30000)
    page.wait_for_timeout(4000)

    # Drop a Code node and open its editor
    palette = page.locator("text=Run a code block").first
    pb = palette.bounding_box()
    canvas = page.locator(".react-flow__pane").first
    cb = canvas.bounding_box()
    page.mouse.move(pb["x"] + 20, pb["y"] + 5)
    page.mouse.down()
    page.mouse.move(cb["x"] + cb["width"] * 0.5, cb["y"] + cb["height"] * 0.4, steps=10)
    page.mouse.up()
    page.wait_for_timeout(1000)
    page.locator(".react-flow__node-code").first.dblclick()
    page.wait_for_timeout(3000)

    editor = page.locator(".monaco-editor").last

    def fresh_completion(prefix):
        """Replace the whole buffer with `prefix` and return visible suggestions."""
        editor.click()
        page.keyboard.press("ControlOrMeta+a")
        page.keyboard.type(prefix, delay=30)
        page.wait_for_timeout(1600)
        rows = page.locator(".suggest-widget .monaco-list-row").all_inner_texts()
        page.keyboard.press("Escape")
        return " | ".join(rows)

    joined = fresh_completion("Noise.getF")
    check("Noise. autocompletes provider methods", "getFractal2D" in joined, joined[:250])

    joined = fresh_completion("Schemati.")
    check("Schemati. autocompletes platform API", "uploadSchematic" in joined and "searchSchematics" in joined, joined[:250])

    joined = fresh_completion("const s = new Schematic();\ns.set_b")
    check("Schematic instance autocompletes nucleation API", "set_block" in joined, joined[:300])
    joined = fresh_completion("const s = new Schematic();\ns.create_sim")
    check("nucleation JSDoc methods present", "create_simulation_world" in joined, joined[:300])
    page.screenshot(path="/tmp/dx-autocomplete.png")

    # Docs modal via the TopBar button (close the code panel first; Monaco
    # swallows global shortcuts while focused)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    for sel in ["button[title='Close']", "button[aria-label='Close']"]:
        loc = page.locator(sel)
        if loc.count():
            loc.last.click()
            break
    page.wait_for_timeout(800)
    page.locator("button:has-text('Docs')").first.click()
    page.wait_for_timeout(1200)
    body = page.inner_text("body")
    check("docs modal opens", "API Reference" in body, body[-200:])
    page.locator("input[placeholder*='Search methods']").fill("set_block")
    page.wait_for_timeout(800)
    body = page.inner_text("body")
    check("docs search finds set_block with signature", "set_block(" in body and "block_name" in body or "set_block(x" in body,
          body[:400])
    page.screenshot(path="/tmp/dx-docs-modal.png")
    page.keyboard.press("Escape")

    # UI pass on Home
    page.goto(BASE, timeout=30000)
    page.wait_for_timeout(3000)
    font = page.evaluate("getComputedStyle(document.body).fontFamily")
    check("Figtree is the body font", "Figtree" in font, font)
    html = page.content()
    check("brand fuchsia accents present", "brand-" in html or "db45f0" in html.lower(), "no brand classes found")
    page.screenshot(path="/tmp/dx-home-ui.png")
    b.close()

print("DX_BROWSER_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
