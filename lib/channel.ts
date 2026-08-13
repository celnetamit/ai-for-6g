/**
 * Wireless channel and link-budget mathematics.
 *
 * Every simulator on the Tools page previously invented its own arithmetic, and
 * each invention was wrong in a way a student could be marked down for
 * repeating:
 *
 *   - `bitErrorRate = noiseLevel * 2.5` — displayed "Bit Error Rate: 250.0%".
 *     A BER is a probability; it cannot exceed 1. Above 0.5 the receiver should
 *     simply invert every decision and get the complement.
 *   - `snr = 10*log10(power / distance²) - 90`, with `power` read straight from
 *     a slider labelled **dBm**. Taking the logarithm of a quantity that is
 *     already logarithmic is a unit error, and the bare `-90` was a noise floor
 *     with no derivation. It produced −92.91 dB for a link that should be
 *     comfortably positive.
 *   - IRS array gain as `10*log10(N)`. The defining result of the reconfigurable
 *     intelligent surface literature is that received power scales with **N²**,
 *     because the N reflected amplitudes add coherently — so the gain is
 *     `20*log10(N)` (Wu & Zhang, IEEE TWC 2019, arXiv:1810.03961). Using N
 *     understates a 256-element surface by 24 dB, and it is the single number
 *     the module exists to teach.
 *
 * The functions here are the textbook ones, with units stated in every
 * signature. They are pure and unit-tested so the numbers on screen can be
 * checked against a reference rather than trusted.
 */

/** Speed of light, m/s. */
const C = 299_792_458;

/** Thermal noise power spectral density at 290 K, in dBm/Hz: 10·log10(kT·1000). */
export const THERMAL_NOISE_DBM_PER_HZ = -173.98;

// ---------------------------------------------------------------- conversions

export const dbmToWatts = (dbm: number): number => 10 ** (dbm / 10) / 1000;
export const wattsToDbm = (watts: number): number => 10 * Math.log10(watts * 1000);
/** Power ratio → dB. */
export const toDb = (ratio: number): number => 10 * Math.log10(ratio);
export const fromDb = (db: number): number => 10 ** (db / 10);

// ------------------------------------------------------------------ Q and BER

/**
 * Complementary error function.
 *
 * Numerical Recipes' `erfcc` rational-Chebyshev approximation; fractional error
 * everywhere less than 1.2e-7, which is far finer than anything displayed here.
 * Implemented rather than imported to keep the bundle free of a maths library
 * for one function.
 */
