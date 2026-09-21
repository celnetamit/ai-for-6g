/**
 * The baseband link: Y = HX + N.
 *
 * Spec §7 names this equation, and naming it is the easy part. What makes it
 * worth implementing is that everything downstream — bit error rate, error
 * vector magnitude, block error rate, the constellation the learner looks at —
 * is then *counted from generated samples* rather than read off a formula.
 *
 * The convention throughout:
 *
 *   • `x` is a unit-average-energy constellation point (see `modulation.ts`).
 *   • `h` is the fading coefficient with E[|h|²] = 1, so all of the average
 *     power sits in the link budget and all of the variation sits in `h`.
 *   • noise is CN(0, 1), and the average SNR is folded into the signal
 *     amplitude as √(SNR). This is the standard normalisation and it means an
 *     instantaneous SNR is simply `SNR·|h|²` — no unit bookkeeping at the point
 *     of use, which is where unit errors get made.
 *
 * Fading is drawn from a seeded PRNG, so an experiment is reproducible: the
 * same configuration gives the same numbers, and a learner who disbelieves a
 * result can re-run it and get that same result to argue with.
 */

import {
  type Complex,
  absSq,
  complexGaussian,
  gaussianPair,
  scale,
} from './complex';
import { type Modulation, bitErrors, detect } from './modulation';
import { fromDb } from './channel';

/**
 * The propagation environments the lab offers.
 *
 * Each is a named set of the three parameters that actually distinguish them in
 * a link model — how much of the power arrives on a specular path (the Rician
 * K-factor), how fast the mean power decays with distance (the path-loss
 * exponent), and how much it varies from place to place at the same distance
 * (shadowing). The values are the conventional ones from 3GPP TR 38.901 and the
 * mmWave measurement literature, rounded; they are teaching values, not a
 * calibrated model of any deployment.
 */
export interface ChannelCondition {
  id: ChannelConditionId;
  label: string;
  /** Ratio of specular to diffuse power, in dB. -Infinity is pure Rayleigh. */
  ricianKDb: number;
  /** Excess path-loss exponent beyond free space (2.0 = free space). */
  pathLossExponent: number;
  /** Log-normal shadowing standard deviation, dB. */
  shadowingSigmaDb: number;
  /** Median extra loss on the direct path from obstruction, dB. */
  blockageDb: number;
  description: string;
}

export type ChannelConditionId = 'los' | 'nlos-urban' | 'indoor' | 'high-mobility';

export const CHANNEL_CONDITIONS: readonly ChannelCondition[] = [
  {
    id: 'los',
    label: 'Line of sight',
    ricianKDb: 10,
    pathLossExponent: 2.0,
    shadowingSigmaDb: 3,
    blockageDb: 0,
    description:
      'A clear path dominates. Fading is mild because most of the power arrives on one ray, and free-space loss governs the range.',
  },
  {
    id: 'nlos-urban',
    label: 'Urban non-line-of-sight',
    ricianKDb: Number.NEGATIVE_INFINITY,
    pathLossExponent: 3.2,
    shadowingSigmaDb: 8,
    blockageDb: 25,
    description:
      'No specular path: the received signal is a sum of many reflections, so the amplitude is Rayleigh and deep fades are common. This is the case an IRS exists to rescue.',
  },
  {
    id: 'indoor',
    label: 'Indoor / factory',
    ricianKDb: 3,
    pathLossExponent: 2.8,
    shadowingSigmaDb: 5,
    blockageDb: 12,
    description:
      'Dense scattering with a partial direct path. Short ranges, but walls and machinery add loss and the channel changes as people move.',
  },
  {
    id: 'high-mobility',
    label: 'High mobility',
    ricianKDb: 0,
    pathLossExponent: 3.0,
    shadowingSigmaDb: 6,
    blockageDb: 8,
    description:
      'A vehicular link. The model here is still block-fading — each block sees one channel draw — so it shows the depth of fades but not Doppler-induced intercarrier interference.',
  },
];

