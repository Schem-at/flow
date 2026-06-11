/**
 * Noise provider interface
 */
export interface NoiseProvider {
  getSeed: () => string;
  get2D: (x: number, y: number, frequency?: number) => number;
  get3D: (x: number, y: number, z: number, frequency?: number) => number;
  get2D_01: (x: number, y: number, frequency?: number) => number;
  get3D_01: (x: number, y: number, z: number, frequency?: number) => number;
  getFractal2D: (x: number, y: number, options?: FractalNoiseOptions) => number;
  getFractal3D: (x: number, y: number, z: number, options?: FractalNoiseOptions) => number;
  getFractal2D_01: (x: number, y: number, options?: FractalNoiseOptions) => number;
  getFractal3D_01: (x: number, y: number, z: number, options?: FractalNoiseOptions) => number;
}

export interface FractalNoiseOptions {
  octaves?: number;
  frequency?: number;
  lacunarity?: number;
  persistence?: number;
}

/**
 * Simple seedable pseudo-random number generator (mulberry32)
 */
function createPRNG(seed: string | number): () => number {
  let h = typeof seed === 'number' ? seed : hashString(seed);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Simple 2D gradient noise implementation
 */
function createNoise2D(prng: () => number): (x: number, y: number) => number {
  // Generate gradient vectors
  const gradients = new Float32Array(512 * 2);
  for (let i = 0; i < 512; i++) {
    const angle = prng() * Math.PI * 2;
    gradients[i * 2] = Math.cos(angle);
    gradients[i * 2 + 1] = Math.sin(angle);
  }
  
  // Permutation table
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  
  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = fade(xf);
    const v = fade(yf);
    
    const aa = perm[xi + perm[yi]];
    const ab = perm[xi + perm[yi + 1]];
    const ba = perm[xi + 1 + perm[yi]];
    const bb = perm[xi + 1 + perm[yi + 1]];
    
    const dot = (gi: number, x: number, y: number) => 
      gradients[gi * 2] * x + gradients[gi * 2 + 1] * y;
    
    return lerp(
      lerp(dot(aa, xf, yf), dot(ba, xf - 1, yf), u),
      lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
      v
    );
  };
}

/**
 * Simple 3D gradient noise implementation
 */
function createNoise3D(prng: () => number): (x: number, y: number, z: number) => number {
  // Generate gradient vectors
  const gradients = new Float32Array(512 * 3);
  for (let i = 0; i < 512; i++) {
    const theta = prng() * Math.PI * 2;
    const phi = Math.acos(2 * prng() - 1);
    gradients[i * 3] = Math.sin(phi) * Math.cos(theta);
    gradients[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
    gradients[i * 3 + 2] = Math.cos(phi);
  }
  
  // Permutation table
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  
  return (x: number, y: number, z: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    
    const aaa = perm[xi + perm[yi + perm[zi]]];
    const aab = perm[xi + perm[yi + perm[zi + 1]]];
    const aba = perm[xi + perm[yi + 1 + perm[zi]]];
    const abb = perm[xi + perm[yi + 1 + perm[zi + 1]]];
    const baa = perm[xi + 1 + perm[yi + perm[zi]]];
    const bab = perm[xi + 1 + perm[yi + perm[zi + 1]]];
    const bba = perm[xi + 1 + perm[yi + 1 + perm[zi]]];
    const bbb = perm[xi + 1 + perm[yi + 1 + perm[zi + 1]]];
    
    const dot = (gi: number, x: number, y: number, z: number) =>
      gradients[gi * 3] * x + gradients[gi * 3 + 1] * y + gradients[gi * 3 + 2] * z;
    
    return lerp(
      lerp(
        lerp(dot(aaa, xf, yf, zf), dot(baa, xf - 1, yf, zf), u),
        lerp(dot(aba, xf, yf - 1, zf), dot(bba, xf - 1, yf - 1, zf), u),
        v
      ),
      lerp(
        lerp(dot(aab, xf, yf, zf - 1), dot(bab, xf - 1, yf, zf - 1), u),
        lerp(dot(abb, xf, yf - 1, zf - 1), dot(bbb, xf - 1, yf - 1, zf - 1), u),
        v
      ),
      w
    );
  };
}

/**
 * Creates a comprehensive noise utility object.
 * @param seed - An optional seed for reproducibility.
 * @returns The Noise utility object.
 */
export function createNoiseProvider(seed?: string | number): NoiseProvider {
  const finalSeed = seed?.toString() ?? Math.random().toString();
  const prng = createPRNG(finalSeed);
  
  const noise2D = createNoise2D(prng);
  const noise3D = createNoise3D(prng);

  const Noise: NoiseProvider = {
    getSeed: () => finalSeed,
    
    get2D: (x: number, y: number, frequency = 1) => 
      noise2D(x * frequency, y * frequency),
    
    get3D: (x: number, y: number, z: number, frequency = 1) => 
      noise3D(x * frequency, y * frequency, z * frequency),
    
    get2D_01: (x: number, y: number, frequency = 1) => 
      (noise2D(x * frequency, y * frequency) + 1) / 2,
    
    get3D_01: (x: number, y: number, z: number, frequency = 1) => 
      (noise3D(x * frequency, y * frequency, z * frequency) + 1) / 2,

    /**
     * Generates 2D fractal noise (fBm) by combining multiple octaves of noise.
     */
    getFractal2D: (x: number, y: number, options: FractalNoiseOptions = {}) => {
      const { octaves = 4, frequency = 1, lacunarity = 2, persistence = 0.5 } = options;
      
      let total = 0;
      let currentFrequency = frequency;
      let amplitude = 1;
      let maxAmplitude = 0;

      for (let i = 0; i < octaves; i++) {
        total += noise2D(x * currentFrequency, y * currentFrequency) * amplitude;
        maxAmplitude += amplitude;
        amplitude *= persistence;
        currentFrequency *= lacunarity;
      }

      return total / maxAmplitude;
    },

    /**
     * Generates 3D fractal noise (fBm).
     */
    getFractal3D: (x: number, y: number, z: number, options: FractalNoiseOptions = {}) => {
      const { octaves = 4, frequency = 1, lacunarity = 2, persistence = 0.5 } = options;
      
      let total = 0;
      let currentFrequency = frequency;
      let amplitude = 1;
      let maxAmplitude = 0;

      for (let i = 0; i < octaves; i++) {
        total += noise3D(
          x * currentFrequency, 
          y * currentFrequency, 
          z * currentFrequency
        ) * amplitude;
        maxAmplitude += amplitude;
        amplitude *= persistence;
        currentFrequency *= lacunarity;
      }

      return total / maxAmplitude;
    },

    getFractal2D_01: (x: number, y: number, options?: FractalNoiseOptions) => {
      return (Noise.getFractal2D(x, y, options) + 1) / 2;
    },
    
    getFractal3D_01: (x: number, y: number, z: number, options?: FractalNoiseOptions) => {
      return (Noise.getFractal3D(x, y, z, options) + 1) / 2;
    },
  };

  return Noise;
}

