/**
 * Measured image-quality metrics.
 *
 * The simulators previously *asserted* their outcomes:
 *
 *   objectRecognitionConfidence = 100 - noiseLevel * 0.8
 *   traditionalAccuracy         = 98 - noiseLevel * 2.2
 *   semanticAccuracy            = 98 - noiseLevel * 0.9
 *
 * Three straight lines with invented slopes, printed to one decimal place as
 * though they had been computed from something. In the Capstone that number was
 * then written into the learner's saved progress as their assessed result.
 *
 * These functions instead measure the pixels that were actually received
 * against the pixels that were actually sent. The numbers move because the
 * image changed, and a learner who does not believe one can reproduce it.
 */

/** Mean squared error per channel between two RGBA buffers. */
export function meanSquaredError(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let sum = 0;
  let samples = 0;
  for (let i = 0; i < length; i += 4) {
    // Alpha is skipped: it is constant here and would dilute the result.
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = (a[i + channel] ?? 0) - (b[i + channel] ?? 0);
      sum += delta * delta;
      samples += 1;
    }
  }
  return samples === 0 ? 0 : sum / samples;
}

/**
 * Peak signal-to-noise ratio in dB — the standard measure of reconstruction
 * fidelity, and the one a communications course expects to see.
 *
 * Returns Infinity for an exact match, which callers must handle.
 */
export function psnrDb(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const mse = meanSquaredError(a, b);
  if (mse === 0) return Number.POSITIVE_INFINITY;
  return 10 * Math.log10((255 * 255) / mse);
}

/**
 * A structural similarity score in [0, 1], computed globally.
 *
 * This is the single-window form of SSIM (Wang et al., 2004) over the
 * luminance of the whole image, rather than the usual 8x8 sliding window. That
 * is a real simplification and it is stated here rather than hidden: it
 * captures loss of contrast and correlation, which is what channel noise does
 * to these samples, but it will not localise damage the way windowed SSIM does.
 *
 * It is used as the "semantic" score because it tracks whether the *structure*
 * of the image survived, which is exactly the distinction the module teaches:
 * bit-level fidelity can collapse while structure remains recognisable.
 */
export function globalSsim(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 1;

  const luma = (buffer: Uint8ClampedArray, i: number) =>
    0.299 * (buffer[i] ?? 0) + 0.587 * (buffer[i + 1] ?? 0) + 0.114 * (buffer[i + 2] ?? 0);

  let n = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < length; i += 4) {
    sumA += luma(a, i);
    sumB += luma(b, i);
    n += 1;
  }
  if (n === 0) return 1;

  const meanA = sumA / n;
  const meanB = sumB / n;

  let varA = 0;
  let varB = 0;
  let covariance = 0;
  for (let i = 0; i < length; i += 4) {
    const da = luma(a, i) - meanA;
    const db = luma(b, i) - meanB;
    varA += da * da;
    varB += db * db;
    covariance += da * db;
  }
  varA /= n;
  varB /= n;
  covariance /= n;

  // Stabilising constants from the original paper, for 8-bit data.
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;

  const ssim =
    ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));

  return Math.min(1, Math.max(0, ssim));
}
