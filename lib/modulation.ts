/**
 * Gray-coded square QAM constellations, with symbol mapping and ML detection.
 *
 * These exist so that the bit error rate reported by an experiment is *counted*
 * rather than looked up. A formula for BER is a prediction; a Monte Carlo run
 * over a generated channel is a measurement, and the two agreeing is the check
 * a learner can actually perform. `tests/modulation.test.ts` does exactly that:
 * it runs the simulator at several SNRs and asserts the counted BER sits close
 * to the closed-form curve.
 *
 * Gray coding matters and is not decorative. Adjacent constellation points
 * differ in exactly one bit, so the overwhelmingly most likely symbol error
 * (mistaking a point for its neighbour) costs one bit instead of several. Skip
 * it and the measured BER is roughly `log2(M)/2` times worse than every
 * textbook curve, which would make the comparison above fail for a reason that
 * has nothing to do with the channel.
 */

import { type Complex, absSq, complex } from './complex';

export type ModulationName = 'BPSK' | 'QPSK' | '16-QAM' | '64-QAM';

export interface Modulation {
  name: ModulationName;
  /** Bits carried per channel use. */
  bitsPerSymbol: number;
  /** Unit-average-energy constellation, indexed by the integer the bits form. */
  points: readonly Complex[];
  /**
   * Minimum Es/N0 in dB for a raw BER near 1e-3 on an AWGN channel — the point
   * a rate-1/2-coded link would clear comfortably. Used by the adaptive
   * modulation-and-coding selector; derived in `REQUIRED_ES_N0_DB` below.
   */
  requiredEsN0Db: number;
}

/** Binary-reflected Gray code: index → Gray-coded value. */
export const grayCode = (index: number): number => index ^ (index >>> 1);

/** Builds the PAM level sequence for one axis, ordered so the code is Gray. */
function grayPamLevels(bitsPerAxis: number): number[] {
  const size = 1 << bitsPerAxis;
  const levels = new Array<number>(size);
  for (let i = 0; i < size; i += 1) {
    // Natural level for position i is (2i - (size-1)); Gray coding permutes
    // which bit pattern lands on which level, so invert the map.
    levels[grayCode(i)] = 2 * i - (size - 1);
  }
  return levels;
}

function buildSquareQam(bitsPerSymbol: number): Complex[] {
  if (bitsPerSymbol === 1) {
    // BPSK is not square; it is 2-PAM on the real axis.
    return [complex(-1, 0), complex(1, 0)];
  }
  const bitsPerAxis = bitsPerSymbol / 2;
  const levels = grayPamLevels(bitsPerAxis);
  const size = 1 << bitsPerAxis;

  // Average energy of a square M-QAM with levels ±1, ±3, … is 2(M-1)/3.
  const energy = (2 * ((1 << bitsPerSymbol) - 1)) / 3;
  const norm = 1 / Math.sqrt(energy);

  const points: Complex[] = new Array((1 << bitsPerSymbol) as number);
  for (let i = 0; i < size; i += 1) {
    for (let q = 0; q < size; q += 1) {
      // High bits select the in-phase level, low bits the quadrature one.
      const index = (i << bitsPerAxis) | q;
      points[index] = complex(levels[i]! * norm, levels[q]! * norm);
    }
  }
  return points;
}

/**
 * Es/N0 thresholds, in dB, at which each constellation reaches a raw BER of
 * about 1e-3 on AWGN. Computed once from the standard square-QAM union bound
 * and rounded; `tests/modulation.test.ts` checks the measured BER at each
 * threshold really is within a factor of a few of 1e-3, so these cannot drift
 * away from the constellations they describe.
 */
const REQUIRED_ES_N0_DB: Record<ModulationName, number> = {
  BPSK: 6.8,
  QPSK: 9.8,
  '16-QAM': 16.5,
  '64-QAM': 22.5,
};

const make = (name: ModulationName, bitsPerSymbol: number): Modulation => ({
  name,
  bitsPerSymbol,
  points: buildSquareQam(bitsPerSymbol),
  requiredEsN0Db: REQUIRED_ES_N0_DB[name],
});

export const BPSK = make('BPSK', 1);
export const QPSK = make('QPSK', 2);
export const QAM16 = make('16-QAM', 4);
export const QAM64 = make('64-QAM', 6);

/** Ordered by spectral efficiency, which is the order the MCS selector walks. */
export const MODULATIONS: readonly Modulation[] = [BPSK, QPSK, QAM16, QAM64];

export const modulationByName = (name: ModulationName): Modulation =>
  MODULATIONS.find((m) => m.name === name) ?? QPSK;

/**
 * Highest-order modulation whose threshold the link clears.
 *
 * This is what makes throughput respond to the channel the way a real radio
 * does — a link that loses 6 dB does not get a slightly noisier 64-QAM, it
 * drops to 16-QAM and loses a third of its rate. Returns `null` when even BPSK
 * cannot close, which is an outage and must be reported as one rather than
 * silently floored.
 */
export function selectModulation(esN0Db: number): Modulation | null {
  let chosen: Modulation | null = null;
  for (const modulation of MODULATIONS) {
    if (esN0Db >= modulation.requiredEsN0Db) chosen = modulation;
  }
  return chosen;
}

/** Maximum-likelihood detection: the nearest constellation point. */
export function detect(received: Complex, modulation: Modulation): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < modulation.points.length; i += 1) {
    const point = modulation.points[i]!;
    const dr = received.re - point.re;
    const di = received.im - point.im;
    const distance = dr * dr + di * di;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Population count — the number of bit positions in which two symbols differ. */
export function bitErrors(a: number, b: number, bits: number): number {
  let x = (a ^ b) & ((1 << bits) - 1);
  let count = 0;
  while (x) {
    x &= x - 1;
    count += 1;
  }
  return count;
}

/**
 * Error vector magnitude, as a fraction (multiply by 100 for the usual %).
 *
 * EVM is the number a spectrum analyser shows on a real link, so it is the
 * "signal quality" figure in §6 that a learner could go and verify against
 * hardware. It is the RMS distance between the equalised symbols and the ideal
 * points, relative to the RMS reference magnitude.
 */
export function errorVectorMagnitude(
  equalised: readonly Complex[],
  ideal: readonly Complex[],
): number {
  const n = Math.min(equalised.length, ideal.length);
  if (n === 0) return 0;
  let errorPower = 0;
  let referencePower = 0;
  for (let i = 0; i < n; i += 1) {
    const e = equalised[i]!;
    const r = ideal[i]!;
    errorPower += absSq({ re: e.re - r.re, im: e.im - r.im });
    referencePower += absSq(r);
  }
  return referencePower === 0 ? 0 : Math.sqrt(errorPower / referencePower);
}
