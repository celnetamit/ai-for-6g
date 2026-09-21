/**
 * Phase-configuration search for the surface — the "AI optimisation" stage of
 * the workflow in §4.
 *
 * Each method here optimises the *same* objective (the measured SNR of the
 * effective channel) under the *same* budget of channel evaluations, and each
 * returns the trace of what it actually achieved along the way. That is the
 * only arrangement in which "compare AI algorithms" (§2, Advanced) means
 * anything: a comparison where one method is allowed more tries than another is
 * a comparison of budgets, not of methods.
 *
 * Nothing here is a stand-in. Every trace point is a real evaluation of
 * `snrForPhases`, and the closed-form solution is computed alongside as the
 * ceiling, so a learner can see how close a search got rather than being told.
 *
 * On the naming: the reinforcement-learning entry is REINFORCE (Williams 1992)
 * with a mean baseline, and the cross-entropy method is a derivative-free
 * policy search. Both are genuinely what their labels say. Neither is a deep
 * network, and the lab does not claim they are — the deep models in this lab
 * live in the semantic/JSCC path, where they are trained offline and shipped
 * with their weights.
 */

import {
  type IrsChannels,
  closedFormPhases,
  quantisePhases,
  randomPhases,
  snrForPhases,
  wrapPhase,
} from './irs';

export type OptimizerId =
  | 'random'
  | 'greedy'
  | 'reinforce'
  | 'cross-entropy'
  | 'closed-form';

export interface OptimizerMeta {
  id: OptimizerId;
  label: string;
  family: 'baseline' | 'classical' | 'reinforcement-learning' | 'analytical';
  summary: string;
  /** What this method needs to know before it can run. */
  requires: string;
}

export const OPTIMIZERS: readonly OptimizerMeta[] = [
  {
    id: 'random',
    label: 'Random search',
    family: 'baseline',
    summary:
      'Draws phase vectors uniformly and keeps the best. The control condition: any method that cannot beat this has learned nothing.',
    requires: 'Only the ability to measure the resulting SNR.',
  },
  {
    id: 'greedy',
    label: 'Greedy coordinate descent',
    family: 'classical',
    summary:
      'Sweeps the elements one at a time, setting each to its best value with the others held fixed. The classical alternating-optimisation baseline from the IRS literature.',
    requires: 'A measurement per candidate phase, per element — expensive, but no model.',
  },
  {
    id: 'reinforce',
    label: 'REINFORCE policy gradient',
    family: 'reinforcement-learning',
    summary:
      'A Gaussian policy over the phase vector, updated by the score-function gradient with a mean baseline (Williams, 1992). Learns from the reward alone, with no gradient of the channel.',
    requires: 'Reward feedback only. No channel state information is used directly.',
  },
  {
    id: 'cross-entropy',
    label: 'Cross-entropy method',
    family: 'reinforcement-learning',
    summary:
      'Samples a population, keeps the elite fraction, and refits the sampling distribution to them. Derivative-free policy search; robust where a gradient estimate is noisy.',
    requires: 'Reward feedback only.',
  },
  {
    id: 'closed-form',
    label: 'Closed-form co-phasing',
    family: 'analytical',
    summary:
      'Sets every phase to cancel the cascaded channel phase exactly. Optimal, and computable only with perfect channel knowledge — the ceiling the search methods are measured against.',
    requires: 'Perfect knowledge of every cascaded channel coefficient.',
  },
];

export const optimizerById = (id: OptimizerId): OptimizerMeta =>
  OPTIMIZERS.find((o) => o.id === id) ?? OPTIMIZERS[0]!;

export interface TracePoint {
  evaluation: number;
  snrDb: number;
}

export interface OptimizerResult {
  id: OptimizerId;
  label: string;
  phases: number[];
  bestSnrDb: number;
  /** Best-so-far SNR against evaluations spent. */
  trace: TracePoint[];
  evaluations: number;
  elapsedMs: number;
}

export interface OptimizerOptions {
  /** Hard cap on channel measurements, shared by every method. */
  budget: number;
  /** Phase resolution of the hardware; 0 for continuous. */
  phaseBits: number;
  random: () => number;
}

