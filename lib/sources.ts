/**
 * The source the semantic link transmits: a procedurally generated 16×16
 * grayscale scene.
 *
 * Why generated rather than a stock image set. The models in this lab have to
 * be trained somewhere, and the training runs in Node while the evaluation runs
 * in the browser. Anything drawn with a canvas exists only in the browser;
 * anything downloaded is a network dependency an offline lab cannot have; and a
 * few hundred kilobytes of baked-in PNG would be a dataset nobody can inspect.
 * A generator is none of those things — the same seed produces the same image
 * in both places, the whole dataset is reproducible from four numbers, and a
 * learner can read exactly what the "meaning" in "semantic communication" is,
 * because it is written down below as four shape classes and their parameters.
 *
 * The scenes are deliberately simple. A 16×16 image with a recognisable shape
 * is enough to show the thing the module is about — that a system transmitting
 * *what the scene contains* degrades differently from one transmitting *what
 * the pixels are* — and small enough that three architectures can be trained
 * honestly in a script that finishes in minutes.
 */

export const IMAGE_SIZE = 16;
export const IMAGE_PIXELS = IMAGE_SIZE * IMAGE_SIZE;

export const SCENE_CLASSES = ['disc', 'ring', 'bar', 'cross'] as const;
export type SceneClass = (typeof SCENE_CLASSES)[number];

export const SCENE_LABELS: Record<SceneClass, string> = {
  disc: 'Solid target',
  ring: 'Hollow target',
  bar: 'Linear feature',
  cross: 'Crossing features',
};

/** Everything that defines one scene — this *is* the semantic content. */
export interface SceneDescriptor {
  sceneClass: SceneClass;
  /** Centre, in pixels. */
  cx: number;
  cy: number;
  /** Characteristic size, in pixels. */
  size: number;
  /** Orientation in radians (used by bar and cross). */
  angle: number;
  /** Foreground brightness in [0, 1]. */
  intensity: number;
  /** Background brightness in [0, 1]. */
  background: number;
}

/** A seeded PRNG: xorshift32, same generator the channel simulation uses. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

export function randomScene(random: () => number): SceneDescriptor {
  const sceneClass = SCENE_CLASSES[Math.floor(random() * SCENE_CLASSES.length)] ?? 'disc';
  return {
    sceneClass,
    cx: 4 + random() * 8,
    cy: 4 + random() * 8,
    size: 2.5 + random() * 3,
    angle: random() * Math.PI,
    intensity: 0.65 + random() * 0.35,
    background: 0.05 + random() * 0.2,
  };
}

/**
 * Rasterises a scene into a Float64Array of `IMAGE_PIXELS` values in [0, 1].
 *
 * Edges are antialiased by a smooth step over roughly one pixel. At 16×16 a
 * hard threshold makes every shape a staircase, and the reconstruction metrics
 * then mostly measure how well each model reproduces aliasing.
 */
export function renderScene(scene: SceneDescriptor, noise = 0, random?: () => number): Float64Array {
  const pixels = new Float64Array(IMAGE_PIXELS);
  const smooth = (edge: number) => {
    // 1 well inside the shape, 0 well outside, smooth across ~1 px.
    const t = Math.min(1, Math.max(0, 0.5 - edge));
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      const dx = x + 0.5 - scene.cx;
      const dy = y + 0.5 - scene.cy;
      let coverage = 0;

      switch (scene.sceneClass) {
        case 'disc': {
          coverage = smooth(Math.hypot(dx, dy) - scene.size);
          break;
        }
        case 'ring': {
          const r = Math.hypot(dx, dy);
          const thickness = Math.max(1, scene.size * 0.35);
          coverage = smooth(Math.abs(r - scene.size) - thickness / 2);
          break;
        }
        case 'bar': {
          const along = dx * Math.cos(scene.angle) + dy * Math.sin(scene.angle);
          const across = -dx * Math.sin(scene.angle) + dy * Math.cos(scene.angle);
          coverage = Math.min(smooth(Math.abs(across) - 1.2), smooth(Math.abs(along) - scene.size));
          break;
        }
        case 'cross': {
          const a1 = dx * Math.cos(scene.angle) + dy * Math.sin(scene.angle);
          const b1 = -dx * Math.sin(scene.angle) + dy * Math.cos(scene.angle);
          const arm1 = Math.min(smooth(Math.abs(b1) - 1.0), smooth(Math.abs(a1) - scene.size));
          const arm2 = Math.min(smooth(Math.abs(a1) - 1.0), smooth(Math.abs(b1) - scene.size));
          coverage = Math.max(arm1, arm2);
          break;
        }
      }

      let value = scene.background + coverage * (scene.intensity - scene.background);
      if (noise > 0 && random) {
        value += (random() - 0.5) * 2 * noise;
      }
      pixels[y * IMAGE_SIZE + x] = Math.min(1, Math.max(0, value));
    }
  }
  return pixels;
}