export const conditionById = (id: ChannelConditionId): ChannelCondition =>
  CHANNEL_CONDITIONS.find((c) => c.id === id) ?? CHANNEL_CONDITIONS[1]!;

/**
 * One fading coefficient, Rician with the given K-factor.
 *
 *   h = √(K/(K+1))·e^{jφ} + √(1/(K+1))·CN(0,1)
 *
 * K → ∞ is a pure line of sight (no fading at all); K = 0 reduces to Rayleigh,
 * because the specular term vanishes. E[|h|²] = 1 for every K, which is the
 * property the rest of the model relies on.
 */
export function ricianFading(kFactorDb: number, random: () => number): Complex {
  const diffuse = complexGaussian(random);
  if (!Number.isFinite(kFactorDb)) return diffuse; // Rayleigh
  const k = fromDb(kFactorDb);
  const specularWeight = Math.sqrt(k / (k + 1));
  const diffuseWeight = Math.sqrt(1 / (k + 1));
  // A fixed specular phase: it is a deterministic path, and giving it a random
  // phase per block would quietly turn the link back into Rayleigh.
  return {
    re: specularWeight + diffuseWeight * diffuse.re,
    im: diffuseWeight * diffuse.im,
  };
}

/** Log-normal shadowing, expressed in dB (so: a zero-mean Gaussian in dB). */
export function shadowingDb(sigmaDb: number, random: () => number): number {
  if (sigmaDb <= 0) return 0;
  return gaussianPair(random)[0] * sigmaDb;
}

export interface TransmissionResult {
  /** Symbols as they arrived, after equalisation by the known channel. */
  equalised: Complex[];
  /** The transmitted constellation points, for the reference constellation. */
  ideal: Complex[];
  bitsSent: number;
  bitErrors: number;
  /** Counted, not predicted. */
  ber: number;
  /** Fraction of blocks containing at least one bit error. */
  bler: number;
  /** RMS error vector magnitude as a fraction of the reference amplitude. */
  evm: number;
  /** Mean instantaneous SNR actually realised across the blocks, in dB. */
  realisedSnrDb: number;
}

export interface TransmissionConfig {
  modulation: Modulation;
  /** Average receive SNR in dB, from the link budget. */
  averageSnrDb: number;
  condition: ChannelCondition;
  /** Symbols per block; a block is in error if any of its bits is. */
  symbolsPerBlock: number;
  blocks: number;
  /** Equalisation is perfect unless a CSI error variance is given. */
  csiErrorVariance?: number;
}

/**
 * Runs the link and counts what went wrong.
 *
 * Block fading: one channel draw per block, which is the standard model for a
 * coherence interval and is what makes the BER of a fading channel so much
 * worse than AWGN at the same average SNR — the average is dominated by the
 * blocks that drew a deep fade. A learner who expects the AWGN waterfall and
 * sees this curve has learned the single most important thing about fading.
 */
