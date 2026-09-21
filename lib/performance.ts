/**
 * The four numbers §6 asks for besides BER: throughput, latency, energy
 * efficiency and signal quality.
 *
 * Every one of them is a place where a teaching app can quietly invent a
 * plausible-looking curve, so each is written here as an explicit formula with
 * its assumptions named in the surrounding comment and its parameters exported
 * as data the UI can display. If a learner disagrees with a number, the
 * argument should be about an assumption they can see — the power-amplifier
 * efficiency, the HARQ limit — not about arithmetic they cannot.
 */

import { fromDb, shannonCapacityBps } from './channel';
import { type Modulation, selectModulation } from './modulation';

/**
 * Slot durations for the 5G NR numerologies 6G is expected to extend.
 *
 * Slot = 1 ms / 2^μ. Wider subcarriers mean shorter slots, which is the whole
 * mechanism behind low-latency operation at high carrier frequencies — and it
 * is why the frequency band a learner picks changes the latency, rather than
 * only the path loss.
 */
export const NUMEROLOGIES = [
  { mu: 0, subcarrierSpacingKHz: 15, slotMs: 1 },
  { mu: 1, subcarrierSpacingKHz: 30, slotMs: 0.5 },
  { mu: 2, subcarrierSpacingKHz: 60, slotMs: 0.25 },
  { mu: 3, subcarrierSpacingKHz: 120, slotMs: 0.125 },
  { mu: 5, subcarrierSpacingKHz: 480, slotMs: 0.03125 },
  { mu: 6, subcarrierSpacingKHz: 960, slotMs: 0.015625 },
] as const;

/** The numerology a band would realistically use. */
export function numerologyForBand(frequencyHz: number) {
  if (frequencyHz >= 100e9) return NUMEROLOGIES[5]!;
  if (frequencyHz >= 52.6e9) return NUMEROLOGIES[4]!;
  if (frequencyHz >= 24e9) return NUMEROLOGIES[3]!;
  if (frequencyHz >= 6e9) return NUMEROLOGIES[2]!;
  return NUMEROLOGIES[1]!;
}

/**
 * Physical-layer overhead: reference signals, control, guard. 14% is the
 * commonly quoted figure for an NR downlink and is applied as a flat factor
 * here rather than modelled resource-element by resource-element.
 */
export const PHY_OVERHEAD = 0.14;

/** The coding rate the link-adaptation table assumes for each modulation. */
export const CODE_RATE = 0.75;

export interface ThroughputResult {
  /** Shannon bound for the allocated bandwidth, bit/s. */
  capacityBps: number;
  /** Rate of the selected modulation and coding scheme before errors, bit/s. */
  rawRateBps: number;
  /** Rate after block errors and overhead — what an application receives. */
  goodputBps: number;
  modulation: Modulation | null;
  spectralEfficiency: number;
  /** True when even BPSK cannot meet its threshold at this SNR. */
  outage: boolean;
}

export function computeThroughput(
  bandwidthHz: number,
  snrDb: number,
  blockErrorRate: number,
): ThroughputResult {
  const capacityBps = shannonCapacityBps(bandwidthHz, snrDb);
  const modulation = selectModulation(snrDb);

  if (!modulation) {
    return {
      capacityBps,
      rawRateBps: 0,
      goodputBps: 0,
      modulation: null,
      spectralEfficiency: 0,
      outage: true,
    };
  }

  const spectralEfficiency = modulation.bitsPerSymbol * CODE_RATE * (1 - PHY_OVERHEAD);
  const rawRateBps = bandwidthHz * spectralEfficiency;
  const goodputBps = rawRateBps * Math.max(0, 1 - blockErrorRate);

  return {
    capacityBps,
    rawRateBps,
    goodputBps,
    modulation,
    spectralEfficiency,
    outage: false,
  };
}

export interface LatencyBudget {
  /** Frame alignment: on average half a slot before the grant can be used. */
  alignmentMs: number;
  /** Time on air for the packet at the achieved rate. */
  transmissionMs: number;
  /** Distance / c. Small on a radio link, and shown so it stays in proportion. */
  propagationMs: number;
  /** Encode, decode and scheduling at both ends. */
  processingMs: number;
  /** Expected cost of HARQ retransmissions given the block error rate. */
  retransmissionMs: number;
  totalMs: number;
  expectedTransmissions: number;
  /** True when the packet exhausts its HARQ attempts and is dropped. */
  residualLossProbability: number;
}

export const SPEED_OF_LIGHT = 299_792_458;

/**
 * One-way user-plane latency for a single packet.
 *
 * HARQ is where the interesting behaviour lives: a link whose block error rate
 * is 10% does not lose 10% of its packets, it delays them by a round trip. The
 * expected number of transmissions for a packet allowed K attempts at block
 * error rate p is
 *
 *   E[N] = (1 − p^K)/(1 − p)
 *
 * and the packet is dropped with probability p^K. Both are reported, because a
 * latency figure that hides the drop rate is the kind of number that makes a
 * design look better than it is.
 */
