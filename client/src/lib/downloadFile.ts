/** Client-side file downloads for block outputs (text, CSV, rendered PNG). */

/** Output names that ARE a file extension get used as one (csv, mcfunction…). */
const KNOWN_EXTENSIONS = new Set([
  'csv',
  'tsv',
  'mcfunction',
  'json',
  'txt',
  'md',
  'xml',
  'yaml',
  'svg',
  'html',
]);

/** `mcfunction` → `hologram.mcfunction`; `summary` → `summary.txt`. */
export function filenameForOutput(outputName: string, base = 'flow-output'): string {
  const name = outputName.toLowerCase();
  return KNOWN_EXTENSIONS.has(name) ? `${base}.${name}` : `${outputName}.txt`;
}

export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function rowsToCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join(
    '\n'
  );
}

/**
 * Render a horizontal bar chart of `rows` to a PNG and download it.
 * Pure SVG → canvas rasterization; no chart library.
 */
export async function downloadBarChartPng(options: {
  filename: string;
  title: string;
  rows: Array<{ label: string; value: number }>;
}): Promise<void> {
  const { filename, title, rows } = options;
  const width = 860;
  const rowH = 30;
  const top = 64;
  const labelW = 280;
  const height = top + rows.length * rowH + 28;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bars = rows
    .map((r, i) => {
      const y = top + i * rowH;
      const w = Math.max(2, ((width - labelW - 120) * r.value) / max);
      return `
        <text x="${labelW - 12}" y="${y + 19}" text-anchor="end" fill="#d4d4d4" font-size="13" font-family="ui-monospace,Menlo,monospace">${esc(r.label)}</text>
        <rect x="${labelW}" y="${y + 4}" width="${w}" height="${rowH - 10}" rx="3" fill="#10b981"/>
        <text x="${labelW + w + 8}" y="${y + 19}" fill="#a3a3a3" font-size="13" font-family="ui-monospace,Menlo,monospace">${r.value.toLocaleString()}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <text x="24" y="38" fill="#fafafa" font-size="18" font-weight="600" font-family="-apple-system,system-ui,sans-serif">${esc(title)}</text>
    ${bars}
  </svg>`;

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('chart rasterization failed'));
  });
  image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.drawImage(image, 0, 0);
  await new Promise<void>((resolve) =>
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      resolve();
    }, 'image/png')
  );
}
