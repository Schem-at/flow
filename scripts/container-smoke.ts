/** In-container smoke test: client serves HTML; /api proxies to Laravel. */
const page = await fetch('http://localhost:5176/');
const html = await page.text();
console.log('client html:', page.status, html.includes('<div id="root">') ? 'has #root' : 'NO ROOT');

try {
  const api = await fetch('http://localhost:5176/api/user');
  const body = await api.text();
  console.log('/api/user via proxy:', api.status, body.slice(0, 120));
} catch (e) {
  console.log('/api/user via proxy FAILED:', (e as Error).message);
}