export function computeLatency(params: {
  packetBits: number;
  goodputBps: number;
  distanceM: number;
  slotMs: number;
  blockErrorRate: number;
  maxHarqAttempts?: number;
  processingMs?: number;
}): LatencyBudget {
  const maxAttempts = params.maxHarqAttempts ?? 4;
  const processingMs = params.processingMs ?? 0.2;
  const p = Math.min(0.999, Math.max(0, params.blockErrorRate));

  const alignmentMs = params.slotMs / 2;
  const transmissionMs =
    params.goodputBps > 0
      ? Math.max(params.slotMs, Math.ceil((params.packetBits / params.goodputBps) * 1000 / params.slotMs) * params.slotMs)
      : Number.POSITIVE_INFINITY;
  const propagationMs = (params.distanceM / SPEED_OF_LIGHT) * 1000;

  const expectedTransmissions = p === 0 ? 1 : (1 - p ** maxAttempts) / (1 - p);
  // Each retransmission costs a full HARQ round trip: the failed attempt, the
  // feedback, and the scheduling delay before the repeat.
  const harqRoundTripMs = params.slotMs * 4 + processingMs;
  const retransmissionMs = (expectedTransmissions - 1) * harqRoundTripMs;

  const totalMs = Number.isFinite(transmissionMs)
    ? alignmentMs + transmissionMs + propagationMs + processingMs + retransmissionMs
    : Number.POSITIVE_INFINITY;

  return {
    alignmentMs,
    transmissionMs,
    propagationMs,
    processingMs,
    retransmissionMs,
    totalMs,
    expectedTransmissions,
    residualLossProbability: p ** maxAttempts,
  };
}

/**
 * Power consumption parameters.
 *
 * The structure — transmit power divided by amplifier efficiency, plus fixed
 * circuit power, plus a per-element cost for the surface — follows Huang et
 * al., "Reconfigurable Intelligent Surfaces for Energy Efficiency in Wireless
 * Communication" (IEEE TWC, 2019). The per-element figures there are for
 * PIN-diode surfaces and scale with the number of control bits, which is why a
 * finer surface is not free.
 */
export const POWER_MODEL = {
  /** Power-amplifier efficiency. 35% is typical for a linear PA at mmWave. */
  amplifierEfficiency: 0.35,
  /** Base-station baseband, cooling and RF chain, watts. */
  basebandW: 9,
  /** Per served user equipment, watts. */
  perUserW: 0.12,
  /** Per-element control power in watts, by phase-control resolution. */
  elementW: (phaseBits: number): number =>
    phaseBits <= 0 ? 0.01 : (1.5 + 1.5 * phaseBits) / 1000,
} as const;

export interface EnergyResult {
  transmitW: number;
  circuitW: number;
  surfaceW: number;
  totalW: number;
  /** Bits per joule — the standard energy-efficiency figure of merit. */
  bitsPerJoule: number;
  /** Megabits per joule, which is the readable unit at these rates. */
  megabitsPerJoule: number;
}

export function computeEnergy(params: {
  txPowerDbm: number;
  users: number;
  irsElements: number;
  phaseBits: number;
  goodputBps: number;
}): EnergyResult {
  const txWatts = fromDb(params.txPowerDbm) / 1000;
  const transmitW = txWatts / POWER_MODEL.amplifierEfficiency;
  const circuitW = POWER_MODEL.basebandW + POWER_MODEL.perUserW * Math.max(1, params.users);
  const surfaceW = params.irsElements * POWER_MODEL.elementW(params.phaseBits);
  const totalW = transmitW + circuitW + surfaceW;
  const bitsPerJoule = totalW > 0 ? params.goodputBps / totalW : 0;

  return {
    transmitW,
    circuitW,
    surfaceW,
    totalW,
    bitsPerJoule,
    megabitsPerJoule: bitsPerJoule / 1e6,
  };
}

export type SignalGrade = 'excellent' | 'good' | 'marginal' | 'outage';

export interface SignalQuality {
  snrDb: number;
  evmPercent: number;
  grade: SignalGrade;
  /** The modulation the link can sustain, or null in outage. */
  sustainable: Modulation | null;
  note: string;
}

/**
 * A qualitative grade, with the thresholds stated rather than implied.
 *
 * The bands are the modulation thresholds themselves, so the grade never
 * disagrees with the modulation the link-adaptation logic chose — a mismatch
 * between a green "Excellent" badge and a link running BPSK is exactly the sort
 * of decorative status readout that makes the rest of the numbers suspect.
 */
export function gradeSignal(snrDb: number, evm: number): SignalQuality {
  const sustainable = selectModulation(snrDb);
  const evmPercent = evm * 100;

  let grade: SignalGrade;
  let note: string;
  if (!sustainable) {
    grade = 'outage';
    // The EVM figure is real but useless here: zero-forcing equalisation
    // divides by the channel, so a deep fade produces an arbitrarily large
    // error vector. Reporting "294%" as a quality metric without saying that
    // invites a learner to treat it as a comparable number.
    note =
      'Below the BPSK threshold — the link cannot be closed at any modulation in the table. The error vector magnitude is not meaningful in outage: the equaliser is dividing by deep fades, so it can exceed 100% without bound.';
  } else if (sustainable.name === '64-QAM') {
    grade = 'excellent';
    note = 'Clears the 64-QAM threshold, so the link runs at the highest rate in the table.';
  } else if (sustainable.name === '16-QAM') {
    grade = 'good';
    note = 'Supports 16-QAM. Another 6 dB would unlock 64-QAM and half again the rate.';
  } else {
    grade = 'marginal';
    note = `Only ${sustainable.name} is sustainable. The link closes, but with little margin.`;
  }

  return { snrDb, evmPercent, grade, sustainable, note };
}

/** Formats a bit rate with the unit a reader expects at that magnitude. */
export function formatRate(bitsPerSecond: number): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return '0 bit/s';
  if (bitsPerSecond >= 1e9) return `${(bitsPerSecond / 1e9).toFixed(2)} Gbit/s`;
  if (bitsPerSecond >= 1e6) return `${(bitsPerSecond / 1e6).toFixed(2)} Mbit/s`;
  if (bitsPerSecond >= 1e3) return `${(bitsPerSecond / 1e3).toFixed(2)} kbit/s`;
  return `${bitsPerSecond.toFixed(0)} bit/s`;
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  return `${ms.toFixed(2)} ms`;
}
