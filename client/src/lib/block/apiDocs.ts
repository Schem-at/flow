/**
 * API reference model for the docs browser — parsed straight out of the same
 * ambient declaration sources Monaco uses (the bundled nucleation .d.ts plus
 * the hand-written standard-provider declarations), so docs can never drift
 * from what actually autocompletes.
 */

import { AMBIENT_DTS, NUCLEATION_AMBIENT_DTS } from './ambient';

export interface ApiMember {
  /** Member name (method or property). */
  name: string;
  /** Full signature line, e.g. `set_block(x: number, …): void`. */
  signature: string;
  /** JSDoc description (joined plain text), may be empty. */
  doc: string;
  kind: 'method' | 'property';
}

export interface ApiGroup {
  /** Class / ambient-const name, e.g. 'Schematic', 'Noise'. */
  name: string;
  /** Group-level JSDoc. */
  doc: string;
  /** 'nucleation' for WASM classes, 'runtime' for standard providers, 'types' for widget helpers. */
  source: 'nucleation' | 'runtime' | 'types';
  members: ApiMember[];
}

function cleanDoc(raw: string): string {
  return raw
    .replace(/\/\*\*|\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** Parse `declare class X { … }` / `declare const X: { … };` bodies into groups. */
export function parseAmbientDts(
  dts: string,
  source: ApiGroup['source']
): ApiGroup[] {
  const groups: ApiGroup[] = [];
  const lines = dts.split('\n');
  let i = 0;

  const collectJsdocAbove = (index: number): string => {
    // Walk backwards from index-1 over a JSDoc block.
    let end = index - 1;
    while (end >= 0 && lines[end].trim() === '') end--;
    if (end < 0 || !lines[end].trim().endsWith('*/')) return '';
    let start = end;
    while (start >= 0 && !lines[start].trim().startsWith('/**')) start--;
    if (start < 0) return '';
    return cleanDoc(lines.slice(start, end + 1).join('\n'));
  };

  while (i < lines.length) {
    const match = /^declare (class|const|namespace) ([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (!match || match[1] === 'namespace') {
      i++;
      continue;
    }
    const name = match[2];
    const doc = collectJsdocAbove(i);
    const members: ApiMember[] = [];

    // Scan the braced body (skip one-liner consts without bodies).
    if (!lines[i].includes('{')) {
      i++;
      continue;
    }
    let depth = 0;
    let j = i;
    let pendingDoc = '';
    for (; j < lines.length; j++) {
      const line = lines[j];
      // Gate member scanning on the depth at line START — a member signature
      // may itself open braces (object-literal params).
      const depthAtStart = depth;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;

      if (j > i && depthAtStart === 1) {
        const trimmed = line.trim();
        if (trimmed.startsWith('/**')) {
          // Capture (possibly multi-line) JSDoc for the next member.
          let docEnd = j;
          while (docEnd < lines.length && !lines[docEnd].includes('*/')) docEnd++;
          pendingDoc = cleanDoc(lines.slice(j, docEnd + 1).join('\n'));
          j = docEnd;
          continue;
        }
        const member = /^(?:static |readonly |get |set )*([A-Za-z_$][\w$]*)\s*(\(|\??:)/.exec(trimmed);
        if (member && member[1] !== 'constructor') {
          // Join continuation lines until the signature closes, keeping the
          // brace depth in sync (nested object-literal params span lines).
          let sig = trimmed;
          let k = j;
          while (!/;\s*$/.test(sig) && k + 1 < lines.length) {
            k++;
            sig += ' ' + lines[k].trim();
            depth += (lines[k].match(/\{/g) ?? []).length - (lines[k].match(/\}/g) ?? []).length;
            if (k - j > 24) break; // runaway guard
          }
          j = k;
          members.push({
            name: member[1],
            signature: sig.replace(/;\s*$/, '').replace(/\s+/g, ' '),
            doc: pendingDoc,
            kind: member[2] === '(' ? 'method' : 'property',
          });
        }
        pendingDoc = '';
      }
      if (j > i && depth <= 0) break;
    }

    if (members.length) groups.push({ name, doc, source, members });
    i = j + 1;
  }

  return groups;
}

let cache: ApiGroup[] | null = null;

/** Curated display order for the most-used groups; the rest follow A→Z. */
const PRIORITY = ['Schematic', 'Schemati', 'Field', 'Image', 'Random', 'Noise', 'Vec3', 'Vec2', 'SchematicUtils', 'Progress', 'Easing', 'Calculator', 'Pathfinding', 'Logger', 'Image', 'MchprsWorldWrapper'];

export function getApiDocs(): ApiGroup[] {
  if (cache) return cache;
  const runtime = parseAmbientDts(AMBIENT_DTS, 'runtime');
  const nucleation = parseAmbientDts(NUCLEATION_AMBIENT_DTS, 'nucleation').filter(
    // The Schematic alias supersedes the raw wrapper name in the docs.
    (g) => g.name !== 'SchematicWrapper'
  );
  // The Schematic alias class has no members of its own — graft the wrapper's.
  const wrapper = parseAmbientDts(NUCLEATION_AMBIENT_DTS, 'nucleation').find(
    (g) => g.name === 'SchematicWrapper'
  );
  const all = [...runtime, ...nucleation];
  if (wrapper) {
    all.unshift({
      name: 'Schematic',
      doc: 'The live voxel schematic class endowed to every block (nucleation). Construct with new Schematic(), then set_block / copy / paste, or load bytes with from_data.',
      source: 'nucleation',
      members: wrapper.members,
    });
  }
  cache = all.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.name);
    const pb = PRIORITY.indexOf(b.name);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.name.localeCompare(b.name);
  });
  return cache;
}

/** Case-insensitive filter over group names, member names, and docs. */
export function searchApiDocs(query: string): ApiGroup[] {
  const groups = getApiDocs();
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((group) => {
      if (group.name.toLowerCase().includes(q)) return group;
      const members = group.members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.signature.toLowerCase().includes(q) ||
          m.doc.toLowerCase().includes(q)
      );
      return members.length ? { ...group, members } : null;
    })
    .filter((g): g is ApiGroup => g !== null);
}
