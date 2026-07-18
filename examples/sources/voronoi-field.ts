function generate(
  size: Slider<{ min: 32; max: 256; default: 96 }>,
  cells: Slider<{ min: 2; max: 24; default: 7 }>,
  seed: number,
): {
  field: number[][];
  preview: Image;
} {
  const n = size | 0;
  const c = cells | 0;
  // F1 Worley/cellular noise: distance to the nearest jittered feature point.
  // frequency = cells/size lays roughly cells features across the span; the
  // seed shifts the sample lattice. Replaces the hand-rolled point grid +
  // nearest-distance scan + RGBA byte loop.
  const field = Field.normalize(
    Field.create(n, n, (x, z) =>
      Noise.worley(x + (seed | 0) * 131, z, { frequency: c / n })
    )
  );
  return { field, preview: Image.fromField(field, 'grayscale') };
}
