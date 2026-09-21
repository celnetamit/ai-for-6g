/**
 * The separation-based baseline: transform coding, then channel coding.
 *
 * This is the scheme DeepJSCC is measured against, and it has to be implemented
 * properly or the comparison is worthless. Shannon's separation theorem says
 * compressing and protecting independently loses nothing — *in the limit of
 * infinite block length*. A 16×16 scene at a bandwidth ratio of 1/8 is about as
 * far from that limit as it is possible to get, and the gap is precisely what
 * the module exists to show.
 *
 * The pipeline is the classical one:
 *
 *   DCT  →  keep the largest coefficients in zig-zag order  →  quantise
 *        →  channel-code at rate R  →  modulate  →  channel  →  decode
 *
 * Two choices are deliberately generous to this baseline, because the honest
 * way to show that a scheme loses is to give it the benefit of every doubt:
 *
 *   • the error-correcting code is modelled at the Singleton bound, correcting
 *     ⌊n(1−R)/2⌋ symbol errors. No real code reaches that; an LDPC code of this
 *     length is typically 1–2 dB short.
 *   • link adaptation picks the highest modulation the SNR supports, so the
 *     baseline always uses the most bits the channel will carry.
 *
 * What it cannot escape is the cliff: when the code runs out of correction
 * capability the receiver has nothing, and the reconstruction goes from good to
 * absent between one decibel and the next.
 */

import { IMAGE_SIZE, IMAGE_PIXELS } from './sources';
import { type Modulation, bitErrors, detect } from './modulation';
import { complexGaussian } from './complex';

// ------------------------------------------------------------------- the DCT

const COS_TABLE = (() => {
  const table = new Float64Array(IMAGE_SIZE * IMAGE_SIZE);
  for (let u = 0; u < IMAGE_SIZE; u += 1) {
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      table[u * IMAGE_SIZE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * IMAGE_SIZE));
    }
  }
  return table;
})();

const alpha = (u: number): number => (u === 0 ? Math.sqrt(1 / IMAGE_SIZE) : Math.sqrt(2 / IMAGE_SIZE));

/** Separable 2-D DCT-II over the whole 16×16 block. */
export function dct2(image: Float64Array): Float64Array {
  const rows = new Float64Array(IMAGE_PIXELS);
  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    for (let u = 0; u < IMAGE_SIZE; u += 1) {
      let sum = 0;
      for (let x = 0; x < IMAGE_SIZE; x += 1) {
        sum += image[y * IMAGE_SIZE + x]! * COS_TABLE[u * IMAGE_SIZE + x]!;
      }
      rows[y * IMAGE_SIZE + u] = alpha(u) * sum;
    }
  }
  const out = new Float64Array(IMAGE_PIXELS);
  for (let u = 0; u < IMAGE_SIZE; u += 1) {
    for (let v = 0; v < IMAGE_SIZE; v += 1) {
      let sum = 0;
      for (let y = 0; y < IMAGE_SIZE; y += 1) {
        sum += rows[y * IMAGE_SIZE + u]! * COS_TABLE[v * IMAGE_SIZE + y]!;
      }
      out[v * IMAGE_SIZE + u] = alpha(v) * sum;
    }
  }
  return out;
}

export function idct2(coefficients: Float64Array): Float64Array {
  const rows = new Float64Array(IMAGE_PIXELS);
  for (let u = 0; u < IMAGE_SIZE; u += 1) {
    for (let y = 0; y < IMAGE_SIZE; y += 1) {
      let sum = 0;
      for (let v = 0; v < IMAGE_SIZE; v += 1) {
        sum += alpha(v) * coefficients[v * IMAGE_SIZE + u]! * COS_TABLE[v * IMAGE_SIZE + y]!;
      }
      rows[y * IMAGE_SIZE + u] = sum;
    }
  }
  const out = new Float64Array(IMAGE_PIXELS);
  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      let sum = 0;
      for (let u = 0; u < IMAGE_SIZE; u += 1) {
        sum += alpha(u) * rows[y * IMAGE_SIZE + u]! * COS_TABLE[u * IMAGE_SIZE + x]!;
      }
      out[y * IMAGE_SIZE + x] = sum;
    }
  }
  return out;
}

