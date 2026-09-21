/**
 * Intelligent reflecting surface: y = (h_rᵀ Φ h_t) x + n.
 *
 * Spec §7 gives the equation; this file is the equation with the pieces it
 * needs to be more than a picture. Φ = diag(β₁e^{jθ₁} … β_N e^{jθ_N}) is the
 * only thing the surface controls — N phases and, on lossy hardware, an
 * amplitude β < 1 that comes with them. Everything the lab teaches about IRS is
 * a statement about what those N numbers can and cannot buy.
 *
 * The effective channel is
 *
 *   h_eff = h_d + Σ_n h_{r,n} β_n e^{jθ_n} h_{t,n}
 *
 * and the received SNR is |h_eff|²·P_tx / N₀. Written this way the two results
 * the module exists to show fall straight out of the arithmetic rather than
 * being asserted:
 *
 *   • Aligned phases make the N cascaded terms add *in amplitude*, so power
 *     grows as N² — 6 dB per doubling, not 3 (Wu & Zhang, IEEE TWC 2019).
 *   • Each cascaded term carries the path loss of *both* hops multiplied
 *     together, which is why that N² has so much ground to make up and why a
 *     small surface loses to an unblocked direct path.
 *
 * Random phases are the control: the same N terms added with random phases grow
 * as N, not N², and the gap between the two curves is the whole value of
 * "intelligent" in the name.
 */

import {
  type Complex,
  absSq,
  add,
  arg,
  complex,
  complexGaussian,
  mul,
  phasor,
  scale,
} from './complex';
import { freeSpacePathLossDb, fromDb, noisePowerDbm } from './channel';
import { type ChannelCondition, shadowingDb } from './signalModel';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export const distanceBetween = (a: Position, b: Position): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface IrsConfig {
  /** Reflecting elements. Laid out as the squarest planar array that fits. */
  elementCount: number;
  /** Per-element reflection amplitude β ∈ (0, 1]. 1 is lossless hardware. */
  reflectionCoefficient: number;
  /**
   * Bits of phase control per element. 0 means continuous phase, which no real
   * surface has; 1-bit and 2-bit surfaces are what actually gets built, and
   * the quantisation loss is a measurable 3.9 dB / 0.9 dB respectively.
   */
  phaseBits: number;
  transmitter: Position;
  surface: Position;
  receiver: Position;
}

export interface LinkConfig {
  txPowerDbm: number;
  frequencyHz: number;
  bandwidthHz: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  /** Per-element aperture gain of the surface, dBi. */
  elementGainDbi: number;
}

/** Everything the optimisers need to score a phase vector. */
export interface IrsChannels {
  /** Tx → IRS, one complex coefficient per element. */
  toSurface: Complex[];
  /** IRS → Rx, one complex coefficient per element. */
  fromSurface: Complex[];
  /** The direct Tx → Rx path, already carrying any blockage loss. */
  direct: Complex;
  /** Noise power, linear, in the same units as |h|²·P_tx. */
  noisePowerLinear: number;
  txPowerLinear: number;
  elementCount: number;
  reflectionCoefficient: number;
}

/** Linear power gain of a path: free-space loss plus whatever else it meets. */
function pathGainLinear(
  distanceM: number,
  frequencyHz: number,
  extraLossDb: number,
  gainsDbi: number,
): number {
  const lossDb = freeSpacePathLossDb(distanceM, frequencyHz) + extraLossDb - gainsDbi;
  return fromDb(-lossDb);
}

/**
 * Array response of a uniform planar array with λ/2 spacing.
 *
 * Without this every element would see the same phase and the surface would be
 * a mirror with N knobs that all want the same value — which is not the problem
 * the literature is about. The steering vector is what makes the optimal phase
 * configuration *depend on where the users are*, and therefore what makes it
 * worth optimising at all.
 */
