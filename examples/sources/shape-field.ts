function generate(
  field: number[][],
  exponent: Slider<{ min: 0.3; max: 3; step: 0.1; default: 1.6 }>,
  terraces: Slider<{ min: 0; max: 12; default: 0 }>,
): {
  field: number[][];
  preview: Image;
} {
  const src = field || [];
  if (!src.length) return { field: [], preview: Image.blank() };

  // Field.map walks every cell; exponent > 1 flattens valleys and sharpens
  // peaks, then optional terracing snaps to flat steps. Image.fromField
  // renders the preview (replaces the hand-rolled RGBA byte loop).
  const steps = terraces | 0;
  const out = Field.map(src, (value) => {
    let v = Math.pow(value, exponent);
    if (steps > 0) v = Math.round(v * steps) / steps;
    return v;
  });
  return { field: out, preview: Image.fromField(out, 'grayscale') };
}