/** Zig-zag ordering — low spatial frequencies first, as JPEG scans them. */
export const ZIGZAG = (() => {
  const order: number[] = [];
  for (let sum = 0; sum <= 2 * (IMAGE_SIZE - 1); sum += 1) {
    for (let y = 0; y <= sum; y += 1) {
      const x = sum - y;
      if (x >= IMAGE_SIZE || y >= IMAGE_SIZE) continue;
      // Alternate direction each diagonal, which is what makes it a zig-zag
      // rather than a staircase; the ordering by frequency is the same either
      // way, but this is the convention a learner will recognise.
      order.push(sum % 2 === 0 ? y * IMAGE_SIZE + x : x * IMAGE_SIZE + y);
    }
  }
  return order;
})();

export interface ClassicalResult {
  /** The reconstruction, or a flat mid-grey when the block was lost. */
  image: Float64Array;
  /** Total bits the source coder produced, including the scale header. */
  sourceBits: number;
  coefficientsKept: number;
  bitsPerCoefficient: number;
  /** Raw channel bit errors before decoding. */
  rawBitErrors: number;
  /** How many the code could have fixed. */
  correctionCapacity: number;
  /** True when the decoder failed and the receiver has nothing. */
  blockLost: boolean;
  modulation: Modulation;
}

export interface ClassicalConfig {
  modulation: Modulation;
  /** Complex channel uses available — the same budget DeepJSCC gets. */
  channelUses: number;
  /** Channel code rate. */
  codeRate: number;
  /** Per-symbol SNR in dB after equalisation. */
  snrDb: number;
  /**
   * 0 spends bits evenly across the kept coefficients; 1 concentrates them on
   * the low frequencies that carry the structure. This is unequal error
   * protection, and it is the classical answer to "semantic importance".
   */
  importance: number;
}

const HEADER_BITS = 16; // Two 8-bit scales: DC and AC.

/**
 * Runs one image through the separation pipeline and reports what arrived.
 *
 * The bit budget is derived from the same channel resources DeepJSCC is given:
 * `channelUses` complex symbols at `bitsPerSymbol` each, times the code rate.
 */
