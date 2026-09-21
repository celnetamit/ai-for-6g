/**
 * The simulation engine: one configuration in, one measured result out.
 *
 * This is the spine of the workflow in spec §4 — scenario, parameters, channel,
 * AI model, simulation, evaluation, optimisation — expressed as a single pure
 * async function so that every screen which shows a number is showing the same
 * number, and so that a saved experiment can be re-run and reproduce itself.
 *
 * Two rules hold throughout:
 *
 *   1. Nothing is asserted that could be measured. The bit error rate is
 *      counted over generated noise, not read off a curve. The IRS gain is the
 *      magnitude of a complex sum, not a fitted line. The reconstruction
 *      quality is a comparison of pixels.
 *   2. Everything the model cannot do is written into `notes`, which travels
 *      with the result into the report. A teaching simulator that does not say
 *      what it leaves out is teaching the wrong thing.
 */

import { type ArchitectureId } from './nn/jscc';
import {
  type ChannelConditionId,
  CHANNEL_CONDITIONS,
  conditionById,
  runTransmission,
  theoreticalAwgnBer,
} from './signalModel';
import {
  type IrsChannels,
  type IrsConfig,
  type LinkConfig,
  type Position,
  closedFormPhases,
  distanceBetween,
  generateIrsChannels,
  quantisePhases,
  randomPhases,
  snrForPhases,
} from './irs';
import { type OptimizerId, type OptimizerResult, OPTIMIZERS, optimisePhases } from './optimizers';
import { type SemanticResult, type SweepPoint, runSemantic, sweepArchitectures } from './semantic';
import {
  type EnergyResult,
  type LatencyBudget,
  type SignalQuality,
  type ThroughputResult,
  computeEnergy,
  computeLatency,
  computeThroughput,
  gradeSignal,
  numerologyForBand,
} from './performance';
import { type Modulation, MODULATIONS, selectModulation } from './modulation';
import { makeRng, noisePowerDbm } from './channel';

export type LearningLevel = 'beginner' | 'intermediate' | 'advanced';

export const LEVEL_ORDER: readonly LearningLevel[] = ['beginner', 'intermediate', 'advanced'];

export type ExperimentId =
  | 'link-budget'
  | 'irs-coverage'
  | 'ai-phase-optimisation'
  | 'semantic-transmission'
  | 'architecture-comparison'
  | 'multi-user-network';

export interface ExperimentMeta {
  id: ExperimentId;
  title: string;
  level: LearningLevel;
  question: string;
  summary: string;
  /** Which stages of the §4 workflow this experiment exercises. */
  stages: string[];
  outputs: string[];
  /** Roughly how long a run takes, so nobody stares at a frozen button. */
  cost: 'instant' | 'seconds' | 'slow';
}