/**
 * Wraps the objective so every method is charged for what it uses and the trace
 * records best-so-far rather than each sample — which is what a practitioner
 * actually cares about, since the controller keeps the best configuration it
 * has found.
 */
function makeObjective(channels: IrsChannels, options: OptimizerOptions) {
  let evaluations = 0;
  let best = Number.NEGATIVE_INFINITY;
  const trace: TracePoint[] = [];
  // At most ~120 points on the chart; a 20 000-evaluation run should not ship
  // 20 000 objects to Recharts.
  const stride = Math.max(1, Math.floor(options.budget / 120));

  const evaluate = (phases: readonly number[]): number => {
    const applied = options.phaseBits > 0 ? quantisePhases(phases, options.phaseBits) : phases;
    const snr = snrForPhases(channels, applied);
    evaluations += 1;
    if (snr > best) best = snr;
    if (evaluations % stride === 0 || evaluations === 1) {
      trace.push({ evaluation: evaluations, snrDb: Number(best.toFixed(3)) });
    }
    return snr;
  };

  return {
    evaluate,
    exhausted: () => evaluations >= options.budget,
    state: () => ({ evaluations, best, trace }),
    finish: () => {
      const last = trace[trace.length - 1];
      if (!last || last.evaluation !== evaluations) {
        trace.push({ evaluation: evaluations, snrDb: Number(best.toFixed(3)) });
      }
    },
  };
}

type Objective = ReturnType<typeof makeObjective>;

function randomSearch(
  channels: IrsChannels,
  objective: Objective,
  options: OptimizerOptions,
): number[] {
  let bestPhases = randomPhases(channels.elementCount, options.random);
  let bestValue = objective.evaluate(bestPhases);
  while (!objective.exhausted()) {
    const candidate = randomPhases(channels.elementCount, options.random);
    const value = objective.evaluate(candidate);
    if (value > bestValue) {
      bestValue = value;
      bestPhases = candidate;
    }
  }
  return bestPhases;
}

/**
 * One element at a time, each set to its best value with the rest frozen.
 *
 * With continuous phases the per-element optimum could be written down, but
 * doing so would need the channel coefficients — the point of this method is
 * that it needs only measurements, so it tries a fixed grid. That is also what
 * a real surface does: it can only set the phases its hardware supports.
 */
function greedyCoordinateDescent(
  channels: IrsChannels,
  objective: Objective,
  options: OptimizerOptions,
): number[] {
  const candidates = options.phaseBits > 0 ? 1 << options.phaseBits : 8;
  const phases = randomPhases(channels.elementCount, options.random);
  let best = objective.evaluate(phases);

  while (!objective.exhausted()) {
    let improved = false;
    for (let n = 0; n < channels.elementCount && !objective.exhausted(); n += 1) {
      const original = phases[n]!;
      let bestPhase = original;
      for (let c = 0; c < candidates && !objective.exhausted(); c += 1) {
        const trial = wrapPhase(-Math.PI + (2 * Math.PI * c) / candidates);
        phases[n] = trial;
        const value = objective.evaluate(phases);
        if (value > best) {
          best = value;
          bestPhase = trial;
          improved = true;
        }
      }
      phases[n] = bestPhase;
    }
    // A full sweep with no improvement means the descent has converged; keep
    // spending the budget re-sweeping only if something moved.
    if (!improved) break;
  }
  return phases;
}

/**
 * REINFORCE over a factored categorical policy (Williams, 1992).
 *
 * The first version of this used a diagonal Gaussian over continuous phases.
 * It was measurably worse than random search at 64 elements — the probe run in
 * `scripts/` showed it 10 dB behind the closed form where the cross-entropy
 * method was within 1.5 dB — and shipping it would have taught the opposite of
 * the intended lesson. The cause is credit assignment: estimating a 64-
 * dimensional gradient from 32 scalar rewards gives each coordinate a
 * signal-to-noise ratio of roughly √(B/N), which is below 1 here.
 *
 * The policy is now one independent categorical distribution per element over
 * the phases the hardware can actually set — which is what the action space of
 * a real surface controller *is*. For a sampled action a_n with probability
 * π_n(a):
 *
 *   ∇_{logit_n(a)} log π = 1[a = a_n] − π_n(a)
 *   Δ logit_n(a) = α · Â · (1[a = a_n] − π_n(a))
 *
 * with Â the reward standardised over the batch. Each element's marginal
 * contribution is now estimated from every sample in which it took a given
 * action, so the estimator's variance falls with the number of samples rather
 * than with the number of samples per dimension.
 *
 * The method still uses nothing but the scalar reward: no channel coefficients,
 * no gradient of the channel, no model. That is the property that makes it
 * interesting next to the closed form, which needs all three.
 */
