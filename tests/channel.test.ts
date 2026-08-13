import { describe, expect, it } from 'vitest';

import {
  bitsToText,
  bpskBer,
  directLinkRxDbm,
  ebN0FromSnrDb,
  erfc,
  freeSpacePathLossDb,
  fromDb,
  irsLinkRxDbm,
  makeRng,
  noisePercentToEbN0Db,
  noisePowerDbm,
  qFunction,
  shannonCapacityBps,
  snrDb,
  textToBits,
  transmitBits,
  type LinkBudget,
} from '../lib/channel';

/**
 * These assert against published reference values, not against the
 * implementation's own output. That is the point: the simulators previously
 * displayed invented arithmetic, and the only way for a teaching tool to earn
 * back trust is for its numbers to be checkable.
 */

describe('erfc and Q', () => {
  it('matches known values of erfc', () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(0.5)).toBeCloseTo(0.4795001, 5);
    expect(erfc(1)).toBeCloseTo(0.1572992, 5);
    expect(erfc(2)).toBeCloseTo(0.0046777, 6);
  });

  it('is symmetric about x = 0: erfc(-x) = 2 - erfc(x)', () => {
    for (const x of [0.3, 1.1, 2.4]) {
      expect(erfc(-x)).toBeCloseTo(2 - erfc(x), 6);
    }
  });

  it('matches the standard normal tail', () => {
    expect(qFunction(0)).toBeCloseTo(0.5, 6);
    expect(qFunction(1)).toBeCloseTo(0.1586553, 5);
    expect(qFunction(1.96)).toBeCloseTo(0.0249979, 5);
    expect(qFunction(3)).toBeCloseTo(0.0013499, 6);
  });
});

describe('BPSK bit error rate', () => {
  /*
   * Reference points from the standard BPSK-over-AWGN waterfall,
   * BER = Q(sqrt(2 Eb/N0)).
   */
  it('matches textbook values', () => {
    expect(bpskBer(0)).toBeCloseTo(0.0786496, 5);
    expect(bpskBer(4)).toBeCloseTo(0.0125, 3);
    expect(bpskBer(7)).toBeCloseTo(7.727e-4, 5);
    expect(bpskBer(10)).toBeCloseTo(3.872e-6, 8);
  });

  it('never exceeds 1/2 — the defect this replaces reported 250%', () => {
    for (let db = -40; db <= 40; db += 0.5) {
      const ber = bpskBer(db);
      expect(ber).toBeGreaterThanOrEqual(0);
      expect(ber).toBeLessThanOrEqual(0.5);
    }
  });

  it('decreases monotonically as the link improves', () => {
    let previous = 1;
    for (let db = -10; db <= 15; db += 0.5) {
      const ber = bpskBer(db);
      expect(ber).toBeLessThanOrEqual(previous);
      previous = ber;
    }
  });

  it('maps the noise slider onto a sane span of the waterfall', () => {
    expect(noisePercentToEbN0Db(0)).toBeCloseTo(12, 6);
    expect(noisePercentToEbN0Db(100)).toBeCloseTo(-6, 6);
    // Clean link is essentially error free; the worst case is catastrophic for
    // text but is still a real BER, unlike the 250% the old model displayed.
    expect(bpskBer(noisePercentToEbN0Db(0))).toBeCloseTo(9.006e-9, 11);
    expect(bpskBer(noisePercentToEbN0Db(100))).toBeCloseTo(0.2397, 3);
    // At that BER, the chance a byte survives intact is (1-p)^8.
    expect((1 - 0.2397) ** 8).toBeLessThan(0.2);
  });
});

describe('free-space path loss', () => {
  /*
   * FSPL(dB) = 20log10(d_km) + 20log10(f_MHz) + 32.44.
   * At 1 km and 2400 MHz that is 0 + 67.6 + 32.44 = 100.05 dB.
   */
  it('matches the standard 32.44 formulation', () => {
    expect(freeSpacePathLossDb(1000, 2.4e9)).toBeCloseTo(100.05, 1);
    expect(freeSpacePathLossDb(100, 28e9)).toBeCloseTo(101.36, 1);
  });

  it('adds 6 dB per doubling of distance', () => {
    const a = freeSpacePathLossDb(50, 28e9);
    const b = freeSpacePathLossDb(100, 28e9);
    expect(b - a).toBeCloseTo(6.02, 1);
  });

  it('adds 6 dB per doubling of frequency — why 6G hurts', () => {
    const low = freeSpacePathLossDb(100, 3.5e9);
    const high = freeSpacePathLossDb(100, 7e9);
    expect(high - low).toBeCloseTo(6.02, 1);
  });
});

describe('noise floor', () => {
  it('gives -174 dBm/Hz thermal noise plus bandwidth and noise figure', () => {
    // 1 Hz, 0 dB NF
    expect(noisePowerDbm(1, 0)).toBeCloseTo(-173.98, 1);
    // 100 MHz, 7 dB NF => -174 + 80 + 7
    expect(noisePowerDbm(100e6, 7)).toBeCloseTo(-86.98, 1);
  });
});