export const EXPERIMENTS: readonly ExperimentMeta[] = [
  {
    id: 'link-budget',
    title: 'Link budget and the BER waterfall',
    level: 'beginner',
    question: 'How far can this link reach, and what breaks first as it gets longer?',
    summary:
      'Set a carrier, a bandwidth, a distance and a transmit power, and watch the received power, the SNR, the measured bit error rate and the achievable throughput follow. The measured BER is plotted against the closed-form curve so the two can be compared.',
    stages: ['Parameters', 'Channel', 'Simulation', 'Evaluation'],
    outputs: ['Received power', 'SNR', 'Measured BER vs theory', 'Throughput', 'Latency', 'Energy efficiency'],
    cost: 'instant',
  },
  {
    id: 'irs-coverage',
    title: 'Rescuing a blocked link with an IRS',
    level: 'intermediate',
    question: 'How many reflecting elements does it take before the surface carries the link?',
    summary:
      'Place a reconfigurable surface beside a blocked link and measure what it adds. A surface does not replace the direct path, it adds a second set of paths to it — and because those pay free-space loss twice, the cascade starts far below the direct term and climbs at 20·log₁₀(N). Finding where it takes over is the experiment.',
    stages: ['Parameters', 'Channel', 'Simulation', 'Evaluation'],
    outputs: ['Direct vs IRS SNR', 'Element sweep', 'Quantisation loss', 'Throughput', 'Energy efficiency'],
    cost: 'instant',
  },
  {
    id: 'ai-phase-optimisation',
    title: 'Learning the phase configuration',
    level: 'intermediate',
    question: 'Can a controller that sees only the reward find a good configuration?',
    summary:
      'Five methods search the same surface under the same evaluation budget: random search, greedy coordinate descent, REINFORCE, the cross-entropy method, and the closed-form solution that needs perfect channel knowledge. Their convergence traces are recorded as they run.',
    stages: ['Parameters', 'Channel', 'AI model', 'Optimisation', 'Evaluation'],
    outputs: ['Convergence traces', 'Final SNR per method', 'Evaluations spent', 'Gap to the optimum'],
    cost: 'seconds',
  },
  {
    id: 'semantic-transmission',
    title: 'Semantic versus bit-level transmission',
    level: 'intermediate',
    question: 'At the same bandwidth, which system delivers more of the meaning?',
    summary:
      'A trained DeepJSCC model and a classical DCT-plus-channel-coding system send the same scene over the same channel with the same number of channel uses. Both reconstructions are measured against the original.',
    stages: ['Parameters', 'Channel', 'AI model', 'Simulation', 'Evaluation'],
    outputs: ['Original and both reconstructions', 'PSNR', 'Structural similarity', 'Task-weighted score', 'Block loss rate'],
    cost: 'seconds',
  },
  {
    id: 'architecture-comparison',
    title: 'Comparing AI architectures across SNR',
    level: 'advanced',
    question: 'Which encoder family holds up best when the channel gets worse?',
    summary:
      'All three trained architectures and the classical baseline are swept across the SNR range on the same held-out scenes and the same noise draws. This is the experiment that shows the cliff effect against graceful degradation.',
    stages: ['Parameters', 'Channel', 'AI model', 'Simulation', 'Evaluation'],
    outputs: ['PSNR versus SNR for four systems', 'Cliff location', 'Crossover points'],
    cost: 'slow',
  },
  {
    id: 'multi-user-network',
    title: 'Serving several users at once',
    level: 'advanced',
    question: 'What does adding users cost, and who pays for it?',
    summary:
      'The bandwidth is shared between users at different distances, each with its own channel draw. Per-user rate, the sum rate, Jain fairness and the energy per bit are reported together, because optimising any one of them alone gives a different answer.',
    stages: ['Parameters', 'Channel', 'Simulation', 'Evaluation', 'Optimisation'],
    outputs: ['Per-user SNR and rate', 'Sum rate', 'Jain fairness index', 'Energy per bit'],
    cost: 'seconds',
  },
];

export const experimentById = (id: ExperimentId): ExperimentMeta =>
  EXPERIMENTS.find((e) => e.id === id) ?? EXPERIMENTS[0]!;

export const experimentsForLevel = (level: LearningLevel): ExperimentMeta[] =>
  EXPERIMENTS.filter((e) => LEVEL_ORDER.indexOf(e.level) <= LEVEL_ORDER.indexOf(level));

// ------------------------------------------------------------------- inputs

/** The carrier options, spanning the bands 6G research actually targets. */
export const BANDS = [
  { label: '3.5 GHz — sub-6', hz: 3.5e9, note: 'Today’s 5G mid-band. Long reach, modest bandwidth.' },
  { label: '28 GHz — mmWave', hz: 28e9, note: 'Wide channels, but path loss and blockage dominate.' },
  { label: '140 GHz — sub-THz', hz: 140e9, note: 'Enormous bandwidth; a link budget that barely closes.' },
] as const;

export interface CommunicationInputs {
  frequencyHz: number;
  bandwidthHz: number;
  users: number;
  distanceM: number;
  txPowerDbm: number;
  /** Receiver noise figure in dB — the "noise level" input. */
  noiseFigureDb: number;
  conditionId: ChannelConditionId;
}

export interface IrsInputs {
  enabled: boolean;
  elementCount: number;
  reflectionCoefficient: number;
  phaseBits: number;
  /** Lateral offset of the surface from the direct line, in metres. */
  surfaceOffsetM: number;
  surfaceHeightM: number;
}

export interface SemanticInputs {
  dataType: 'scene';
  channelUses: number;
  importance: number;
  codeRate: number;
  sceneSeed: number;
  sampleCount: number;
}

export interface AiInputs {
  architecture: ArchitectureId;
  optimizer: OptimizerId;
  /** Channel evaluations each optimiser may spend. */
  budget: number;
}