function steeringVector(
  elementCount: number,
  azimuth: number,
  elevation: number,
): Complex[] {
  const cols = Math.max(1, Math.round(Math.sqrt(elementCount)));
  const rows = Math.max(1, Math.ceil(elementCount / cols));
  const response: Complex[] = [];
  for (let r = 0; r < rows && response.length < elementCount; r += 1) {
    for (let c = 0; c < cols && response.length < elementCount; c += 1) {
      // π per element = 2π·(λ/2)/λ, the standard half-wavelength spacing.
      const phase = Math.PI * (c * Math.sin(elevation) * Math.cos(azimuth) + r * Math.cos(elevation));
      response.push(phasor(phase));
    }
  }
  return response;
}

function anglesFrom(from: Position, to: Position): { azimuth: number; elevation: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horizontal = Math.hypot(dx, dy);
  return { azimuth: Math.atan2(dy, dx), elevation: Math.atan2(horizontal, dz || 1e-9) };
}

/**
 * Draws one realisation of the whole geometry.
 *
 * Each hop is Rician: a specular component along the geometric direction (the
 * steering vector) plus diffuse scattering. The surface hops are given a
 * stronger specular component than the direct path, because a surface is
 * deployed precisely where it has a clear view of both ends — that is the
 * deployment assumption the IRS literature makes, and it is stated here rather
 * than buried.
 */
export function generateIrsChannels(
  irs: IrsConfig,
  link: LinkConfig,
  condition: ChannelCondition,
  random: () => number,
): IrsChannels {
  const dTx = distanceBetween(irs.transmitter, irs.surface);
  const dRx = distanceBetween(irs.surface, irs.receiver);
  const dDirect = distanceBetween(irs.transmitter, irs.receiver);

  const surfaceKDb = 10; // The surface is sited for a clear view of both ends.
  const kSurface = fromDb(surfaceKDb);
  const specular = Math.sqrt(kSurface / (kSurface + 1));
  const diffuse = Math.sqrt(1 / (kSurface + 1));

  const txSteering = steeringVector(
    irs.elementCount,
    anglesFrom(irs.surface, irs.transmitter).azimuth,
    anglesFrom(irs.surface, irs.transmitter).elevation,
  );
  const rxSteering = steeringVector(
    irs.elementCount,
    anglesFrom(irs.surface, irs.receiver).azimuth,
    anglesFrom(irs.surface, irs.receiver).elevation,
  );

  /*
   * The direct path is drawn FIRST, before anything that depends on the element
   * count.
   *
   * All of these draws come off one PRNG stream, so whatever is generated first
   * is independent of how much is generated after it. When the direct path was
   * drawn last, changing N changed how many values had been consumed before it
   * and therefore changed the direct path too — which put visible noise on the
   * "direct" line of the element sweep, a line that by construction has nothing
   * to do with the surface. A learner reading that chart would have seen the
   * unblocked path wandering by several dB as they added reflecting elements.
   */
  const excessDb =
    (condition.pathLossExponent - 2) * 10 * Math.log10(Math.max(1, dDirect)) +
    condition.blockageDb +
    shadowingDb(condition.shadowingSigmaDb, random);
  const directAmplitude = Math.sqrt(
    pathGainLinear(dDirect, link.frequencyHz, excessDb, link.txGainDbi + link.rxGainDbi),
  );
  const directFading = complexGaussian(random);
  const kDirect = Number.isFinite(condition.ricianKDb) ? fromDb(condition.ricianKDb) : 0;
  const direct = scale(
    {
      re: Math.sqrt(kDirect / (kDirect + 1)) + Math.sqrt(1 / (kDirect + 1)) * directFading.re,
      im: Math.sqrt(1 / (kDirect + 1)) * directFading.im,
    },
    directAmplitude,
  );

  // Half the shadowing on each hop — they are different physical paths, so
  // giving them one shared draw would correlate them for no reason.
  const shadowTx = shadowingDb(condition.shadowingSigmaDb / Math.SQRT2, random);
  const shadowRx = shadowingDb(condition.shadowingSigmaDb / Math.SQRT2, random);

  const txAmplitude = Math.sqrt(
    pathGainLinear(dTx, link.frequencyHz, shadowTx, link.txGainDbi + link.elementGainDbi),
  );
  const rxAmplitude = Math.sqrt(
    pathGainLinear(dRx, link.frequencyHz, shadowRx, link.rxGainDbi + link.elementGainDbi),
  );

  const toSurface: Complex[] = [];
  const fromSurface: Complex[] = [];
  for (let n = 0; n < irs.elementCount; n += 1) {
    const gt = complexGaussian(random);
    const gr = complexGaussian(random);
    toSurface.push(
      scale(add(scale(txSteering[n] ?? complex(1), specular), scale(gt, diffuse)), txAmplitude),
    );
    fromSurface.push(
      scale(add(scale(rxSteering[n] ?? complex(1), specular), scale(gr, diffuse)), rxAmplitude),
    );
  }

  return {
    toSurface,
    fromSurface,
    direct,
    noisePowerLinear: fromDb(noisePowerDbm(link.bandwidthHz, link.noiseFigureDb)) / 1000,
    txPowerLinear: fromDb(link.txPowerDbm) / 1000,
    elementCount: irs.elementCount,
    reflectionCoefficient: irs.reflectionCoefficient,
  };
}