describe('link budget', () => {
  const link: LinkBudget = {
    txPowerDbm: 20,
    frequencyHz: 28e9,
    bandwidthHz: 100e6,
    txGainDbi: 15,
    rxGainDbi: 10,
    noiseFigureDb: 7,
  };

  it('produces a physically sensible positive SNR for a short mmWave link', () => {
    const rx = directLinkRxDbm(link, 50);
    const snr = snrDb(rx, link);
    // A 50 m, 28 GHz link at 20 dBm with 25 dBi of combined antenna gain is a
    // good link; the old model reported -92.91 dB for exactly this regime.
    expect(snr).toBeGreaterThan(10);
    expect(snr).toBeLessThan(60);
  });

  it('loses 6 dB when distance doubles', () => {
    const a = snrDb(directLinkRxDbm(link, 50), link);
    const b = snrDb(directLinkRxDbm(link, 100), link);
    expect(a - b).toBeCloseTo(6.02, 1);
  });

  it('subtracts blockage directly', () => {
    const clear = directLinkRxDbm(link, 80, 0);
    const blocked = directLinkRxDbm(link, 80, 25);
    expect(clear - blocked).toBeCloseTo(25, 6);
  });
});

describe('IRS array gain', () => {
  const link: LinkBudget = {
    txPowerDbm: 20,
    frequencyHz: 28e9,
    bandwidthHz: 100e6,
    txGainDbi: 15,
    rxGainDbi: 10,
    noiseFigureDb: 7,
  };

  /*
   * The defining result: received power scales with N squared, so doubling the
   * element count buys 6 dB, not 3. The previous implementation used
   * 10*log10(N) and therefore understated a 256-element surface by 24 dB.
   */
  it('gains 6 dB per doubling of element count, not 3', () => {
    const n64 = irsLinkRxDbm(link, 25, 25, 64);
    const n128 = irsLinkRxDbm(link, 25, 25, 128);
    expect(n128 - n64).toBeCloseTo(6.02, 1);
  });

  it('gains 20*log10(N) over a single element', () => {
    const one = irsLinkRxDbm(link, 25, 25, 1);
    const n256 = irsLinkRxDbm(link, 25, 25, 256);
    expect(n256 - one).toBeCloseTo(20 * Math.log10(256), 4);
    expect(n256 - one).toBeCloseTo(48.16, 1);
  });

  it('pays free-space loss twice, so a small surface loses to a clear direct path', () => {
    const direct = directLinkRxDbm(link, 50, 0);
    const viaSmallIrs = irsLinkRxDbm(link, 25, 25, 4);
    expect(viaSmallIrs).toBeLessThan(direct);
  });

  it('beats a blocked direct path once the surface is large enough', () => {
    const blocked = directLinkRxDbm(link, 50, 40);
    const viaLargeIrs = irsLinkRxDbm(link, 25, 25, 256);
    expect(viaLargeIrs).toBeGreaterThan(blocked);
  });
});

describe('capacity', () => {
  it('matches Shannon for a known case', () => {
    // 1 Hz at 0 dB SNR (ratio 1) => log2(2) = 1 bit/s
    expect(shannonCapacityBps(1, 0)).toBeCloseTo(1, 6);
    // 100 MHz at 20 dB (ratio 100) => 100e6 * log2(101)
    expect(shannonCapacityBps(100e6, 20)).toBeCloseTo(100e6 * Math.log2(101), 0);
  });

  it('relates Eb/N0 to SNR at unit spectral efficiency', () => {
    expect(ebN0FromSnrDb(15, 1)).toBeCloseTo(15, 6);
    expect(ebN0FromSnrDb(15, 2)).toBeCloseTo(15 - 10 * Math.log10(2), 6);
  });
});

describe('dB helpers', () => {
  it('round-trips', () => {
    expect(fromDb(0)).toBeCloseTo(1, 9);
    expect(fromDb(10)).toBeCloseTo(10, 9);
    expect(fromDb(3)).toBeCloseTo(1.9953, 4);
  });
});

describe('bit transmission', () => {
  it('round-trips text through bits unchanged on a clean channel', () => {
    const text = 'AI can enhance 6G networks.';
    expect(bitsToText(textToBits(text))).toBe(text);
  });

  it('flips approximately the requested fraction of bits', () => {
    const bits = '0'.repeat(20000);
    const { flipped } = transmitBits(bits, 0.1, makeRng(12345));
    // 20000 bits at p=0.1: sd = sqrt(20000*0.1*0.9) ~ 42, so +/-250 is ~6 sd.
    expect(flipped).toBeGreaterThan(1750);
    expect(flipped).toBeLessThan(2250);
  });

  it('leaves the payload untouched at zero error rate', () => {
    const bits = textToBits('hello');
    expect(transmitBits(bits, 0, makeRng(1)).received).toBe(bits);
  });

  it('is reproducible for a fixed seed', () => {
    const bits = textToBits('reproducible');
    const a = transmitBits(bits, 0.2, makeRng(7)).received;
    const b = transmitBits(bits, 0.2, makeRng(7)).received;
    const c = transmitBits(bits, 0.2, makeRng(8)).received;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