export interface ExperimentConfig {
  experimentId: ExperimentId;
  communication: CommunicationInputs;
  irs: IrsInputs;
  semantic: SemanticInputs;
  ai: AiInputs;
  /** Every stochastic part of the run derives from this. */
  seed: number;
}

export const DEFAULT_CONFIG: ExperimentConfig = {
  experimentId: 'link-budget',
  communication: {
    frequencyHz: 28e9,
    bandwidthHz: 100e6,
    users: 1,
    distanceM: 30,
    txPowerDbm: 24,
    noiseFigureDb: 7,
    conditionId: 'indoor',
  },
  irs: {
    enabled: false,
    elementCount: 128,
    reflectionCoefficient: 0.9,
    phaseBits: 2,
    surfaceOffsetM: 8,
    surfaceHeightM: 8,
  },
  semantic: {
    dataType: 'scene',
    channelUses: 32,
    importance: 0.5,
    codeRate: 0.75,
    sceneSeed: 20260921,
    sampleCount: 24,
  },
  ai: {
    architecture: 'cnn',
    optimizer: 'reinforce',
    budget: 3000,
  },
  // A fixed default so the first run a learner sees is the same one the
  // documentation describes. The UI offers a new seed on demand.
  seed: 20260921,
};

/**
 * Opening parameters for each experiment.
 *
 * These are not cosmetic. An experiment whose defaults put the link in outage
 * greets a learner with 0 bit/s, an infinite latency and a 21% bit error rate
 * before they have touched a control, and the lesson they take from it is that
 * the tool is broken. Every set below was checked to produce a *working* link
 * that still has somewhere interesting to go:
 *
 *  - link budget opens on an indoor 28 GHz link at 18.5 dB, running 16-QAM with
 *    margin and no surface at all. Move to 140 GHz, or push past 60 m, and
 *    watch it fail.
 *  - IRS coverage opens with the direct path at −10 dB, far inside outage, and
 *    the surface carrying the link at 17 dB. The crossover then falls in the
 *    middle of the element sweep rather than at one end.
 *  - phase optimisation opens at 64 elements: small enough that a search can
 *    make real progress inside its budget, large enough that random search
 *    cannot.
 *  - semantic transmission opens near 12 dB, which is where the classical
 *    scheme is close enough to its threshold that a few decibels either way
 *    changes the answer.
 */
export const EXPERIMENT_DEFAULTS: Record<ExperimentId, ExperimentConfig> = {
  'link-budget': DEFAULT_CONFIG,

  'irs-coverage': {
    ...DEFAULT_CONFIG,
    experimentId: 'irs-coverage',
    communication: {
      ...DEFAULT_CONFIG.communication,
      frequencyHz: 3.5e9,
      distanceM: 100,
      conditionId: 'nlos-urban',
    },
    irs: { ...DEFAULT_CONFIG.irs, enabled: true, elementCount: 128, surfaceOffsetM: 8 },
  },

  'ai-phase-optimisation': {
    ...DEFAULT_CONFIG,
    experimentId: 'ai-phase-optimisation',
    communication: {
      ...DEFAULT_CONFIG.communication,
      frequencyHz: 3.5e9,
      distanceM: 100,
      conditionId: 'nlos-urban',
    },
    irs: { ...DEFAULT_CONFIG.irs, enabled: true, elementCount: 64, surfaceOffsetM: 8 },
  },

  'semantic-transmission': {
    ...DEFAULT_CONFIG,
    experimentId: 'semantic-transmission',
    communication: {
      ...DEFAULT_CONFIG.communication,
      frequencyHz: 3.5e9,
      distanceM: 140,
      conditionId: 'nlos-urban',
    },
    irs: { ...DEFAULT_CONFIG.irs, enabled: true, elementCount: 128, surfaceOffsetM: 8 },
  },

  'architecture-comparison': {
    ...DEFAULT_CONFIG,
    experimentId: 'architecture-comparison',
    communication: {
      ...DEFAULT_CONFIG.communication,
      frequencyHz: 3.5e9,
      distanceM: 140,
      conditionId: 'nlos-urban',
    },
    irs: { ...DEFAULT_CONFIG.irs, enabled: true, elementCount: 128, surfaceOffsetM: 8 },
    semantic: { ...DEFAULT_CONFIG.semantic, sampleCount: 16 },
  },

  'multi-user-network': {
    ...DEFAULT_CONFIG,
    experimentId: 'multi-user-network',
    communication: {
      ...DEFAULT_CONFIG.communication,
      frequencyHz: 3.5e9,
      bandwidthHz: 200e6,
      users: 4,
      distanceM: 120,
      conditionId: 'nlos-urban',
    },
    irs: { ...DEFAULT_CONFIG.irs, enabled: true, elementCount: 128, surfaceOffsetM: 8 },
  },
};

