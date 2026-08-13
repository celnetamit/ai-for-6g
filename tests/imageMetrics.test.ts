import { describe, expect, it } from 'vitest';

import { globalSsim, meanSquaredError, psnrDb } from '../lib/imageMetrics';

/** Builds an RGBA buffer of `n` pixels, each channel set from `f`. */
function buffer(n: number, f: (i: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    const value = f(i);
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('mean squared error', () => {
  it('is zero for identical buffers', () => {
    const a = buffer(64, (i) => i * 3);
    expect(meanSquaredError(a, a)).toBe(0);
  });

  it('equals the squared difference for a constant offset', () => {
    const a = buffer(64, () => 100);
    const b = buffer(64, () => 110);
    expect(meanSquaredError(a, b)).toBeCloseTo(100, 6);
  });

  it('ignores the alpha channel', () => {
    const a = buffer(16, () => 50);
    const b = buffer(16, () => 50);
    for (let i = 0; i < 16; i += 1) b[i * 4 + 3] = 0;
    expect(meanSquaredError(a, b)).toBe(0);
  });

  it('handles an empty buffer without dividing by zero', () => {
    expect(meanSquaredError(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('PSNR', () => {
  it('is infinite for a perfect match', () => {
    const a = buffer(32, (i) => i);
    expect(psnrDb(a, a)).toBe(Number.POSITIVE_INFINITY);
  });

  /* PSNR = 10 log10(255^2 / MSE). MSE 100 => 10 log10(650.25) = 28.13 dB. */
  it('matches the definition', () => {
    const a = buffer(64, () => 100);
    const b = buffer(64, () => 110);
    expect(psnrDb(a, b)).toBeCloseTo(28.13, 1);
  });

  it('falls as distortion grows', () => {
    const reference = buffer(64, () => 128);
    const small = psnrDb(reference, buffer(64, () => 133));
    const large = psnrDb(reference, buffer(64, () => 190));
    expect(large).toBeLessThan(small);
  });
});

describe('global SSIM', () => {
  it('is 1 for identical images', () => {
    const a = buffer(256, (i) => (i * 7) % 256);
    expect(globalSsim(a, a)).toBeCloseTo(1, 6);
  });

  it('stays within [0, 1]', () => {
    const a = buffer(256, (i) => (i * 13) % 256);
    const b = buffer(256, (i) => (i * 91 + 40) % 256);
    const score = globalSsim(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores a structurally similar image above an unrelated one', () => {
    const reference = buffer(256, (i) => (i < 128 ? 40 : 200));
    // Same structure, slightly shifted in level.
    const similar = buffer(256, (i) => (i < 128 ? 50 : 205));
    // Same mean, no structure.
    const noise = buffer(256, (i) => ((i * 977) % 256));
    expect(globalSsim(reference, similar)).toBeGreaterThan(globalSsim(reference, noise));
  });

  it('penalises a loss of contrast', () => {
    const reference = buffer(256, (i) => (i < 128 ? 0 : 255));
    const flattened = buffer(256, () => 128);
    expect(globalSsim(reference, flattened)).toBeLessThan(0.5);
  });

  it('handles an empty buffer', () => {
    expect(globalSsim(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(1);
  });
});