/** h_eff = h_d + Σ_n h_{r,n} β e^{jθ_n} h_{t,n}. */
export function effectiveChannel(channels: IrsChannels, phases: readonly number[]): Complex {
  let total = channels.direct;
  const beta = channels.reflectionCoefficient;
  for (let n = 0; n < channels.elementCount; n += 1) {
    const cascade = mul(channels.fromSurface[n]!, channels.toSurface[n]!);
    total = add(total, scale(mul(cascade, phasor(phases[n] ?? 0)), beta));
  }
  return total;
}

/** Received SNR in dB for a given phase configuration. Measured, not modelled. */
export function snrForPhases(channels: IrsChannels, phases: readonly number[]): number {
  const gain = absSq(effectiveChannel(channels, phases));
  const snr = (gain * channels.txPowerLinear) / channels.noisePowerLinear;
  return 10 * Math.log10(Math.max(snr, Number.MIN_VALUE));
}

/**
 * The optimum, in closed form.
 *
 * Every cascaded term should arrive pointing the same way as the direct path,
 * so θ_n = arg(h_d) − arg(h_{r,n}·h_{t,n}). This is available only because the
 * lab knows the channel exactly; a real controller has to estimate it, which is
 * the entire reason the search methods in `optimizers.ts` are interesting.
 *
 * Note the gauge: adding any constant to every θ_n rotates h_eff without
 * changing |h_eff|, so the phase vector is only determined up to a global
 * offset when there is no direct path to anchor it. That matters for anything
 * *learned* from these solutions — a network trained to regress absolute phases
 * against an unanchored target is being given contradictory labels for
 * identical inputs.
 */
export function closedFormPhases(channels: IrsChannels): number[] {
  const anchor = absSq(channels.direct) > 0 ? arg(channels.direct) : 0;
  const phases: number[] = [];
  for (let n = 0; n < channels.elementCount; n += 1) {
    phases.push(anchor - arg(mul(channels.fromSurface[n]!, channels.toSurface[n]!)));
  }
  return phases;
}

/** Wraps to (−π, π]. */
export const wrapPhase = (theta: number): number => {
  const wrapped = ((theta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return wrapped;
};

/**
 * Snaps each phase to the nearest value the hardware can actually set.
 *
 * A b-bit surface has 2^b settings. The resulting loss in array gain is
 * (2^b/π · sin(π/2^b))² — 3.9 dB for 1 bit, 0.9 dB for 2 — and the lab measures
 * it rather than quoting it.
 */
export function quantisePhases(phases: readonly number[], bits: number): number[] {
  if (bits <= 0) return phases.map(wrapPhase);
  const levels = 1 << bits;
  const step = (2 * Math.PI) / levels;
  return phases.map((theta) => wrapPhase(Math.round(wrapPhase(theta) / step) * step));
}

/** Theoretical array-gain loss from b-bit phase quantisation, in dB. */
export function quantisationLossDb(bits: number): number {
  if (bits <= 0) return 0;
  const levels = 1 << bits;
  const ratio = (levels / Math.PI) * Math.sin(Math.PI / levels);
  return -20 * Math.log10(ratio);
}

export const randomPhases = (count: number, random: () => number): number[] =>
  Array.from({ length: count }, () => (random() * 2 - 1) * Math.PI);
