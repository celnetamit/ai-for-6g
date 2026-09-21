import { describe, expect, it } from 'vitest';
import {
  type IrsConfig,
  type LinkConfig,
  closedFormPhases,
  effectiveChannel,
  generateIrsChannels,
  quantisationLossDb,
  quantisePhases,
  randomPhases,
  snrForPhases,
  wrapPhase,
} from '../lib/irs';
import { OPTIMIZERS, optimisePhases } from '../lib/optimizers';
import { CHANNEL_CONDITIONS } from '../lib/signalModel';
import { makeRng } from '../lib/channel';
import { absSq } from '../lib/complex';

const link: LinkConfig = {
  txPowerDbm: 20,
  frequencyHz: 28e9,
  bandwidthHz: 100e6,
  txGainDbi: 15,
  rxGainDbi: 10,
  noiseFigureDb: 7,
  elementGainDbi: 3,
};

const baseIrs = (elementCount: number): IrsConfig => ({
  elementCount,
  reflectionCoefficient: 1,
  phaseBits: 0,
  transmitter: { x: 0, y: 0, z: 10 },
  surface: { x: 15, y: 5, z: 8 },
  receiver: { x: 30, y: 0, z: 1.5 },
});

const urban = CHANNEL_CONDITIONS[1]!;

/**
 * The same environment with the direct path removed entirely.
 *
 * The N² law is a statement about the *cascaded* link, and at these geometries
 * the blocked-but-present direct path is within a few dB of the surface — so
 * with it in the sum, doubling the elements moves the total by much less than
 * 6 dB and the law looks false when it is merely being masked. Deep blockage is
 * the regime the law describes, and it is also the deployment an IRS is for.
 */
const fullyBlocked = { ...urban, blockageDb: 200 };

/**
 * Averaging over fading draws. A single realisation of a Rayleigh channel says
 * nothing — the whole point of fading is that any one draw can be anything —
 * so every scaling law below is checked on a mean over many draws.
 */
function meanSnrDb(
  elementCount: number,
  mode: 'aligned' | 'random',
  draws = 24,
  condition = fullyBlocked,
): number {
  let total = 0;
  for (let i = 0; i < draws; i += 1) {
    const random = makeRng(1000 + i * 37);
    const channels = generateIrsChannels(baseIrs(elementCount), link, condition, random);
    const phases =
      mode === 'aligned' ? closedFormPhases(channels) : randomPhases(elementCount, random);
    total += snrForPhases(channels, phases);
  }
  return total / draws;
}