export function transmitClassical(
  image: Float64Array,
  config: ClassicalConfig,
  random: () => number,
): ClassicalResult {
  const channelBits = config.channelUses * config.modulation.bitsPerSymbol;
  const payloadBits = Math.max(0, Math.floor(channelBits * config.codeRate) - HEADER_BITS);

  // Bit allocation. With importance at 0 every kept coefficient gets the same
  // number of bits; at 1 the first quarter get twice as many, which is coarse
  // but is genuinely how unequal error protection is done.
  const baseBits = 6;
  const bitsPerCoefficient = Math.max(3, Math.round(baseBits - config.importance * 2));
  const coefficientsKept = Math.max(1, Math.floor(payloadBits / bitsPerCoefficient));

  const coefficients = dct2(image);
  const kept = ZIGZAG.slice(0, Math.min(coefficientsKept, ZIGZAG.length));

  // One scale for DC, one for the AC coefficients: DC is an order of magnitude
  // larger and sharing a scale with it would quantise every AC term to zero.
  const dcValue = coefficients[0] ?? 0;
  let acPeak = 1e-6;
  for (let i = 1; i < kept.length; i += 1) acPeak = Math.max(acPeak, Math.abs(coefficients[kept[i]!]!));

  const bits: number[] = [];
  const quantised: number[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const index = kept[i]!;
    const isDc = index === 0;
    const scale = isDc ? Math.max(Math.abs(dcValue), 1e-6) : acPeak;
    // Importance buys precision on the leading quarter of the scan.
    const width =
      config.importance > 0 && i < kept.length / 4
        ? bitsPerCoefficient + Math.round(config.importance * 2)
        : bitsPerCoefficient;
    const levels = (1 << width) - 1;
    const normalised = Math.max(-1, Math.min(1, coefficients[index]! / scale));
    const level = Math.round(((normalised + 1) / 2) * levels);
    quantised.push(level);
    for (let b = width - 1; b >= 0; b -= 1) bits.push((level >> b) & 1);
  }

  /*
   * Modulate the WHOLE codeword, not just the payload.
   *
   * The correction capacity below is ⌊n(1−R)/2⌋ over a codeword of n =
   * `channelBits` bits, but only the `bits.length` payload bits were being
   * pushed through the channel and charged for errors. The decoder was
   * therefore given capacity to repair parity bits that were never exposed to
   * any noise — at rate 0.75 that is a quarter of the codeword corrected for
   * free, which flattered the baseline by a wide margin at exactly the SNRs
   * where the comparison is interesting.
   *
   * The parity bits carry no information here, so they are filled
   * deterministically; what matters is that they occupy channel uses and take
   * their share of the errors.
   */
  const codeword: number[] = bits.slice(0, channelBits);
  for (let i = codeword.length; i < channelBits; i += 1) {
    // A fixed alternating fill: parity content is irrelevant to the error
    // count, and a random fill would consume PRNG draws and make the payload's
    // channel realisation depend on the code rate.
    codeword.push(i % 2);
  }

  const amplitude = Math.sqrt(10 ** (config.snrDb / 10));
  const bitsPerSymbol = config.modulation.bitsPerSymbol;
  let rawErrors = 0;

  for (let i = 0; i < codeword.length; i += bitsPerSymbol) {
    let index = 0;
    for (let b = 0; b < bitsPerSymbol; b += 1) index = (index << 1) | (codeword[i + b] ?? 0);
    const point = config.modulation.points[index]!;
    const noise = complexGaussian(random);
    const received = {
      re: point.re * amplitude + noise.re,
      im: point.im * amplitude + noise.im,
    };
    const decided = detect({ re: received.re / amplitude, im: received.im / amplitude }, config.modulation);
    rawErrors += bitErrors(index, decided, bitsPerSymbol);
  }

  // Idealised MDS code: corrects up to ⌊n(1−R)/2⌋ errors anywhere in the
  // codeword. No real code reaches this bound; it is deliberately generous.
  const correctionCapacity = Math.floor((channelBits * (1 - config.codeRate)) / 2);
  const blockLost = rawErrors > correctionCapacity;

  let reconstructed: Float64Array;
  if (blockLost) {
    // Nothing usable arrived. A real receiver would conceal with the previous
    // frame; with no previous frame the honest output is flat grey, and the
    // metrics should show exactly how bad that is.
    reconstructed = new Float64Array(IMAGE_PIXELS).fill(0.5);
  } else {
    const recovered = new Float64Array(IMAGE_PIXELS);
    for (let i = 0; i < kept.length; i += 1) {
      const index = kept[i]!;
      const isDc = index === 0;
      const scale = isDc ? Math.max(Math.abs(dcValue), 1e-6) : acPeak;
      const width =
        config.importance > 0 && i < kept.length / 4
          ? bitsPerCoefficient + Math.round(config.importance * 2)
          : bitsPerCoefficient;
      const levels = (1 << width) - 1;
      const normalised = (quantised[i]! / levels) * 2 - 1;
      recovered[index] = normalised * scale;
    }
    reconstructed = idct2(recovered);
    for (let i = 0; i < reconstructed.length; i += 1) {
      reconstructed[i] = Math.min(1, Math.max(0, reconstructed[i]!));
    }
  }

  return {
    image: reconstructed,
    sourceBits: bits.length + HEADER_BITS,
    coefficientsKept: kept.length,
    bitsPerCoefficient,
    rawBitErrors: rawErrors,
    correctionCapacity,
    blockLost,
    modulation: config.modulation,
  };
}