export function runTransmission(
  config: TransmissionConfig,
  random: () => number,
): TransmissionResult {
  const { modulation, condition, symbolsPerBlock, blocks } = config;
  const bits = modulation.bitsPerSymbol;
  const constellationSize = 1 << bits;
  const amplitude = Math.sqrt(fromDb(config.averageSnrDb));

  const equalised: Complex[] = [];
  const ideal: Complex[] = [];
  let totalBitErrors = 0;
  let totalBits = 0;
  let blocksInError = 0;
  let snrAccumulator = 0;
  /*
   * EVM is accumulated over every symbol, not over the bounded sample kept for
   * the constellation plot.
   *
   * It used to be computed from `equalised`, which stops growing at 600
   * symbols — so a 40 000-symbol run reported the EVM of its first 600. Those
   * are the first few blocks, and under block fading a handful of blocks is
   * exactly the regime where one deep fade dominates, so the figure moved
   * around for reasons that had nothing to do with the link.
   */
  let errorPower = 0;
  let referencePower = 0;

  for (let block = 0; block < blocks; block += 1) {
    const h = ricianFading(condition.ricianKDb, random);
    const gain = absSq(h);
    snrAccumulator += gain * fromDb(config.averageSnrDb);

    // The receiver's channel estimate. With no error term this is perfect CSI;
    // with one, equalisation is done with the wrong number, which is where an
    // AI channel estimator would earn its keep.
    const estimate =
      config.csiErrorVariance && config.csiErrorVariance > 0
        ? {
            re: h.re + gaussianPair(random)[0] * Math.sqrt(config.csiErrorVariance / 2),
            im: h.im + gaussianPair(random)[1] * Math.sqrt(config.csiErrorVariance / 2),
          }
        : h;

    let blockErrored = false;
    for (let s = 0; s < symbolsPerBlock; s += 1) {
      const index = Math.min(constellationSize - 1, Math.floor(random() * constellationSize));
      const x = modulation.points[index]!;

      // y = h·x·√SNR + n, with n ~ CN(0,1).
      const noise = complexGaussian(random);
      const y: Complex = {
        re: amplitude * (h.re * x.re - h.im * x.im) + noise.re,
        im: amplitude * (h.re * x.im + h.im * x.re) + noise.im,
      };

      // Zero-forcing equalisation by the estimate: x̂ = y / (ĥ·√SNR).
      const denominator = absSq(estimate) * amplitude;
      const z: Complex =
        denominator === 0
          ? { re: 0, im: 0 }
          : {
              re: (y.re * estimate.re + y.im * estimate.im) / denominator,
              im: (y.im * estimate.re - y.re * estimate.im) / denominator,
            };

      const decided = detect(z, modulation);
      const errors = bitErrors(index, decided, bits);
      totalBitErrors += errors;
      totalBits += bits;
      if (errors > 0) blockErrored = true;

      errorPower += absSq({ re: z.re - x.re, im: z.im - x.im });
      referencePower += absSq(x);

      // Keep a bounded sample of the constellation for the plot; the full run
      // can be tens of thousands of symbols and the scatter saturates long
      // before that.
      if (equalised.length < 600) {
        equalised.push(z);
        ideal.push(x);
      }
    }
    if (blockErrored) blocksInError += 1;
  }

  return {
    equalised,
    ideal,
    bitsSent: totalBits,
    bitErrors: totalBitErrors,
    ber: totalBits === 0 ? 0 : totalBitErrors / totalBits,
    bler: blocks === 0 ? 0 : blocksInError / blocks,
    evm: referencePower === 0 ? 0 : Math.sqrt(errorPower / referencePower),
    realisedSnrDb: blocks === 0 ? config.averageSnrDb : 10 * Math.log10(snrAccumulator / blocks),
  };
}

/**
 * Closed-form BER for Gray-coded square QAM on AWGN, used as the reference the
 * measured curve is checked against.
 *
 *   Pb ≈ (4/log2 M)(1 − 1/√M) Q(√(3·log2M·Eb/N0/(M−1)))
 *
 * Exact for BPSK and QPSK, a tight approximation above them.
 */
export function theoreticalAwgnBer(modulation: Modulation, esN0Db: number): number {
  const m = 1 << modulation.bitsPerSymbol;
  const esN0 = fromDb(esN0Db);
  if (modulation.bitsPerSymbol === 1) {
    // BPSK: Q(√(2Eb/N0)) with Eb = Es.
    return qTail(Math.sqrt(2 * esN0));
  }
  const root = Math.sqrt((3 * esN0) / (m - 1));
  const prefix = (4 / modulation.bitsPerSymbol) * (1 - 1 / Math.sqrt(m));
  return Math.min(0.5, prefix * qTail(root));
}

/** Local copy of Q(x) so this module does not depend on the link-budget file. */
function qTail(x: number): number {
  // Same Numerical Recipes erfc as lib/channel.ts; re-derived here would risk
  // the two drifting apart, so it delegates.
  return 0.5 * erfcLocal(x / Math.SQRT2);
}

function erfcLocal(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Scales a constellation point by an amplitude — exported for the JSCC path. */
export const amplify = (x: Complex, amplitude: number): Complex => scale(x, amplitude);
