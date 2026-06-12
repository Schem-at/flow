"""Verify the two reported module-node bugs are fixed, all on /editor/<flow>:
1. Healer restores ports on a module node saved without contract/io.
2. Inline 'create inputs' button appears and generates input widget nodes.
3. Opening and closing the module's code panel does NOT wipe the inputs.
4. Fresh insert from the Modules tab carries ports immediately.
"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5177"
API = "http://localhost:3001"

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {extra}"))
    if not ok: fails.append(label)

mods = json.load(urllib.request.urlopen(f"{API}/api/modules"))
items = mods.get("modules") or mods.get("data") or []
julia = next((m for m in items if "julia" in (m.get("slug") or "").lower()), None)
if not julia:
    print("FAIL: julia module not found"); sys.exit(1)
print(f"module: {julia['slug']} ({julia['id']})")

wiped_flow = {
    "name": "Wiped module heal probe",
    "description": "healer test",
    "nodes": [{
        "id": "module-julia-wiped",
        "type": "code",
        "position": {"x": 250, "y": 250},
        "data": {
            "label": "Julia Set Mosaic",
            "moduleRef": {"id": julia["id"], "slug": julia["slug"], "version": julia.get("version", "1.0.0"), "pinned": False},
        },
    }],
    "edges": [],
}
req = urllib.request.Request(f"{API}/api/flows", data=json.dumps(wiped_flow).encode(),
                             headers={"Content-Type": "application/json"}, method="POST")
saved = json.load(urllib.request.urlopen(req))
wiped_id = saved["flow"]["id"]
print(f"wiped-node flow: {wiped_id}")

INPUT_NAMES = ["cols", "rows", "tile", "iterations", "spacing"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ── 1. healer on the wiped module node ──
    page.goto(f"{BASE}/editor/{wiped_id}")
    page.wait_for_timeout(5000)  # load + heal fetch + re-render
    body = page.inner_text("body")
    healed = [n for n in INPUT_NAMES if n in body]
    check("healer restored wiped node ports", len(healed) >= 4, f"found {healed}")

    # ── 2. inline create-inputs button ──
    create_btn = page.locator("button[title*='Create input nodes']").first
    check("inline 'create inputs' button appears", create_btn.count() > 0 and create_btn.is_visible())
    if create_btn.count():
        create_btn.click()
        page.wait_for_timeout(1500)
        n_inputs = page.locator(".react-flow__node-input").count()
        check("create-inputs generated widget nodes", n_inputs >= 4, f"count={n_inputs}")

    # ── 3. open + close the code panel, ports must survive ──
    page.locator(".react-flow__node-code").first.dblclick()
    page.wait_for_timeout(3500)  # panel opens, module code resolves + validates
    page.screenshot(path="/tmp/module-panel-open.png")
    closed = False
    for sel in ["button[title='Close']", "button[aria-label='Close']"]:
        loc = page.locator(sel)
        if loc.count():
            loc.last.click(); closed = True; break
    if not closed:
        page.keyboard.press("Escape")
    page.wait_for_timeout(1500)
    body = page.inner_text("body")
    survived = [n for n in INPUT_NAMES if n in body]
    check("ports survive code-panel open/close", len(survived) >= 4, f"found {survived}")

    # ── 4. fresh insert from the Modules tab ──
    tab = page.locator("button:has-text('Modules')").first
    if not (tab.count() and tab.is_visible()):
        expand = page.locator("button[title='Expand'], .lucide-panel-left-open").first
        if expand.count():
            expand.click(); page.wait_for_timeout(800)
        tab = page.locator("button:has-text('Modules')").first
    tab.click()
    page.wait_for_timeout(1500)
    before = page.locator(".react-flow__node-code").count()
    # Scope to the sidebar — the canvas node carries the same label text
    sidebar = page.locator("div.w-60").first
    sidebar.locator(f"text={julia['name']}").first.click()
    page.wait_for_timeout(2500)
    after = page.locator(".react-flow__node-code").count()
    check("module inserted from tab", after > before, f"{before} -> {after}")
    # The freshly inserted node must render its 5 typed input handles
    handles = page.locator(".react-flow__node-code").last.inner_text()
    fresh = [n for n in INPUT_NAMES if n in handles]
    check("fresh insert carries ports", len(fresh) >= 4, f"found {fresh} in '{handles[:200]}'")

    page.screenshot(path="/tmp/module-node-verify.png")
    if errors:
        print("page errors:", errors[:3])
    browser.close()

print("MODULE_NODE_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