export function erfc(x: number): number {
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

/** Gaussian tail probability, Q(x) = P(Z > x) for standard normal Z. */
export const qFunction = (x: number): number => 0.5 * erfc(x / Math.SQRT2);

/**
 * Bit error rate for coherent BPSK over an AWGN channel.
 *
 *   BER = Q(√(2·Eb/N0))
 *
 * `ebN0Db` is Eb/N0 in dB. At 0 dB this gives 0.0786; at 10 dB, 3.87e-6 — the
 * textbook waterfall curve. It is bounded by 0.5, which is what the old
 * `noise * 2.5` formula could not express.
 */
export function bpskBer(ebN0Db: number): number {
  return qFunction(Math.sqrt(2 * fromDb(ebN0Db)));
}

/**
 * Maps a 0-100 "channel noise" slider onto a plausible Eb/N0 in dB.
 *
 * The sliders are the app's existing interface and are worth keeping — a
 * learner should not need to know what Eb/N0 is to move one. But the slider
 * must drive a real quantity rather than *be* one. 0% maps to a clean 12 dB
 * link and 100% to −6 dB, which spans the interesting part of the BPSK
 * waterfall: BER 9.0e-9 at one end and 0.240 at the other. At the bad end
 * roughly four bytes in five carry at least one error, which is the visible
 * catastrophe the demonstration needs, while remaining a real BER.
 */
export function noisePercentToEbN0Db(noisePercent: number): number {
  const clamped = Math.min(100, Math.max(0, noisePercent));
  return 12 - (clamped / 100) * 18;
}

// --------------------------------------------------------------- link budget

/**
 * Free-space path loss in dB.
 *
 *   FSPL = 20·log10(4πd/λ),  λ = c/f
 *
 * Frequency is a parameter because this is a *6G* lab: the move to mmWave and
 * sub-THz carriers is the reason path loss dominates the design, and a model
 * with no frequency term cannot show that. The previous version had none.
 */
export function freeSpacePathLossDb(distanceM: number, frequencyHz: number): number {
  if (distanceM <= 0 || frequencyHz <= 0) return 0;
  const wavelength = C / frequencyHz;
  return 20 * Math.log10((4 * Math.PI * distanceM) / wavelength);
}

/** Thermal noise power in dBm for a given bandwidth and receiver noise figure. */
export function noisePowerDbm(bandwidthHz: number, noiseFigureDb = 7): number {
  if (bandwidthHz <= 0) return Number.NEGATIVE_INFINITY;
  return THERMAL_NOISE_DBM_PER_HZ + 10 * Math.log10(bandwidthHz) + noiseFigureDb;
}

export interface LinkBudget {
  /** Transmit power at the antenna port. */
  txPowerDbm: number;
  frequencyHz: number;
  bandwidthHz: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
}

/** Received power in dBm over a direct line-of-sight path, with optional blockage. */
export function directLinkRxDbm(link: LinkBudget, distanceM: number, blockageDb = 0): number {
  return (
    link.txPowerDbm +
    link.txGainDbi +
    link.rxGainDbi -
    freeSpacePathLossDb(distanceM, link.frequencyHz) -
    blockageDb
  );
}

/**
 * Received power in dBm through an N-element reconfigurable intelligent surface.
 *
 * The surface is passive, so the signal pays free-space loss **twice** — once
 * to the surface and once onward to the receiver — and those losses multiply
 * rather than add. That is why an IRS is not free gain, and why the crossover
 * against a direct path is the interesting part of the module.
 *
 * Against that, coherent phase alignment across N elements makes the received
 * amplitude proportional to N and the power to N², giving `20·log10(N)` dB.
 * Each element also has its own aperture gain.
 *
 * Together:
 *   Prx = Pt + Gt + Gr + 20·log10(N) + Gelem − FSPL(d1) − FSPL(d2)
 */
export function irsLinkRxDbm(
  link: LinkBudget,
  txToIrsM: number,
  irsToRxM: number,
  elementCount: number,
  elementGainDbi = 3,
): number {
  const n = Math.max(1, elementCount);
  return (
    link.txPowerDbm +
    link.txGainDbi +
    link.rxGainDbi +
    20 * Math.log10(n) +
    elementGainDbi -
    freeSpacePathLossDb(txToIrsM, link.frequencyHz) -
    freeSpacePathLossDb(irsToRxM, link.frequencyHz)
  );
}

/** SNR in dB from a received power and the receiver's noise floor. */
export function snrDb(rxPowerDbm: number, link: LinkBudget): number {
  return rxPowerDbm - noisePowerDbm(link.bandwidthHz, link.noiseFigureDb);
}

/**
 * Shannon capacity in bits/second.
 *
 * Included so the SNR figure connects to something a learner cares about: an
 * SNR in dB is abstract, a throughput in Gbit/s is not.
 */
export function shannonCapacityBps(bandwidthHz: number, snrDbValue: number): number {
  return bandwidthHz * Math.log2(1 + fromDb(snrDbValue));
}

/**
 * Eb/N0 implied by an SNR and a spectral efficiency.
 *
 *   Eb/N0 = SNR · B / R,  and for BPSK at 1 bit/symbol with R = B, Eb/N0 = SNR.
 */
export function ebN0FromSnrDb(snrDbValue: number, spectralEfficiency = 1): number {
  return snrDbValue - 10 * Math.log10(spectralEfficiency);
}

// -------------------------------------------------------------- transmission

/** A deterministic PRNG so a given noise setting reproduces the same channel. */
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

/** Flips each bit independently with probability `ber`. Returns flipped count too. */
export function transmitBits(
  bits: string,
  ber: number,
  random: () => number,
): { received: string; flipped: number } {
  let flipped = 0;
  let received = '';
  for (const bit of bits) {
    if (random() < ber) {
      flipped += 1;
      received += bit === '0' ? '1' : '0';
    } else {
      received += bit;
    }
  }
  return { received, flipped };
}

export const textToBits = (text: string): string =>
  Array.from(text)
    .map((ch) => (ch.codePointAt(0)! & 0xff).toString(2).padStart(8, '0'))
    .join('');

export const bitsToText = (bits: string): string => {
  let text = '';
  // `slice`, not the deprecated `substr`.
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    text += String.fromCharCode(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return text;
};
