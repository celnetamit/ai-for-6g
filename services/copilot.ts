/**
 * The 6G Network Copilot (spec §8).
 *
 * Its four functions are explaining results, suggesting parameter
 * optimisation, generating experiment summaries and supporting learner
 * understanding. Its three restrictions — no fabricated experimental results,
 * no claim of real-world validation, no substitute for engineering judgement —
 * are enforced in four places rather than only in a prompt:
 *
 *   1. **It is never asked to compute anything.** Every number it can see was
 *      already produced by the simulation engine and is handed to it as
 *      context. There is no path by which a metric reaches the screen through
 *      the model.
 *   2. **The system instruction states the restrictions** and tells it to say
 *      when it does not know.
 *   3. **A numeric audit runs over every reply.** Any figure in the answer that
 *      does not appear in the supplied context is surfaced to the learner as
 *      unverified. This is a heuristic, and the UI says so — but a model
 *      inventing a throughput will be caught by it.
 *   4. **Without a gateway the assistant is absent, not simulated.** The panel
 *      falls back to the deterministic explanation the engine can derive on its
 *      own, clearly labelled as such.
 */

import { type ExperimentResult } from '../lib/experiment';
import { analyseSensitivity } from '../lib/advisor';
import { buildObservations } from '../lib/report';
import { formatLatency, formatRate } from '../lib/performance';
import { architectureById } from '../lib/nn/jscc';
import { generate, isCopilotAvailable } from './aiClient';

export const SYSTEM_INSTRUCTION = `You are the 6G Network Copilot inside a teaching laboratory for AI-driven 6G communication systems.

Your job is to help a learner understand results that have ALREADY been computed by the lab's simulation engine, and which are supplied to you in the CONTEXT block.

Rules you must follow without exception:
1. NEVER invent, estimate or extrapolate an experimental result. Every number you state must appear verbatim in the CONTEXT. If a learner asks for a quantity that is not in the CONTEXT, say that the experiment did not measure it and tell them which control would produce it.
2. NEVER claim that any result has been validated against a real network, real hardware or a real deployment. These are simulation outputs from educational models. Say so whenever the distinction matters.
3. NEVER make an engineering decision on the learner's behalf. Explain the trade-off, name what each option costs, and leave the choice with them.
4. If the CONTEXT contradicts what you expect from the literature, say so plainly and suggest what the learner should check. Do not quietly restate the textbook answer.
5. Be concise. Two or three short paragraphs, or a short list. Use the learner's units.

You may explain physics, define terms, interpret the supplied numbers, and describe what would change if a parameter moved. You may reference published work by name.`;