function reinforce(
  channels: IrsChannels,
  objective: Objective,
  options: OptimizerOptions,
): number[] {
  const n = channels.elementCount;
  // With continuous-phase hardware the controller still has to choose from
  // somewhere; 8 levels is the discretisation, and it is stated rather than
  // hidden because it caps what this method can reach.
  const levels = options.phaseBits > 0 ? 1 << options.phaseBits : 8;
  const step = (2 * Math.PI) / levels;
  const phaseOf = (action: number): number => wrapPhase(-Math.PI + action * step);

  const logits = new Float64Array(n * levels);
  const probabilities = new Float64Array(n * levels);
  const batch = Math.max(8, Math.min(24, Math.floor(options.budget / 120)));
  const learningRate = 0.6;

  let bestPhases = Array.from({ length: n }, () => phaseOf(Math.floor(options.random() * levels)));
  let bestValue = objective.evaluate(bestPhases);

  const refreshProbabilities = () => {
    for (let i = 0; i < n; i += 1) {
      const base = i * levels;
      let max = Number.NEGATIVE_INFINITY;
      for (let a = 0; a < levels; a += 1) max = Math.max(max, logits[base + a]!);
      let sum = 0;
      for (let a = 0; a < levels; a += 1) {
        const e = Math.exp(logits[base + a]! - max);
        probabilities[base + a] = e;
        sum += e;
      }
      for (let a = 0; a < levels; a += 1) probabilities[base + a] /= sum;
    }
  };

  while (!objective.exhausted()) {
    refreshProbabilities();

    const actions: Int32Array[] = [];
    const rewards: number[] = [];

    for (let b = 0; b < batch && !objective.exhausted(); b += 1) {
      const sampled = new Int32Array(n);
      const phases = new Array<number>(n);
      for (let i = 0; i < n; i += 1) {
        const base = i * levels;
        let u = options.random();
        let action = levels - 1;
        for (let a = 0; a < levels; a += 1) {
          u -= probabilities[base + a]!;
          if (u <= 0) {
            action = a;
            break;
          }
        }
        sampled[i] = action;
        phases[i] = phaseOf(action);
      }
      const reward = objective.evaluate(phases);
      actions.push(sampled);
      rewards.push(reward);
      if (reward > bestValue) {
        bestValue = reward;
        bestPhases = phases;
      }
    }
    if (actions.length < 2) break;

    const baseline = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const spread =
      Math.sqrt(
        rewards.reduce((a, r) => a + (r - baseline) ** 2, 0) / Math.max(1, rewards.length - 1),
      ) || 1;

    for (let s = 0; s < actions.length; s += 1) {
      const advantage = (rewards[s]! - baseline) / spread;
      if (advantage === 0) continue;
      const sampled = actions[s]!;
      for (let i = 0; i < n; i += 1) {
        const base = i * levels;
        const taken = sampled[i]!;
        for (let a = 0; a < levels; a += 1) {
          const indicator = a === taken ? 1 : 0;
          logits[base + a] +=
            (learningRate * advantage * (indicator - probabilities[base + a]!)) / actions.length;
        }
      }
    }
  }

  // The learned deterministic policy — argmax per element — is what a
  // controller would actually deploy, and is usually better than any single
  // exploratory sample. Evaluated rather than assumed.
  if (!objective.exhausted()) {
    refreshProbabilities();
    const greedy = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const base = i * levels;
      let best = 0;
      for (let a = 1; a < levels; a += 1) {
        if (probabilities[base + a]! > probabilities[base + best]!) best = a;
      }
      greedy[i] = phaseOf(best);
    }
    if (objective.evaluate(greedy) > bestValue) return greedy;
  }

  return bestPhases;
}

