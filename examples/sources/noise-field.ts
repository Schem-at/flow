// Field + Noise + Image ambients replace ~70 lines of hand-rolled value noise,
// fBm stacking, normalization and RGBA byte loops. Inputs are positional params
// on generate (no inputs object); Outputs are the return type.
function generate(
  size: Slider<{ min: 32; max: 256; default: 96 }>,
  scale: Slider<{ min: 0.005; max: 0.1; step: 0.005; default: 0.02 }>,
  octaves: Slider<{ min: 1; max: 6; default: 4 }>,
  seed: number,
): {
  field: number[][];
  preview: Image;
} {
  const n = size | 0;
  const seedShift = (seed | 0) * 1009;
  const field = Field.normalize(
    Field.create(n, n, (x, z) =>
      Noise.getFractal2D_01(x + seedShift, z, {
        frequency: scale,
        octaves,
      })
    )
  );
  return { field, preview: Image.fromField(field, 'grayscale') };
}