/** Everything the model is allowed to see, and the only numbers it may quote. */
export function buildContext(result: ExperimentResult): string {
  const { config, link, measured, throughput, latency, energy, quality } = result;
  const lines: string[] = [];

  lines.push(`EXPERIMENT: ${result.experimentId}`);
  lines.push(`SEED: ${config.seed}`);
  lines.push('');
  lines.push('CONFIGURATION');
  lines.push(`- Carrier frequency: ${(config.communication.frequencyHz / 1e9).toFixed(1)} GHz`);
  lines.push(`- System bandwidth: ${(config.communication.bandwidthHz / 1e6).toFixed(0)} MHz`);
  lines.push(`- Users sharing the band: ${config.communication.users}`);
  lines.push(`- Bandwidth per user: ${(link.perUserBandwidthHz / 1e6).toFixed(1)} MHz`);
  lines.push(`- Distance: ${config.communication.distanceM} m`);
  lines.push(`- Transmit power: ${config.communication.txPowerDbm} dBm`);
  lines.push(`- Receiver noise figure: ${config.communication.noiseFigureDb} dB`);
  lines.push(`- Environment: ${config.communication.conditionId}`);
  if (config.irs.enabled) {
    lines.push(`- IRS elements: ${config.irs.elementCount}`);
    lines.push(`- IRS reflection amplitude: ${config.irs.reflectionCoefficient.toFixed(2)}`);
    lines.push(`- IRS phase control bits: ${config.irs.phaseBits}`);
  } else {
    lines.push('- No reconfigurable surface in this run.');
  }

  lines.push('');
  lines.push('MEASURED RESULTS');
  lines.push(`- Noise floor: ${link.noiseFloorDbm.toFixed(1)} dBm`);
  lines.push(`- SNR without the surface (direct path alone): ${link.directSnrDb.toFixed(2)} dB`);
  if (link.irsSnrDb !== null) {
    lines.push(`- SNR with the surface (combined channel h_d + cascade): ${link.irsSnrDb.toFixed(2)} dB`);
    lines.push(`- Contribution of the surface: ${(link.surfaceGainDb ?? 0).toFixed(2)} dB`);
  }
  lines.push(`- Operating SNR: ${link.servingSnrDb.toFixed(2)} dB`);
  lines.push(`- Modulation selected: ${measured.modulation?.name ?? 'none (outage)'}`);
  lines.push(`- Measured bit error rate: ${measured.ber.toExponential(3)} (counted over ${measured.bitsSent} bits)`);
  lines.push(`- Closed-form AWGN BER at this SNR: ${measured.theoreticalBer.toExponential(3)}`);
  lines.push(`- Block error rate: ${(measured.bler * 100).toFixed(2)}%`);
  lines.push(`- Error vector magnitude: ${measured.evmPercent.toFixed(2)}%`);
  lines.push(`- Signal quality grade: ${quality.grade}`);
  lines.push(`- Shannon capacity: ${formatRate(throughput.capacityBps)}`);
  lines.push(`- Achieved goodput: ${formatRate(throughput.goodputBps)}`);
  lines.push(`- One-way latency: ${formatLatency(latency.totalMs)} (retransmission ${formatLatency(latency.retransmissionMs)})`);
  lines.push(`- Expected transmissions per packet: ${latency.expectedTransmissions.toFixed(2)}`);
  lines.push(`- Total power: ${energy.totalW.toFixed(2)} W (surface ${energy.surfaceW.toFixed(2)} W)`);
  lines.push(`- Energy efficiency: ${energy.megabitsPerJoule.toFixed(1)} Mbit/J`);

  lines.push('');
  lines.push('ELEMENT SWEEP (SNR in dB)');
  for (const point of result.elementSweep) {
    lines.push(`- N=${point.elements}: aligned ${point.aligned} dB, random ${point.random} dB, direct ${point.direct} dB`);
  }

  if (result.optimisers) {
    lines.push('');
    lines.push('OPTIMISER COMPARISON (equal evaluation budget)');
    for (const entry of result.optimisers) {
      lines.push(`- ${entry.label}: ${entry.bestSnrDb.toFixed(2)} dB after ${entry.evaluations} evaluations`);
    }
  }

  if (result.semantic) {
    const s = result.semantic;
    lines.push('');
    lines.push('SEMANTIC TRANSMISSION');
    lines.push(`- Architecture: ${architectureById(s.config.architecture).label}`);
    lines.push(`- Channel uses: ${s.budget.channelUses} (bandwidth ratio ${s.budget.bandwidthRatio.toFixed(4)})`);
    lines.push(`- Neural PSNR: ${s.aggregate.neuralPsnrDb.toFixed(2)} dB, SSIM ${s.aggregate.neuralSsim.toFixed(4)}`);
    lines.push(`- Classical PSNR: ${s.aggregate.classicalPsnrDb.toFixed(2)} dB, SSIM ${s.aggregate.classicalSsim.toFixed(4)}`);
    lines.push(`- Classical blocks lost entirely: ${(s.aggregate.classicalLossRate * 100).toFixed(1)}%`);
  }

  if (result.architectureSweep) {
    lines.push('');
    lines.push('ARCHITECTURE SWEEP (reconstruction PSNR in dB)');
    for (const point of result.architectureSweep) {
      lines.push(
        `- ${point.snrDb} dB: CNN ${point.cnn ?? '—'}, Transformer ${point.transformer ?? '—'}, Dense ${point.mlp ?? '—'}, Classical ${point.classical ?? '—'}`,
      );
    }
  }

  if (result.users) {
    lines.push('');
    lines.push('PER-USER ALLOCATION');
    for (const user of result.users) {
      lines.push(
        `- User ${user.index} at ${user.distanceM} m: ${user.snrDb} dB, ${user.modulation?.name ?? 'outage'}, ${formatRate(user.goodputBps)}`,
      );
    }
    if (result.fairness !== undefined) lines.push(`- Jain fairness: ${result.fairness.toFixed(3)}`);
  }

  lines.push('');
  lines.push('STATED LIMITATIONS OF THIS RUN');
  for (const note of result.notes) lines.push(`- ${note}`);

  const sensitivity = analyseSensitivity(result.config);
  if (sensitivity.suggestions.length > 0) {
    lines.push('');
    lines.push('COMPUTED PARAMETER SENSITIVITY (each change evaluated by the engine)');
    for (const suggestion of sensitivity.suggestions) {
      lines.push(
        `- ${suggestion.change}: ${suggestion.deltaSnrDb >= 0 ? '+' : ''}${suggestion.deltaSnrDb.toFixed(2)} dB SNR, ${suggestion.deltaRateBps >= 0 ? '+' : ''}${formatRate(Math.abs(suggestion.deltaRateBps))} rate. Cost: ${suggestion.cost}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Numbers a reply may contain without being flagged.
 *
 * Deliberately permissive about small integers and years — a model writing
 * "Wu and Zhang, 2019" or "6 dB per doubling" is quoting the literature, not
 * inventing a result. What matters is a decimal figure or a large number that
 * looks like a measurement and is not in the context.
 */
const ALWAYS_ALLOWED = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '16', '20', '32', '64', '100',
  '128', '256', '1948', '1992', '2004', '2016', '2019', '38.901', '6.02', '3.01', '1.2', '0.5',
]);

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;

/**
 * Flags figures in a reply that do not appear in the context.
 *
 * A heuristic, not a proof: a model restating "12.35 dB" as "about 12 dB" will
 * be flagged, and a fabricated "3" will not. It exists to catch the failure
 * that matters — a confident, specific, invented measurement — and the UI
 * presents it as a prompt to check rather than as a verdict.
 */
export function auditNumbers(reply: string, context: string): string[] {
  const contextNumbers = new Set(context.match(NUMBER_PATTERN) ?? []);
  // Also allow the rounded forms of every context number, since a reply that
  // says "12.4 dB" for a context value of "12.35 dB" is rounding, not inventing.
  for (const value of [...contextNumbers]) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    contextNumbers.add(numeric.toFixed(0));
    contextNumbers.add(numeric.toFixed(1));
    contextNumbers.add(numeric.toFixed(2));
    contextNumbers.add(String(Math.round(numeric)));
  }

  const flagged = new Set<string>();
  for (const match of reply.match(NUMBER_PATTERN) ?? []) {
    if (contextNumbers.has(match) || ALWAYS_ALLOWED.has(match)) continue;
    const numeric = Number(match);
    if (!Number.isFinite(numeric)) continue;
    // Only decimals and large values look like measurements.
    const looksLikeMeasurement = match.includes('.') || Math.abs(numeric) >= 1000;
    if (looksLikeMeasurement) flagged.add(match);
  }
  return [...flagged];
}

export type CopilotSource = 'gateway' | 'engine';

export interface CopilotReply {
  text: string;
  source: CopilotSource;
  unverifiedNumbers: string[];
}

export const SUGGESTED_PROMPTS = [
  'Explain this result in plain language.',
  'Why is the measured bit error rate different from the theoretical one?',
  'Which parameter should I change first, and what does it cost?',
  'Write a two-paragraph summary of this experiment for my report.',
  'What would happen if I doubled the number of reflecting elements?',
  'What does this experiment not model?',
] as const;

/**
 * The deterministic explanation, used when no gateway is configured.
 *
 * This is not a fake assistant. It is the engine's own reading of its own
 * numbers — the same conditional observations the report uses — presented as
 * what it is. A learner with no gateway still gets a correct explanation of
 * every result; what they do not get is a conversation.
 */
export function explainWithEngine(result: ExperimentResult): CopilotReply {
  const observations = buildObservations(result);
  const sensitivity = analyseSensitivity(result.config);
  const top = sensitivity.suggestions.slice(0, 3);

  const text = [
    '**Reading of this run, derived directly from its measurements.**',
    '',
    ...observations.map((line) => `- ${line}`),
    '',
    ...(top.length > 0
      ? [
          '**Largest measured levers from here** — each was applied to the configuration and the link recomputed:',
          '',
          ...top.map(
            (suggestion) =>
              `- ${suggestion.change}: ${suggestion.deltaSnrDb >= 0 ? '+' : ''}${suggestion.deltaSnrDb.toFixed(1)} dB. ${suggestion.reason} Cost: ${suggestion.cost.toLowerCase()}`,
          ),
          '',
        ]
      : []),
    '_No language-model gateway is configured for this deployment, so the conversational Copilot is unavailable. The explanation above is generated by the simulation engine from the measured values and contains no model-written text._',
  ].join('\n');

  return { text, source: 'engine', unverifiedNumbers: [] };
}

/** Asks the Copilot about a result. Falls back to the engine explanation. */
export async function askCopilot(
  question: string,
  result: ExperimentResult,
  signal?: AbortSignal,
): Promise<CopilotReply> {
  if (!isCopilotAvailable()) return explainWithEngine(result);

  const context = buildContext(result);
  const prompt = `CONTEXT — the results of the experiment the learner is looking at. These are simulation outputs, already computed. Do not recompute them and do not introduce figures that are not here.

<context>
${context}
</context>

LEARNER'S QUESTION:
${question}`;

  const text = await generate({ prompt, systemInstruction: SYSTEM_INSTRUCTION, signal });
  return { text, source: 'gateway', unverifiedNumbers: auditNumbers(text, context) };
}

export { isCopilotAvailable };