export const defaultsFor = (id: ExperimentId): ExperimentConfig =>
  EXPERIMENT_DEFAULTS[id] ?? DEFAULT_CONFIG;

// ------------------------------------------------------------------ results

export interface LinkSummary {
  noiseFloorDbm: number;
  perUserBandwidthHz: number;
  /** SNR with no surface deployed — the direct path alone. */
  directSnrDb: number;
  /**
   * SNR with the surface deployed.
   *
   * This is the *combined* channel, h_d + Σ βe^{jθ}h_r h_t, not an alternative
   * route: a surface does not replace the direct path, it adds a second set of
   * paths to it. Labelling this "via the IRS" against "direct" implied the two
   * were alternatives, and made the surface look as though it could never lose
   * — of course it cannot, when one of the two numbers contains the other.
   * What can be small, and often is, is the difference.
   */
  irsSnrDb: number | null;
  /** irsSnrDb − directSnrDb: what deploying the surface actually bought. */
  surfaceGainDb: number | null;
  /** Whether the surface contributed enough to be the reason the link closes. */
  servingRoute: 'direct' | 'irs';
  servingSnrDb: number;
  distanceM: number;
  txToSurfaceM: number;
  surfaceToRxM: number;
}

export interface UserResult {
  index: number;
  distanceM: number;
  snrDb: number;
  modulation: Modulation | null;
  goodputBps: number;
}

export interface MeasuredLink {
  ber: number;
  theoreticalBer: number;
  bler: number;
  evmPercent: number;
  modulation: Modulation | null;
  symbols: { x: number; y: number }[];
  bitsSent: number;
  bitErrors: number;
}

export interface ExperimentResult {
  id: string;
  experimentId: ExperimentId;
  config: ExperimentConfig;
  startedAt: string;
  durationMs: number;
  link: LinkSummary;
  measured: MeasuredLink;
  throughput: ThroughputResult;
  latency: LatencyBudget;
  energy: EnergyResult;
  quality: SignalQuality;
  /** SNR against element count, both aligned and random phases. */
  elementSweep: { elements: number; aligned: number; random: number; direct: number }[];
  /** Measured and theoretical BER against SNR. */
  waterfall: { snrDb: number; measured: number; theory: number }[];
  optimisers?: OptimizerResult[];
  semantic?: SemanticResult;
  architectureSweep?: SweepPoint[];
  users?: UserResult[];
  fairness?: number;
  notes: string[];
}

/** What is small enough, and stable enough, to keep in browser storage. */
export interface ExperimentRecord {
  id: string;
  experimentId: ExperimentId;
  title: string;
  savedAt: string;
  config: ExperimentConfig;
  headline: { label: string; value: string }[];
  durationMs: number;
}

// ------------------------------------------------------------------ helpers

function geometry(config: ExperimentConfig): { irs: IrsConfig; link: LinkConfig } {
  const d = config.communication.distanceM;
  const transmitter: Position = { x: 0, y: 0, z: 10 };
  const receiver: Position = { x: d, y: 0, z: 1.5 };
  const surface: Position = {
    x: d / 2,
    y: config.irs.surfaceOffsetM,
    z: config.irs.surfaceHeightM,
  };

  return {
    irs: {
      elementCount: config.irs.elementCount,
      reflectionCoefficient: config.irs.reflectionCoefficient,
      phaseBits: config.irs.phaseBits,
      transmitter,
      surface,
      receiver,
    },
    link: {
      txPowerDbm: config.communication.txPowerDbm,
      frequencyHz: config.communication.frequencyHz,
      bandwidthHz: config.communication.bandwidthHz / Math.max(1, config.communication.users),
      txGainDbi: 15,
      rxGainDbi: 10,
      noiseFigureDb: config.communication.noiseFigureDb,
      elementGainDbi: 3,
    },
  };
}

