/**
 * Parameter-optimisation advice, computed rather than opined.
 *
 * Spec §8 asks the assistant to "suggest parameter optimization". A language
 * model can produce a fluent suggestion without evaluating anything, and the
 * suggestion will often be right — which is worse than it being wrong, because
 * it trains a learner to accept unverified advice about a system they can
 * simply measure.
 *
 * So the suggestions come from here instead: each candidate change is applied
 * to the configuration, the link is recomputed, and the resulting change in SNR
 * and achievable rate is reported. The Copilot is then given these computed
 * deltas to write about. It explains the ranking; it does not invent it.
 *
 * Only the link calculation is re-run, not the Monte Carlo transmission — this
 * has to be fast enough to run on every result without the page stalling, and
 * SNR is what every candidate actually moves.
 */

import { type ExperimentConfig } from './experiment';
import {
  closedFormPhases,
  generateIrsChannels,
  quantisePhases,
  snrForPhases,
  type IrsConfig,
  type LinkConfig,
} from './irs';
import { conditionById } from './signalModel';
import { makeRng, shannonCapacityBps } from './channel';
import { absSq } from './complex';
import { selectModulation } from './modulation';

export interface Suggestion {
  /** What to change, in the learner's language. */
  change: string;
  /** Why this is the lever it is, in one sentence of physics. */
  reason: string;
  deltaSnrDb: number;
  deltaRateBps: number;
  /** Whether the change costs something a designer would have to justify. */
  cost: string;
  apply: (config: ExperimentConfig) => ExperimentConfig;
}

function evaluateLink(config: ExperimentConfig): { snrDb: number; rateBps: number } {
  const d = config.communication.distanceM;
  const users = Math.max(1, config.communication.users);
  const perUserBandwidth = config.communication.bandwidthHz / users;

  const irs: IrsConfig = {
    elementCount: config.irs.elementCount,
    reflectionCoefficient: config.irs.reflectionCoefficient,
    phaseBits: config.irs.phaseBits,
    transmitter: { x: 0, y: 0, z: 10 },
    surface: { x: d / 2, y: config.irs.surfaceOffsetM, z: config.irs.surfaceHeightM },
    receiver: { x: d, y: 0, z: 1.5 },
  };
  const link: LinkConfig = {
    txPowerDbm: config.communication.txPowerDbm,
    frequencyHz: config.communication.frequencyHz,
    bandwidthHz: perUserBandwidth,
    txGainDbi: 15,
    rxGainDbi: 10,
    noiseFigureDb: config.communication.noiseFigureDb,
    elementGainDbi: 3,
  };

  // The same seed for every candidate, so the comparison measures the change
  // and not a different draw of the fading.
  const channels = generateIrsChannels(
    irs,
    link,
    conditionById(config.communication.conditionId),
    makeRng(config.seed),
  );

  const directSnr =
    10 *
    Math.log10(
      Math.max(absSq(channels.direct) * channels.txPowerLinear, Number.MIN_VALUE) /
        channels.noisePowerLinear,
    );
  const irsSnr = config.irs.enabled
    ? snrForPhases(channels, quantisePhases(closedFormPhases(channels), config.irs.phaseBits))
    : Number.NEGATIVE_INFINITY;

  const snrDb = Math.max(directSnr, irsSnr);
  const modulation = selectModulation(snrDb);
  const rateBps = modulation
    ? perUserBandwidth * modulation.bitsPerSymbol * 0.75 * 0.86
    : 0;

  return { snrDb, rateBps: Math.min(rateBps, shannonCapacityBps(perUserBandwidth, snrDb)) };
}

interface Candidate {
  change: string;
  reason: string;
  cost: string;
  apply: (config: ExperimentConfig) => ExperimentConfig;
  applicable: (config: ExperimentConfig) => boolean;
}

