"""Browser verification of the bundled-asset node:
1. Open the saved 'Asset census probe' flow in the editor, Run, expect the
   census summary to appear (editor run loop resolves the asset node).
2. Drop a fresh Asset node from the toolbar, upload the .schem fixture via
   the real file input, expect name + 'schematic' badge to render.
3. Publish the flow as a module via the File menu, expect success toast.
"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5177"
API = "http://localhost:3001"

# Find the saved probe flow id
flows = json.load(urllib.request.urlopen(f"{API}/api/flows"))
probe = [f for f in (flows.get("flows") or flows.get("data") or []) if f.get("name") == "Asset census probe"]
if not probe:
    print("FAIL: probe flow not found via API"); sys.exit(1)
flow_id = sorted(probe, key=lambda f: f.get("createdAt") or "")[-1]["id"]
print(f"flow id: {flow_id}")

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {extra}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/editor/{flow_id}")
    page.wait_for_timeout(4000)

    # Asset node renders with its bundled file info
    check("asset node shows bundled file", page.locator("text=flow-asset-base.schem").count() > 0)
    check("asset node shows schematic badge", page.locator("text=schematic").first.is_visible())

    # 1. Run the flow
    run_btn = page.locator("button:has-text('Run')").first
    run_btn.click()
    page.wait_for_timeout(9000)
    body = page.inner_text("body")
    check("census ran from bundled asset", "minecraft:stone=25" in body or "stone=25" in body,
          body[:400].replace("\n", " | "))

    # 2. Fresh asset node + real upload
    # Open the toolbar palette entry and drag it onto the canvas
    asset_palette = page.locator("text=Bundle a schematic/image inside the flow").first
    if asset_palette.count() == 0:
        # Palette may show only labels; try the label chip in the Inputs group
        asset_palette = page.locator("aside >> text=Asset").first
    pal_box = asset_palette.bounding_box()
    canvas = page.locator(".react-flow__pane").first
    cv_box = canvas.bounding_box()
    if pal_box and cv_box:
        page.mouse.move(pal_box["x"] + pal_box["width"] / 2, pal_box["y"] + pal_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(cv_box["x"] + cv_box["width"] * 0.7, cv_box["y"] + cv_box["height"] * 0.25, steps=12)
        page.mouse.up()
        page.wait_for_timeout(1000)
    pick_btn = page.locator("text=Pick schematic / image…")
    check("new asset node dropped (empty state visible)", pick_btn.count() > 0)
    if pick_btn.count() > 0:
        # The file input is hidden inside the asset node
        inputs = page.locator(".react-flow__node-asset input[type=file]")
        idx = inputs.count() - 1
        inputs.nth(idx).set_input_files("/tmp/flow-asset-base.schem")
        page.wait_for_timeout(1500)
        check("upload populated the node",
              page.locator("text=flow-asset-base.schem").count() >= 2,
              f"count={page.locator('text=flow-asset-base.schem').count()}")

    # 3. Publish flow as module from File menu
    page.locator("button:has-text('File')").first.click()
    page.wait_for_timeout(500)
    publish = page.locator("text=Publish flow as module").first
    check("publish menu item exists", publish.count() > 0)
    if publish.count() > 0:
        publish.click()
        page.wait_for_timeout(3000)
        body = page.inner_text("body")
        check("publish gave feedback", "ublished" in body or "odule" in body, body[:300].replace("\n", " | "))

    page.screenshot(path="/tmp/asset-browser-verify.png")
    check("no page errors", len(errors) == 0, "; ".join(errors[:3]))
    browser.close()

# Confirm the module landed via API
mods = json.load(urllib.request.urlopen(f"{API}/api/modules"))
items = mods.get("modules") or mods.get("data") or mods.get("items") or []
published = [m for m in items if "Asset census probe" in (m.get("name") or "")]
check("published module visible via API", len(published) > 0, [m.get("name") for m in items])

print("BROWSER_ASSET_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