/**
 * Cross-entropy method: sample, keep the elite, refit, repeat.
 *
 * Phases are circular, so the distribution is refitted with a circular mean
 * (the argument of the mean unit vector) rather than an arithmetic one. Using
 * the arithmetic mean here is a classic bug: two elite samples at +179° and
 * −179° are 2° apart, and averaging them arithmetically puts the new mean at
 * 0°, which is as wrong as it is possible to be.
 */
function crossEntropy(
  channels: IrsChannels,
  objective: Objective,
  options: OptimizerOptions,
): number[] {
  const n = channels.elementCount;
  const population = Math.max(12, Math.min(48, Math.floor(options.budget / 30)));
  const eliteCount = Math.max(2, Math.floor(population * 0.2));

  let mu = randomPhases(n, options.random);
  let sigma = 1.5;
  let bestPhases = mu.slice();
  let bestValue = objective.evaluate(mu);

  while (!objective.exhausted()) {
    const candidates: { phases: number[]; value: number }[] = [];
    for (let p = 0; p < population && !objective.exhausted(); p += 1) {
      const theta = mu.map((m) => {
        const u1 = Math.max(options.random(), Number.MIN_VALUE);
        const u2 = options.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return wrapPhase(m + sigma * z);
      });
      candidates.push({ phases: theta, value: objective.evaluate(theta) });
    }
    if (candidates.length < eliteCount) break;

    candidates.sort((a, b) => b.value - a.value);
    if (candidates[0]!.value > bestValue) {
      bestValue = candidates[0]!.value;
      bestPhases = candidates[0]!.phases.slice();
    }

    const elite = candidates.slice(0, eliteCount);
    const nextMu: number[] = [];
    let concentration = 0;
    for (let i = 0; i < n; i += 1) {
      let sumCos = 0;
      let sumSin = 0;
      for (const candidate of elite) {
        sumCos += Math.cos(candidate.phases[i]!);
        sumSin += Math.sin(candidate.phases[i]!);
      }
      nextMu.push(Math.atan2(sumSin, sumCos));
      concentration += Math.hypot(sumCos, sumSin) / elite.length;
    }
    mu = nextMu;

    // Circular standard deviation from the mean resultant length R:
    // σ = √(−2 ln R). Floored so the search never collapses entirely.
    const r = Math.min(0.9999, Math.max(1e-6, concentration / n));
    sigma = Math.max(0.05, Math.min(1.5, Math.sqrt(-2 * Math.log(r))));
  }

  if (!objective.exhausted() && objective.evaluate(mu) > bestValue) return mu;
  return bestPhases;
}

/**
 * Runs one optimiser against a channel realisation.
 *
 * `closed-form` is charged a single evaluation, which is honest: it computes
 * the answer directly. What it is *not* charged for is the channel estimation
 * that would be needed to know those coefficients in the first place, and the
 * UI says so where the result is shown.
 */
export function optimisePhases(
  channels: IrsChannels,
  id: OptimizerId,
  options: OptimizerOptions,
): OptimizerResult {
  const started = Date.now();
  const objective = makeObjective(channels, options);

  let phases: number[];
  switch (id) {
    case 'closed-form': {
      phases = closedFormPhases(channels);
      objective.evaluate(phases);
      break;
    }
    case 'greedy':
      phases = greedyCoordinateDescent(channels, objective, options);
      break;
    case 'reinforce':
      phases = reinforce(channels, objective, options);
      break;
    case 'cross-entropy':
      phases = crossEntropy(channels, objective, options);
      break;
    case 'random':
    default:
      phases = randomSearch(channels, objective, options);
      break;
  }

  objective.finish();
  const { evaluations, best, trace } = objective.state();
  const applied = options.phaseBits > 0 ? quantisePhases(phases, options.phaseBits) : phases;

  return {
    id,
    label: optimizerById(id).label,
    phases: applied,
    // The best value seen, which is the configuration a controller would keep.
    bestSnrDb: Math.max(best, snrForPhases(channels, applied)),
    trace,
    evaluations,
    elapsedMs: Date.now() - started,
  };
}
