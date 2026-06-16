/**
 * Combinatorics — small enumeration helpers. `booleanCombos` replaces the
 * hand-enumerated truth-table tuples in the logic-lab block; `cartesian` is the
 * general form.
 */
export const Combinatorics = {
  /** Cartesian product of N copies of `values` (e.g. all length-n boolean rows). */
  cartesian<T>(values: T[], n: number): T[][] {
    let rows: T[][] = [[]];
    for (let i = 0; i < n; i++) {
      const next: T[][] = [];
      for (const row of rows) for (const v of values) next.push([...row, v]);
      rows = next;
    }
    return rows;
  },

  /** All 2^n boolean rows of length n, in ascending binary order. */
  booleanCombos(n: number): boolean[][] {
    return Combinatorics.cartesian([false, true], n);
  },
} as const;
