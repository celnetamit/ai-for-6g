import { describe, expect, it } from 'vitest';
import {
  BPSK,
  MODULATIONS,
  QAM16,
  QPSK,
  bitErrors,
  detect,
  errorVectorMagnitude,
  grayCode,
  selectModulation,
} from '../lib/modulation';
import { CHANNEL_CONDITIONS, runTransmission, theoreticalAwgnBer } from '../lib/signalModel';
import { absSq } from '../lib/complex';
import { makeRng } from '../lib/channel';

describe('constellations', () => {
  for (const modulation of MODULATIONS) {
    it(`${modulation.name} has unit average energy and the right size`, () => {
      expect(modulation.points).toHaveLength(1 << modulation.bitsPerSymbol);
      const energy =
        modulation.points.reduce((sum, point) => sum + absSq(point), 0) / modulation.points.length;
      expect(energy).toBeCloseTo(1, 10);
    });

    it(`${modulation.name} is Gray coded — neighbours differ in one bit`, () => {
      // For every point, the nearest other point must be one bit away. This is
      // the property that makes the measured BER match the textbook curve; a
      // natural binary mapping would be several times worse.
      modulation.points.forEach((point, index) => {
        let nearest = -1;
        let best = Number.POSITIVE_INFINITY;
        modulation.points.forEach((other, otherIndex) => {
          if (otherIndex === index) return;
          const distance = (point.re - other.re) ** 2 + (point.im - other.im) ** 2;
          if (distance < best - 1e-12) {
            best = distance;
            nearest = otherIndex;
          }
        });
        expect(bitErrors(index, nearest, modulation.bitsPerSymbol)).toBe(1);
      });
    });
  }

  it('produces a binary-reflected Gray sequence', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(grayCode)).toEqual([0, 1, 3, 2, 6, 7, 5, 4]);
  });

  it('detects the transmitted point when there is no noise', () => {
    QAM16.points.forEach((point, index) => {
      expect(detect(point, QAM16)).toBe(index);
    });
  });

  it('reports zero EVM for a perfect receiver', () => {
    expect(errorVectorMagnitude(QPSK.points, QPSK.points)).toBeCloseTo(0, 12);
  });
});

describe('link adaptation', () => {
  it('walks up the table as the SNR improves, and reports outage below BPSK', () => {
    expect(selectModulation(0)).toBeNull();
    expect(selectModulation(7)?.name).toBe('BPSK');
    expect(selectModulation(12)?.name).toBe('QPSK');
    expect(selectModulation(18)?.name).toBe('16-QAM');
    expect(selectModulation(30)?.name).toBe('64-QAM');
  });

  it('never selects a modulation whose threshold is not met', () => {
    for (let snr = -5; snr <= 35; snr += 0.5) {
      const chosen = selectModulation(snr);
      if (chosen) expect(snr).toBeGreaterThanOrEqual(chosen.requiredEsN0Db);
    }
  });
});

/**
 * The measurement-versus-theory check.
 *
 * `runTransmission` counts bit errors over generated noise; `theoreticalAwgnBer`
 * evaluates the closed form. On a line-of-sight channel with a high Rician
 * K-factor the fading is mild enough that the two should agree closely. If they
 * ever diverge, either the simulator or the formula is wrong — and that is
 * exactly the kind of disagreement a learner is invited to look for.
 */
describe('measured BER against the closed form', () => {
  const almostAwgn = { ...CHANNEL_CONDITIONS[0]!, ricianKDb: 40, shadowingSigmaDb: 0 };

  for (const [modulation, snrDb, tolerance] of [
    [BPSK, 6, 0.35],
    [BPSK, 9, 0.5],
    [QPSK, 9, 0.35],
    [QAM16, 16, 0.35],
  ] as const) {
    it(`${modulation.name} at ${snrDb} dB`, () => {
      const measured = runTransmission(
        {
          modulation,
          averageSnrDb: snrDb,
          condition: almostAwgn,
          symbolsPerBlock: 200,
          blocks: 400,
        },
        makeRng(20260921),
      );
      const predicted = theoreticalAwgnBer(modulation, snrDb);
      // Compared as a ratio: these BERs span orders of magnitude, so an
      // absolute tolerance would be meaningless at one end or vacuous at the
      // other.
      const ratio = measured.ber / predicted;
      expect(ratio).toBeGreaterThan(1 - tolerance);
      expect(ratio).toBeLessThan(1 + tolerance);
    });
  }

  it('reports a BER that is always a probability', () => {
    for (const snrDb of [-10, 0, 10, 25]) {
      const result = runTransmission(
        {
          modulation: QPSK,
          averageSnrDb: snrDb,
          condition: CHANNEL_CONDITIONS[1]!,
          symbolsPerBlock: 64,
          blocks: 60,
        },
        makeRng(11 + snrDb),
      );
      expect(result.ber).toBeGreaterThanOrEqual(0);
      expect(result.ber).toBeLessThanOrEqual(0.75);
      expect(result.bler).toBeGreaterThanOrEqual(0);
      expect(result.bler).toBeLessThanOrEqual(1);
    }
  });

  it('shows Rayleigh fading is far worse than AWGN at the same average SNR', () => {
    const shared = { modulation: QPSK, symbolsPerBlock: 100, blocks: 400, averageSnrDb: 18 };
    const clean = runTransmission({ ...shared, condition: almostAwgn }, makeRng(5));
    const faded = runTransmission(
      { ...shared, condition: CHANNEL_CONDITIONS[1]! },
      makeRng(5),
    );
    expect(faded.ber).toBeGreaterThan(clean.ber * 50);
  });
});
