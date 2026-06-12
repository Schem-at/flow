"""Browser (coupled, session-auth) upload round-trip:
dev-login -> save a generator+upload flow into Laravel -> open in the editor
at flow.schemati.test -> Run -> the upload node mints a session JWT and
publishes -> confirm the schematic exists on the platform.
"""
import json, sys, time, urllib.request, ssl
from playwright.sync_api import sync_playwright

STAMP = format(int(time.time()), 'x')
NAME = f"Browser upload probe {STAMP}"

GENERATOR = """type Inputs = { height: number };
type Outputs = { tower: Schematic };
function generate(inputs) {
  const tower = new Schematic();
  for (let y = 0; y < inputs.height; y++) {
    tower.set_block(0, y, 0, y % 3 ? 'minecraft:copper_block' : 'minecraft:stone');
  }
  return { tower };
}
"""

UPLOADER = """type Inputs = { schematic: Schematic; name: string };
type Outputs = { id: string; url: string };
async function generate(inputs) {
  const uploaded = await Schemati.uploadSchematic(inputs.schematic, {
    name: inputs.name,
    description: 'Uploaded from the browser editor by a flow',
    tags: ['door'],
    isPublic: true,
  });
  return { id: uploaded.shortId || uploaded.id, url: uploaded.webUrl || '' };
}
"""

flow = {
    "nodes": [
        {"id": "h", "type": "input", "position": {"x": 0, "y": 0},
         "data": {"label": "height", "value": 4 + int(time.time()) % 13, "dataType": "number"}},
        {"id": "n", "type": "input", "position": {"x": 0, "y": 130},
         "data": {"label": "name", "value": NAME, "dataType": "string"}},
        {"id": "gen", "type": "code", "position": {"x": 300, "y": 0},
         "data": {"label": "Tower", "code": GENERATOR,
                  "contract": {"inputs": {"height": {"kind": "number"}},
                               "outputs": {"tower": {"kind": "schematic"}}}}},
        {"id": "up", "type": "code", "position": {"x": 620, "y": 0},
         "data": {"label": "Publish", "code": UPLOADER,
                  "contract": {"inputs": {"schematic": {"kind": "schematic"}, "name": {"kind": "string"}},
                               "outputs": {"id": {"kind": "string"}, "url": {"kind": "string"}}}}},
        {"id": "out", "type": "output", "position": {"x": 940, "y": 0}, "data": {"label": "id"}},
    ],
    "edges": [
        {"id": "e1", "source": "h", "target": "gen", "sourceHandle": "output", "targetHandle": "height"},
        {"id": "e2", "source": "gen", "target": "up", "sourceHandle": "tower", "targetHandle": "schematic"},
        {"id": "e3", "source": "n", "target": "up", "sourceHandle": "output", "targetHandle": "name"},
        {"id": "e4", "source": "up", "target": "out", "sourceHandle": "id", "targetHandle": "input"},
    ],
}

fails = []
def check(label, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f" — {str(extra)[:300]}"))
    if not ok: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1700, "height": 1000})
    page = ctx.new_page()

    page.goto("https://schemati.test/dev/login-admin", timeout=30000)
    page.wait_for_timeout(1200)
    page.goto("https://flow.schemati.test", timeout=30000)
    page.wait_for_timeout(2500)

    saved = page.evaluate(
        """async (flow) => {
            const r = await fetch('/api/flows', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: 'Browser upload probe flow', nodes: flow.nodes, edges: flow.edges }),
            });
            return r.json();
        }""",
        flow,
    )
    flow_id = (saved.get("flow") or {}).get("id")
    check("flow saved into Laravel", bool(flow_id), saved)

    page.goto(f"https://flow.schemati.test/editor/{flow_id}", timeout=30000)
    page.wait_for_timeout(6000)
    page.locator("button:has-text('Run')").first.click()
    page.wait_for_timeout(15000)

    body = page.inner_text("body")
    check("no node errors", page.locator("text=✗").count() == 0 and "Upload failed" not in body, body[-300:])
    page.screenshot(path="/tmp/upload-browser.png")
    b.close()

# Confirm on the platform (public search, no auth needed)
sctx = ssl.create_default_context(); sctx.check_hostname = False; sctx.verify_mode = ssl.CERT_NONE
from urllib.parse import quote
found = json.load(urllib.request.urlopen(f"https://schemati.test/api/v1/schematics?search={quote(NAME)}", context=sctx))
hit = next((s for s in found.get("data", []) if s["name"] == NAME), None)
check("schematic published from the browser", bool(hit), [s.get("name") for s in found.get("data", [])])
check("preview generated", bool(hit and hit.get("preview_image_url")))

print("UPLOAD_BROWSER_OK" if not fails else f"{len(fails)} FAILURES: {fails}")
sys.exit(0 if not fails else 1)