const CANDIDATES: Candidate[] = [
  {
    change: 'Double the reflecting elements',
    reason:
      'Received power through the surface grows as N², so doubling N is worth 6 dB — the steepest lever in the whole configuration.',
    cost: 'A larger surface, more control wiring, and roughly twice the static control power.',
    applicable: (c) => c.irs.enabled && c.irs.elementCount < 256,
    apply: (c) => ({
      ...c,
      irs: { ...c.irs, elementCount: Math.min(256, c.irs.elementCount * 2) },
    }),
  },
  {
    change: 'Add 6 dB of transmit power',
    reason: 'Signal power scales linearly with transmit power while the noise floor does not move.',
    cost: 'Power-amplifier headroom, energy consumption, and regulatory limits.',
    applicable: (c) => c.communication.txPowerDbm < 33,
    apply: (c) => ({
      ...c,
      communication: { ...c.communication, txPowerDbm: Math.min(33, c.communication.txPowerDbm + 6) },
    }),
  },
  {
    change: 'Improve phase resolution by one bit',
    // The quantisation loss is (2^b/π·sin(π/2^b))² — 3.92 dB at 1 bit, 0.91 at
    // 2, 0.22 at 3. So the first bit is worth 3 dB and the third is worth a
    // fifth of one, and a fixed sentence would misdescribe whichever step the
    // learner is actually on.
    reason:
      'Quantised phases cannot cancel the channel exactly; the loss is (2^b/π·sin(π/2^b))². The step from 1 to 2 bits recovers about 3 dB, from 2 to 3 about 0.7 dB, and past 3 bits there is almost nothing left to recover.',
    cost: 'More expensive elements and a wider control bus.',
    applicable: (c) => c.irs.enabled && c.irs.phaseBits > 0 && c.irs.phaseBits < 4,
    apply: (c) => ({ ...c, irs: { ...c.irs, phaseBits: c.irs.phaseBits + 1 } }),
  },
  {
    change: 'Halve the distance to the receiver',
    reason: 'Free-space loss grows as d², and faster still with the environment exponent.',
    cost: 'A denser deployment — more sites for the same coverage area.',
    applicable: (c) => c.communication.distanceM > 20,
    apply: (c) => ({
      ...c,
      communication: { ...c.communication, distanceM: Math.max(10, c.communication.distanceM / 2) },
    }),
  },
  {
    // This halves the LATERAL offset, which moves the surface toward the
    // straight line between transmitter and receiver. It does not move it
    // along that line — the surface's position on the axis is fixed at the
    // midpoint — and the label used to claim otherwise.
    change: 'Move the surface nearer the direct line',
    reason:
      'The cascaded path pays free-space loss on both hops and those losses multiply, so any slack in the geometry is expensive. Pulling the surface in toward the line between the two ends shortens both hops at once.',
    cost: 'Site acquisition, and a surface with a narrower useful coverage area.',
    applicable: (c) => c.irs.enabled,
    apply: (c) => ({ ...c, irs: { ...c.irs, surfaceOffsetM: Math.max(2, c.irs.surfaceOffsetM / 2) } }),
  },
  {
    change: 'Drop to a lower carrier frequency',
    reason:
      'Free-space loss carries a 20·log₁₀(f) term, so 28 GHz costs 18 dB more than 3.5 GHz over the same distance.',
    cost: 'Far less bandwidth, and sub-6 spectrum is already crowded.',
    applicable: (c) => c.communication.frequencyHz > 4e9,
    apply: (c) => ({
      ...c,
      communication: {
        ...c.communication,
        frequencyHz: c.communication.frequencyHz > 100e9 ? 28e9 : 3.5e9,
      },
    }),
  },
  {
    change: 'Improve the receiver noise figure by 3 dB',
    reason: 'The noise floor is kTB plus the noise figure, so every dB removed is a dB of SNR.',
    cost: 'A better low-noise amplifier, and usually more current.',
    applicable: (c) => c.communication.noiseFigureDb > 3,
    apply: (c) => ({
      ...c,
      communication: {
        ...c.communication,
        noiseFigureDb: Math.max(2, c.communication.noiseFigureDb - 3),
      },
    }),
  },
  {
    change: 'Serve half as many users on this band',
    reason:
      'Users share the bandwidth, so halving the count doubles each one’s allocation — and a doubled bandwidth also doubles the noise power, so this buys rate rather than SNR.',
    cost: 'Half the users are not served at all, or must be scheduled elsewhere.',
    applicable: (c) => c.communication.users > 1,
    apply: (c) => ({
      ...c,
      communication: { ...c.communication, users: Math.max(1, Math.floor(c.communication.users / 2)) },
    }),
  },
];

/**
 * Ranks the candidate changes by measured improvement.
 *
 * Every entry returned has been evaluated. A candidate that turns out to make
 * things worse is still returned — with a negative delta — because "the obvious
 * lever does nothing here" is a finding, and hiding it would leave a learner
 * with a list that always agrees with intuition.
 */
export function analyseSensitivity(config: ExperimentConfig): {
  baseline: { snrDb: number; rateBps: number };
  suggestions: Suggestion[];
} {
  const baseline = evaluateLink(config);

  const suggestions = CANDIDATES.filter((candidate) => candidate.applicable(config))
    .map((candidate) => {
      const modified = evaluateLink(candidate.apply(config));
      return {
        change: candidate.change,
        reason: candidate.reason,
        cost: candidate.cost,
        deltaSnrDb: modified.snrDb - baseline.snrDb,
        deltaRateBps: modified.rateBps - baseline.rateBps,
        apply: candidate.apply,
      };
    })
    .sort((a, b) => b.deltaSnrDb - a.deltaSnrDb);

  return { baseline, suggestions };
}
