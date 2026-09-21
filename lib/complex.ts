/**
 * Complex arithmetic for the baseband signal model.
 *
 * The spec (§7) asks for `Y = HX + N` and `y = (h_rᵀ Φ h_t)x + n`. Both are
 * statements about *complex* quantities: a wireless channel rotates the phase
 * of a symbol as well as scaling it, and an IRS does nothing except set phases.
 * Modelling either with real numbers throws away the only degree of freedom the
 * surface has, so everything below the link budget works on complex pairs.
 *
 * Stored as `{re, im}` objects rather than interleaved arrays. The arrays are
 * faster, but a 256-element surface evaluated a few thousand times is well
 * inside budget at this size, and the readable form is what lets a learner
 * check the code against the equation printed above it.
 */

export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });

export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });

export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });

/** Complex conjugate. */
export const conj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

/** Squared magnitude — |a|², the quantity that carries power. */
export const absSq = (a: Complex): number => a.re * a.re + a.im * a.im;

export const arg = (a: Complex): number => Math.atan2(a.im, a.re);

/** e^{jθ} — a unit phasor, which is exactly what one IRS element applies. */
export const phasor = (theta: number): Complex => ({ re: Math.cos(theta), im: Math.sin(theta) });

export const div = (a: Complex, b: Complex): Complex => {
  const d = absSq(b);
  if (d === 0) return { re: 0, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/** Inner product Σ aᵢ bᵢ (no conjugation — the transpose in h_rᵀ Φ h_t). */
export function dot(a: readonly Complex[], b: readonly Complex[]): Complex {
  let re = 0;
  let im = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    re += x.re * y.re - x.im * y.im;
    im += x.re * y.im + x.im * y.re;
  }
  return { re, im };
}

/**
 * Two independent standard normal samples from one uniform pair.
 *
 * Box–Muller. A Rayleigh channel coefficient is a complex Gaussian, so the
 * real and imaginary parts are exactly the pair this returns; generating them
 * by any other route (summing uniforms, say) gives the wrong tail, and the tail
 * is where outage lives.
 */
export function gaussianPair(random: () => number): [number, number] {
  // log(0) is -Infinity; the guard costs nothing and removes the failure.
  const u1 = Math.max(random(), Number.MIN_VALUE);
  const u2 = random();
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

/**
 * A circularly-symmetric complex Gaussian sample, CN(0, 1).
 *
 * Unit *total* variance: E[|h|²] = 1, so each component has variance 1/2. That
 * normalisation matters — it is what lets the large-scale path loss carry all
 * of the average power, and the fading carry only its variation.
 */
export function complexGaussian(random: () => number): Complex {
  const [a, b] = gaussianPair(random);
  return { re: a / Math.SQRT2, im: b / Math.SQRT2 };
}