describe('the IRS channel model', () => {
  it('gives 6 dB per doubling when the phases are aligned — the N² law', () => {
    // This is the single result the module exists to teach. Power ∝ N², so
    // doubling the elements is +6.02 dB.
    for (const [small, large] of [
      [16, 32],
      [32, 64],
      [64, 128],
    ] as const) {
      const gain = meanSnrDb(large, 'aligned') - meanSnrDb(small, 'aligned');
      expect(gain).toBeGreaterThan(5.4);
      expect(gain).toBeLessThan(6.6);
    }
  });

  it('gives only about 3 dB per doubling when the phases are random — the N law', () => {
    // Incoherent addition: power grows as N, not N². The gap between this and
    // the test above is the entire value of the word "intelligent".
    const gain = meanSnrDb(128, 'random', 40) - meanSnrDb(32, 'random', 40);
    // Two doublings at ~3 dB each; the spread is wide because incoherent sums
    // are themselves random, so the bound is loose on purpose.
    expect(gain).toBeGreaterThan(3);
    expect(gain).toBeLessThan(9);
  });

  it('beats random phases by roughly 10·log10(N) dB', () => {
    const n = 64;
    const advantage = meanSnrDb(n, 'aligned') - meanSnrDb(n, 'random');
    // Aligned is ∝N², random is ∝N, so the ratio is ∝N → 18 dB at N = 64.
    expect(advantage).toBeGreaterThan(12);
    expect(advantage).toBeLessThan(24);
  });

  it('loses the predicted amount to 1-bit and 2-bit phase quantisation', () => {
    // Theory: 3.92 dB for 1 bit, 0.91 dB for 2 bits.
    expect(quantisationLossDb(1)).toBeCloseTo(3.92, 1);
    expect(quantisationLossDb(2)).toBeCloseTo(0.91, 1);

    for (const bits of [1, 2, 3]) {
      let measured = 0;
      const draws = 24;
      for (let i = 0; i < draws; i += 1) {
        const random = makeRng(500 + i * 91);
        const channels = generateIrsChannels(baseIrs(64), link, fullyBlocked, random);
        const ideal = closedFormPhases(channels);
        measured += snrForPhases(channels, ideal) - snrForPhases(channels, quantisePhases(ideal, bits));
      }
      measured /= draws;
      expect(Math.abs(measured - quantisationLossDb(bits))).toBeLessThan(0.7);
    }
  });

  it('scales with the square of the reflection coefficient', () => {
    const random = makeRng(4242);
    const lossless = generateIrsChannels(
      { ...baseIrs(64), reflectionCoefficient: 1 },
      link,
      fullyBlocked,
      random,
    );
    const lossy = { ...lossless, reflectionCoefficient: 0.5 };
    const phases = closedFormPhases(lossless);
    const drop = snrForPhases(lossless, phases) - snrForPhases(lossy, phases);
    // Amplitude halved → power quartered → 6 dB.
    expect(drop).toBeCloseTo(6.02, 0);
  });

  it('draws a direct path that does not depend on the element count', () => {
    // The element sweep plots the direct path alongside the surface. Both come
    // off one PRNG stream, so if the direct path is drawn after the elements,
    // changing N changes how many values were consumed first and the direct
    // line wanders by several dB — on a chart whose whole point is that it
    // should not. This pins the ordering.
    const reference = generateIrsChannels(baseIrs(1), link, urban, makeRng(4321)).direct;
    for (const n of [2, 8, 64, 256]) {
      const other = generateIrsChannels(baseIrs(n), link, urban, makeRng(4321)).direct;
      expect(other.re).toBeCloseTo(reference.re, 12);
      expect(other.im).toBeCloseTo(reference.im, 12);
    }
  });

  it('rises monotonically with N when the cascade is the only path', () => {
    /*
     * Sharing one seed across the points does not make the surfaces nested — a
     * 16-element surface is laid out 4×4 and a 128-element one 11×12, so the
     * elements sit in different places and their steering phases differ — but
     * it does give every point the same shadowing and the same diffuse
     * scattering draws. With the direct path removed, that is enough for the
     * aligned curve to rise at every step.
     */
    let previous = Number.NEGATIVE_INFINITY;
    for (let n = 1; n <= 256; n *= 2) {
      const channels = generateIrsChannels(baseIrs(n), link, fullyBlocked, makeRng(4321));
      const snr = snrForPhases(channels, closedFormPhases(channels));
      expect(snr).toBeGreaterThan(previous);
      previous = snr;
    }
  });

  it('may wobble at small N while the direct path still dominates, but not by much', () => {
    /*
     * The test above deliberately removes the direct path, so on its own it
     * would let a reader believe the sweep the UI draws is monotonic
     * everywhere. It is not: with a live direct path the combined magnitude is
     * |h_d + cascade|, and at N = 2 to 4 the cascade is 20-30 dB below h_d, so
     * re-laying out the array moves the sum by a fraction of a dB in either
     * direction.
     *
     * That is physics, not a defect, and the honest thing is to bound it rather
     * than assert it away: any backward step must be small, and the curve must
     * still climb strongly overall. A large backward step WOULD be a defect.
     */
    const draws: number[] = [];
    for (let n = 1; n <= 256; n *= 2) {
      const channels = generateIrsChannels(baseIrs(n), link, urban, makeRng(20260921));
      draws.push(snrForPhases(channels, quantisePhases(closedFormPhases(channels), 2)));
    }

    let worstStepBack = 0;
    for (let i = 1; i < draws.length; i += 1) {
      worstStepBack = Math.max(worstStepBack, draws[i - 1]! - draws[i]!);
    }
    expect(
      worstStepBack,
      `the sweep stepped back by ${worstStepBack.toFixed(2)} dB: ${draws.map((d) => d.toFixed(1)).join(', ')}`,
    ).toBeLessThan(1.5);

    // And the whole sweep must still be worth drawing.
    expect(draws[draws.length - 1]! - draws[0]!).toBeGreaterThan(15);
  });

  it('wraps phases into (−π, π]', () => {
    for (const theta of [0, 3, -3, 7, -7, 100.5]) {
      const wrapped = wrapPhase(theta);
      expect(wrapped).toBeGreaterThan(-Math.PI - 1e-9);
      expect(wrapped).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.abs(Math.cos(wrapped) - Math.cos(theta))).toBeLessThan(1e-9);
    }
  });

  it('aligns every cascaded term with the direct path', () => {
    const random = makeRng(77);
    const channels = generateIrsChannels(baseIrs(32), link, urban, random);
    const phases = closedFormPhases(channels);
    const combined = effectiveChannel(channels, phases);
    // Coherent combining means the magnitude equals the sum of magnitudes.
    let sumOfMagnitudes = Math.sqrt(absSq(channels.direct));
    for (let n = 0; n < channels.elementCount; n += 1) {
      sumOfMagnitudes += Math.sqrt(
        absSq(channels.fromSurface[n]!) * absSq(channels.toSurface[n]!),
      );
    }
    expect(Math.sqrt(absSq(combined))).toBeCloseTo(sumOfMagnitudes, 8);
  });
});

