function generate(
  a: number[][],
  b: number[][],
  op: 'subtract' | 'add' | 'multiply' | 'min' | 'max' | 'average',
  strength: Slider<{ min: 0; max: 1; step: 0.05; default: 1 }>,
): {
  field: number[][];
  preview: Image;
} {
  const fa = a || [];
  const fb = b || [];
  const size = Math.min(fa.length, fb.length);
  if (!size) return { field: [], preview: Image.blank() };

  // Element-wise op with a strength dial; Field.combine walks both fields and
  // Field.normalize rescales the result into [0, 1] (the manual min/max loop).
  const k = strength;
  const merged = Field.combine(fa, fb, (va, raw) => {
    const vb = raw * k;
    if (op === 'add') return va + vb;
    if (op === 'multiply') return va * (1 - k + vb);
    if (op === 'min') return Math.min(va, vb);
    if (op === 'max') return Math.max(va, vb);
    if (op === 'average') return (va + vb) / 2;
    return va - vb; // subtract (perlin minus voronoi = eroded ridges)
  });
  const field = Field.normalize(merged);
  return { field, preview: Image.fromField(field, 'grayscale') };
}
