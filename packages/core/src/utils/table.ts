/**
 * Table — tabular-data helpers (docs/dx-audit.md §1.6). Viewers already
 * export CSV/PNG from `rows` outputs; this covers the blocks that genuinely
 * want the CSV string (e.g. to feed a download output).
 */

export const Table = {
  /**
   * Rows (array of plain objects) → CSV. Columns come from the first row
   * unless specified. Values with commas/quotes/newlines are quoted.
   */
  toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
    if (!rows.length) return '';
    const cols = columns ?? Object.keys(rows[0]);
    const escape = (value: unknown): string => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const row of rows) {
      lines.push(cols.map((c) => escape(row[c])).join(','));
    }
    return lines.join('\n');
  },

  /** Sort rows by a column (desc by default for the common leaderboard case). */
  sortBy(
    rows: Array<Record<string, unknown>>,
    column: string,
    direction: 'asc' | 'desc' = 'desc'
  ): Array<Record<string, unknown>> {
    const sign = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[column];
      const y = b[column];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
      return String(x).localeCompare(String(y)) * sign;
    });
  },
};