describe('phase optimisers', () => {
  const options = { budget: 2400, phaseBits: 2, random: makeRng(31) };

  it('every method is charged the same budget and reports a real trace', () => {
    const random = makeRng(909);
    const channels = generateIrsChannels(baseIrs(24), link, fullyBlocked, random);

    for (const meta of OPTIMIZERS) {
      const result = optimisePhases(channels, meta.id, { ...options, random: makeRng(17) });
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.evaluations).toBeLessThanOrEqual(
        meta.id === 'closed-form' ? 1 : options.budget + 1,
      );
      // The trace must be monotonic: it is best-so-far.
      for (let i = 1; i < result.trace.length; i += 1) {
        expect(result.trace[i]!.snrDb).toBeGreaterThanOrEqual(result.trace[i - 1]!.snrDb - 1e-6);
      }
      expect(result.phases).toHaveLength(channels.elementCount);
    }
  });

  it('the learned methods beat random search, and none beats the closed form', () => {
    let reinforceWins = 0;
    let crossEntropyWins = 0;
    let greedyWins = 0;
    const trials = 6;

    for (let trial = 0; trial < trials; trial += 1) {
      const channels = generateIrsChannels(baseIrs(16), link, fullyBlocked, makeRng(200 + trial * 53));
      const shared = { budget: 3000, phaseBits: 2 };

      const random = optimisePhases(channels, 'random', { ...shared, random: makeRng(trial + 1) });
      const reinforce = optimisePhases(channels, 'reinforce', { ...shared, random: makeRng(trial + 1) });
      const cem = optimisePhases(channels, 'cross-entropy', { ...shared, random: makeRng(trial + 1) });
      const greedy = optimisePhases(channels, 'greedy', { ...shared, random: makeRng(trial + 1) });
      const optimal = optimisePhases(channels, 'closed-form', { ...shared, random: makeRng(trial + 1) });

      if (reinforce.bestSnrDb > random.bestSnrDb) reinforceWins += 1;
      if (cem.bestSnrDb > random.bestSnrDb) crossEntropyWins += 1;
      if (greedy.bestSnrDb > random.bestSnrDb) greedyWins += 1;

      // The closed form is the ceiling — up to the quantisation the searches
      // also pay, so allow a small slack rather than asserting strict order.
      for (const result of [reinforce, cem, greedy, random]) {
        expect(result.bestSnrDb).toBeLessThanOrEqual(optimal.bestSnrDb + 1.5);
      }
    }

    expect(reinforceWins).toBeGreaterThanOrEqual(trials - 1);
    expect(crossEntropyWins).toBeGreaterThanOrEqual(trials - 1);
    expect(greedyWins).toBeGreaterThanOrEqual(trials - 1);
  });
});