const directSnrDb = (channels: IrsChannels): number =>
  10 *
  Math.log10(
    Math.max(
      (channels.direct.re ** 2 + channels.direct.im ** 2) * channels.txPowerLinear,
      Number.MIN_VALUE,
    ) / channels.noisePowerLinear,
  );

/**
 * Jain's fairness index over the per-user rates.
 *
 *   J = (Σxᵢ)² / (n·Σxᵢ²),  which is 1 when every user gets the same rate and
 *   1/n when one user gets everything.
 *
 * Reported next to the sum rate because the two disagree: the configuration
 * that maximises total throughput is usually the one that starves the far user.
 */
export function jainFairness(rates: number[]): number {
  if (rates.length === 0) return 1;
  const sum = rates.reduce((a, b) => a + b, 0);
  const sumSquares = rates.reduce((a, b) => a + b * b, 0);
  if (sumSquares === 0) return 1;
  return (sum * sum) / (rates.length * sumSquares);
}

export interface RunProgress {
  stage: string;
  fraction: number;
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ----------------------------------------------------------------- the run

export async function runExperiment(
  config: ExperimentConfig,
  onProgress?: (progress: RunProgress) => void,
): Promise<ExperimentResult> {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const report = (stage: string, fraction: number) => onProgress?.({ stage, fraction });

  report('Building the channel', 0.05);
  const { irs, link } = geometry(config);
  const condition = conditionById(config.communication.conditionId);
  const channelRng = makeRng(config.seed);
  const channels = generateIrsChannels(irs, link, condition, channelRng);

  const notes: string[] = [
    'Every figure here is a simulation result produced by this page, not a measurement of hardware.',
  ];

  // ---- what the surface is worth here
  const direct = directSnrDb(channels);
  const optimalPhases = quantisePhases(closedFormPhases(channels), config.irs.phaseBits);
  const irsSnr = config.irs.enabled ? snrForPhases(channels, optimalPhases) : null;
  const surfaceGainDb = irsSnr === null ? null : irsSnr - direct;
  const servingSnrDb = irsSnr ?? direct;
  // One decibel is the threshold for "the surface is doing something". Below
  // it the combined channel is the direct path with a rounding error attached,
  // and calling that "served by the surface" would be a claim about nothing.
  const servingRoute: 'direct' | 'irs' =
    surfaceGainDb !== null && surfaceGainDb >= 1 ? 'irs' : 'direct';

  const linkSummary: LinkSummary = {
    noiseFloorDbm: noisePowerDbm(link.bandwidthHz, link.noiseFigureDb),
    perUserBandwidthHz: link.bandwidthHz,
    directSnrDb: direct,
    irsSnrDb: irsSnr,
    surfaceGainDb,
    servingRoute,
    servingSnrDb,
    distanceM: config.communication.distanceM,
    txToSurfaceM: distanceBetween(irs.transmitter, irs.surface),
    surfaceToRxM: distanceBetween(irs.surface, irs.receiver),
  };

  // ---- measured transmission
  report('Transmitting symbols', 0.2);
  const modulation = selectModulation(servingSnrDb);
  const transmissionRng = makeRng(config.seed * 7 + 11);
  const transmission = runTransmission(
    {
      modulation: modulation ?? MODULATIONS[0]!,
      averageSnrDb: servingSnrDb,
      condition,
      symbolsPerBlock: 128,
      blocks: 320,
    },
    transmissionRng,
  );

  const measured: MeasuredLink = {
    ber: transmission.ber,
    theoreticalBer: theoreticalAwgnBer(modulation ?? MODULATIONS[0]!, servingSnrDb),
    bler: transmission.bler,
    evmPercent: transmission.evm * 100,
    modulation,
    symbols: transmission.equalised.slice(0, 400).map((s) => ({ x: s.re, y: s.im })),
    bitsSent: transmission.bitsSent,
    bitErrors: transmission.bitErrors,
  };

  // ---- performance
  report('Evaluating performance', 0.35);
  const throughput = computeThroughput(link.bandwidthHz, servingSnrDb, transmission.bler);
  const numerology = numerologyForBand(config.communication.frequencyHz);
  const latency = computeLatency({
    packetBits: 8192,
    goodputBps: throughput.goodputBps,
    distanceM:
      servingRoute === 'irs'
        ? linkSummary.txToSurfaceM + linkSummary.surfaceToRxM
        : config.communication.distanceM,
    slotMs: numerology.slotMs,
    blockErrorRate: transmission.bler,
  });
  const energy = computeEnergy({
    txPowerDbm: config.communication.txPowerDbm,
    users: config.communication.users,
    irsElements: config.irs.enabled ? config.irs.elementCount : 0,
    phaseBits: config.irs.phaseBits,
    goodputBps: throughput.goodputBps * Math.max(1, config.communication.users),
  });
  const quality = gradeSignal(servingSnrDb, transmission.evm);

  // ---- element sweep, always useful context
  /*
   * The sweep uses one seed for every point, not a seed per point.
   *
   * With the direct path drawn first (see `generateIrsChannels`), every point
   * on the sweep shares the same direct path, the same shadowing and the same
   * diffuse scattering draws. The surfaces are not nested — the planar layout
   * changes with N, so the elements sit in different places — but the channel
   * they sit in is the same one. A seed per point instead makes every column an
   * independent deployment, and the scatter between deployments is larger than
   * the 6 dB per doubling the chart exists to show.
   *
   * One consequence is worth stating rather than hiding: at the smallest N the
   * aligned curve can step DOWN by a few tenths of a dB — typically between
   * N = 2 and N = 4. It is not a bug and not noise. While the direct path is
   * still the dominant term, the combined magnitude is |h_d + cascade|, and
   * relaying out the array (N = 2 is a 1×2 strip, N = 4 a 2×2 square) changes
   * the steering phases of a cascade that is 20-30 dB below h_d. The sum
   * therefore wobbles at the level of that small term. Once the cascade
   * dominates — the region the N² law is read from, and the only region the
   * report quotes a slope for — the curve rises monotonically.
   */
  const elementSweep: ExperimentResult['elementSweep'] = [];
  for (let n = 1; n <= 256; n *= 2) {
    const sweepRng = makeRng(config.seed);
    const sweepChannels = generateIrsChannels({ ...irs, elementCount: n }, link, condition, sweepRng);
    elementSweep.push({
      elements: n,
      aligned: Number(
        snrForPhases(
          sweepChannels,
          quantisePhases(closedFormPhases(sweepChannels), config.irs.phaseBits),
        ).toFixed(2),
      ),
      random: Number(snrForPhases(sweepChannels, randomPhases(n, sweepRng)).toFixed(2)),
      direct: Number(directSnrDb(sweepChannels).toFixed(2)),
    });
  }

  // ---- BER waterfall
  report('Sweeping the waterfall', 0.5);
  const waterfall: ExperimentResult['waterfall'] = [];
  const waterfallModulation = modulation ?? MODULATIONS[1]!;
  for (let snr = -4; snr <= 30; snr += 2) {
    const sweep = runTransmission(
      {
        modulation: waterfallModulation,
        averageSnrDb: snr,
        condition,
        symbolsPerBlock: 96,
        blocks: 120,
      },
      makeRng(config.seed + 1000 + snr),
    );
    waterfall.push({
      snrDb: snr,
      // A BER of exactly zero cannot be drawn on a log axis, and reporting it
      // as zero would also overclaim: 0 errors in N bits means "below 1/N",
      // not "none". The floor is that bound.
      measured: Math.max(sweep.ber, 1 / sweep.bitsSent),
      theory: Math.max(theoreticalAwgnBer(waterfallModulation, snr), 1e-9),
    });
  }

  const result: ExperimentResult = {
    id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    experimentId: config.experimentId,
    config,
    startedAt,
    durationMs: 0,
    link: linkSummary,
    measured,
    throughput,
    latency,
    energy,
    quality,
    elementSweep,
    waterfall,
    notes,
  };

  // ---- experiment-specific stages
  if (config.experimentId === 'ai-phase-optimisation') {
    report('Running the optimisers', 0.6);
    const optimisers: OptimizerResult[] = [];
    for (let index = 0; index < OPTIMIZERS.length; index += 1) {
      const meta = OPTIMIZERS[index]!;
      optimisers.push(
        optimisePhases(channels, meta.id, {
          budget: config.ai.budget,
          phaseBits: config.irs.phaseBits,
          // The same seed for every method, so they face the same random
          // starting points and the comparison is not a lottery.
          random: makeRng(config.seed + 4242),
        }),
      );
      report(`Optimising — ${meta.label}`, 0.6 + (0.35 * (index + 1)) / OPTIMIZERS.length);
      await yieldToUi();
    }
    result.optimisers = optimisers;
    notes.push(
      'Every method was given the same evaluation budget and the same starting seed. The closed-form solution is charged one evaluation because it computes the answer directly — it is not charged for the channel estimation that would be needed to know the coefficients.',
    );
  }

  if (config.experimentId === 'semantic-transmission') {
    report('Loading the trained model', 0.6);
    result.semantic = await runSemantic({
      architecture: config.ai.architecture,
      channelUses: config.semantic.channelUses,
      snrDb: servingSnrDb,
      importance: config.semantic.importance,
      codeRate: config.semantic.codeRate,
      sceneSeed: config.semantic.sceneSeed,
      sampleCount: config.semantic.sampleCount,
    });
    report('Measuring reconstructions', 0.9);
    notes.push(
      'Both systems were given the same number of complex channel uses and the same channel realisation. The classical path is modelled with an idealised code at the Singleton bound, which is generous to it — a real LDPC code of this length is 1–2 dB worse.',
    );
    notes.push(
      'The trained models were fitted to the procedural 16×16 scenes described in their model cards. These results describe that source and do not transfer to photographs.',
    );
  }

  if (config.experimentId === 'architecture-comparison') {
    report('Sweeping architectures', 0.6);
    result.architectureSweep = await sweepArchitectures(['cnn', 'transformer', 'mlp'], {
      snrGrid: [-5, -2, 1, 4, 7, 10, 13, 16, 20, 25],
      channelUses: config.semantic.channelUses,
      codeRate: config.semantic.codeRate,
      sceneSeed: config.semantic.sceneSeed,
      sampleCount: Math.min(16, config.semantic.sampleCount),
      importance: config.semantic.importance,
      onProgress: (done, total) =>
        report(`Sweeping architectures — ${done}/${total}`, 0.6 + (0.35 * done) / total),
    });
    notes.push(
      'All three architectures saw identical scenes and identical noise seeds at every SNR. The classical curve is the same scheme in all four columns and is drawn once.',
    );
  }

  if (config.experimentId === 'multi-user-network') {
    report('Serving users', 0.6);
    const users: UserResult[] = [];
    const count = Math.max(1, config.communication.users);
    for (let index = 0; index < count; index += 1) {
      // Users are spread between a third of the cell radius and its edge, so
      // the near/far problem actually appears rather than every user being
      // identical.
      const userDistance =
        config.communication.distanceM * (0.35 + (0.65 * (index + 1)) / count);
      const userConfig: ExperimentConfig = {
        ...config,
        communication: { ...config.communication, distanceM: userDistance },
      };
      const userGeometry = geometry(userConfig);
      const userChannels = generateIrsChannels(
        userGeometry.irs,
        userGeometry.link,
        condition,
        makeRng(config.seed + 500 + index * 37),
      );
      // As above: with a surface deployed the SNR is the combined channel, not
      // the better of two routes.
      const snrDb = config.irs.enabled
        ? snrForPhases(
            userChannels,
            quantisePhases(closedFormPhases(userChannels), config.irs.phaseBits),
          )
        : directSnrDb(userChannels);
      /*
       * Each user's block error rate is MEASURED, not assumed.
       *
       * This used to pass a constant 0.02 for everyone. Because a modulation's
       * rate depends only on which modulation it is, two users on the same
       * MCS then received byte-identical goodput — and since link adaptation
       * has four steps, the default four-user cell had every user on 64-QAM
       * and reported a Jain fairness index of exactly 1.0000. The headline
       * number of this experiment was a constant, and it asserted the opposite
       * of the lesson the experiment exists to teach.
       *
       * With the block error rate counted per user, the rate varies
       * continuously with distance and the index means something again.
       */
      const userModulation = selectModulation(snrDb);
      const userBler = userModulation
        ? runTransmission(
            {
              modulation: userModulation,
              averageSnrDb: snrDb,
              condition,
              symbolsPerBlock: 64,
              blocks: 120,
            },
            makeRng(config.seed + 900 + index * 71),
          ).bler
        : 1;
      const userThroughput = computeThroughput(
        userGeometry.link.bandwidthHz,
        snrDb,
        userBler,
      );
      users.push({
        index: index + 1,
        distanceM: Number(userDistance.toFixed(1)),
        snrDb: Number(snrDb.toFixed(2)),
        modulation: userThroughput.modulation,
        goodputBps: userThroughput.goodputBps,
      });
      await yieldToUi();
    }
    result.users = users;
    result.fairness = jainFairness(users.map((u) => u.goodputBps));
    notes.push(
      'Users share the bandwidth equally and orthogonally, so there is no inter-user interference in this model. A non-orthogonal scheme would add an interference term and change the fairness picture substantially.',
    );
    notes.push(
      'The surface is configured for each user in turn. A single surface cannot in fact serve several users optimally at the same instant; doing so is a scheduling problem this model does not solve.',
    );
  }

  // ---- honest caveats that apply to every run
  if (condition.id === 'high-mobility') {
    notes.push(
      'High mobility is modelled as block fading: each block draws an independent channel. That captures the depth of fades but not Doppler-induced intercarrier interference, which is the other half of the problem at these speeds.',
    );
  }
  if (config.communication.frequencyHz >= 100e9) {
    notes.push(
      'At sub-THz carriers molecular absorption adds several dB per kilometre in specific bands. This model includes free-space loss and the environment exponent, but no absorption line structure.',
    );
  }
  if (config.irs.enabled) {
    notes.push(
      `The surface is configured with ${config.irs.phaseBits > 0 ? `${config.irs.phaseBits}-bit` : 'continuous'} phase control and a reflection amplitude of ${config.irs.reflectionCoefficient.toFixed(2)}. Phases are set from perfect channel knowledge unless an optimiser was run.`,
    );
  }

  report('Done', 1);
  result.durationMs = Date.now() - started;
  return result;
}

/** The compact form kept in experiment history. */
export function toRecord(result: ExperimentResult): ExperimentRecord {
  const meta = experimentById(result.experimentId);
  const headline: { label: string; value: string }[] = [
    {
      label: 'SNR',
      value:
        result.link.surfaceGainDb === null
          ? `${result.link.servingSnrDb.toFixed(1)} dB`
          : `${result.link.servingSnrDb.toFixed(1)} dB (surface +${result.link.surfaceGainDb.toFixed(1)})`,
    },
    {
      label: 'Measured BER',
      value:
        result.measured.ber < 1e-4
          ? result.measured.ber.toExponential(2)
          : `${(result.measured.ber * 100).toFixed(2)}%`,
    },
    {
      label: 'Goodput',
      value:
        result.throughput.goodputBps >= 1e9
          ? `${(result.throughput.goodputBps / 1e9).toFixed(2)} Gbit/s`
          : `${(result.throughput.goodputBps / 1e6).toFixed(1)} Mbit/s`,
    },
    { label: 'Latency', value: `${result.latency.totalMs.toFixed(2)} ms` },
    { label: 'Energy efficiency', value: `${result.energy.megabitsPerJoule.toFixed(1)} Mbit/J` },
  ];

  if (result.semantic) {
    headline.push({
      label: 'Semantic PSNR',
      value: `${result.semantic.aggregate.neuralPsnrDb.toFixed(1)} dB vs ${result.semantic.aggregate.classicalPsnrDb.toFixed(1)} dB classical`,
    });
  }
  if (result.optimisers) {
    const best = [...result.optimisers].sort((a, b) => b.bestSnrDb - a.bestSnrDb)[0];
    if (best) headline.push({ label: 'Best optimiser', value: `${best.label} — ${best.bestSnrDb.toFixed(1)} dB` });
  }
  if (result.fairness !== undefined) {
    headline.push({ label: 'Jain fairness', value: result.fairness.toFixed(3) });
  }

  return {
    id: result.id,
    experimentId: result.experimentId,
    title: meta.title,
    savedAt: result.startedAt,
    config: result.config,
    headline,
    durationMs: result.durationMs,
  };
}

export { CHANNEL_CONDITIONS, OPTIMIZERS };