export interface SceneSample {
  descriptor: SceneDescriptor;
  pixels: Float64Array;
}

/** A reproducible batch of scenes. The seed is the entire dataset identity. */
export function generateDataset(count: number, seed: number, sensorNoise = 0.03): SceneSample[] {
  const random = makeRng(seed);
  const samples: SceneSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const descriptor = randomScene(random);
    samples.push({ descriptor, pixels: renderScene(descriptor, sensorNoise, random) });
  }
  return samples;
}

/** Packs samples into one row-major [count, IMAGE_PIXELS] buffer. */
export function packSamples(samples: SceneSample[]): Float64Array {
  const buffer = new Float64Array(samples.length * IMAGE_PIXELS);
  samples.forEach((sample, index) => buffer.set(sample.pixels, index * IMAGE_PIXELS));
  return buffer;
}

/**
 * Peak signal-to-noise ratio between two [0, 1] images, in dB.
 *
 * Separate from `lib/imageMetrics.ts`, which works on 8-bit RGBA canvas buffers.
 * Converting between the two representations to share one function would cost
 * a quantisation step and make the reported numbers depend on it.
 */
export function psnr(reference: Float64Array, reconstruction: Float64Array): number {
  const n = Math.min(reference.length, reconstruction.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = reference[i]! - reconstruction[i]!;
    sum += d * d;
  }
  const mse = sum / n;
  if (mse <= 0) return Number.POSITIVE_INFINITY;
  // Peak is 1.0 for these images.
  return 10 * Math.log10(1 / mse);
}

/** Global SSIM over [0, 1] images — the structural half of the similarity score. */
export function ssim(reference: Float64Array, reconstruction: Float64Array): number {
  const n = Math.min(reference.length, reconstruction.length);
  if (n === 0) return 1;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += reference[i]!;
    meanB += reconstruction[i]!;
  }
  meanA /= n;
  meanB /= n;

  let varA = 0;
  let varB = 0;
  let covariance = 0;
  for (let i = 0; i < n; i += 1) {
    const da = reference[i]! - meanA;
    const db = reconstruction[i]! - meanB;
    varA += da * da;
    varB += db * db;
    covariance += da * db;
  }
  varA /= n;
  varB /= n;
  covariance /= n;

  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const value =
    ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
  return Math.min(1, Math.max(0, value));
}

/**
 * The per-pixel coverage of the shape, in [0, 1].
 *
 * This is the ground truth for "which pixels carry the meaning" — the object,
 * as opposed to the background it sits on. It is available because the scenes
 * are generated rather than captured, which is one of the practical reasons to
 * generate them: a real dataset would need hand-drawn masks before any
 * task-oriented metric could be computed at all.
 */
export const coverageMask = (scene: SceneDescriptor): Float64Array =>
  renderScene({ ...scene, intensity: 1, background: 0 });

/**
 * PSNR with a per-pixel weight — the task-oriented, "semantic" fidelity score.
 *
 * Plain PSNR treats a corrupted background pixel as exactly as bad as a
 * corrupted pixel of the object. For a receiver whose job is to act on what the
 * scene contains, it is not. `importance` at 0 gives ordinary PSNR; at 1 the
 * object is weighted ten times the background.
 */
export function weightedPsnr(
  reference: Float64Array,
  reconstruction: Float64Array,
  mask: Float64Array,
  importance: number,
): number {
  const n = Math.min(reference.length, reconstruction.length);
  if (n === 0) return 0;
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < n; i += 1) {
    const weight = 1 + importance * 9 * (mask[i] ?? 0);
    const d = reference[i]! - reconstruction[i]!;
    weighted += weight * d * d;
    weightSum += weight;
  }
  const mse = weighted / weightSum;
  if (mse <= 0) return Number.POSITIVE_INFINITY;
  return 10 * Math.log10(1 / mse);
}
