/**
 * Research-report generation (spec §10.10, §11).
 *
 * The report is assembled from the result object by this file alone. No
 * language model is involved in producing a single number, a table or a
 * finding, and that is deliberate: a report is the artefact a learner is most
 * likely to quote elsewhere, and the one place where a fluent invented
 * sentence would do the most damage. The Copilot can add a commentary section
 * *alongside* this text, clearly attributed, but it never writes the results.
 *
 * The observations in the discussion are conditionals over measured values —
 * "the surface exceeded the direct path by X dB" is emitted because
 * `irsSnrDb − directSnrDb` was computed and is positive, not because it is the
 * expected outcome.
 */

import {
  type ExperimentResult,
  experimentById,
} from './experiment';
import { CHANNEL_CONDITIONS } from './signalModel';
import { formatLatency, formatRate } from './performance';
import { architectureById } from './nn/jscc';
import { optimizerById } from './optimizers';

const db = (value: number): string => `${value.toFixed(2)} dB`;

/**
 * Thousands grouping for a document that leaves this machine.
 *
 * `toLocaleString()` with no locale follows the runtime's, which renders
 * 163840 as "1,63,840" under an Indian locale. That is correct for the reader
 * who generated it and confusing for everyone they send it to, so an exported
 * report pins the grouping while the on-screen tiles stay locale-aware.
 */
const grouped = (value: number): string => new Intl.NumberFormat('en-GB').format(value);
const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

const berText = (value: number): string =>
  value < 1e-4 ? value.toExponential(2) : pct(value);

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

/** Builds the full markdown report for one experiment result. */
export function buildReport(result: ExperimentResult, author?: string): string {
  const meta = experimentById(result.experimentId);
  const { config, link, measured, throughput, latency, energy, quality } = result;
  const condition =
    CHANNEL_CONDITIONS.find((c) => c.id === config.communication.conditionId) ??
    CHANNEL_CONDITIONS[1]!;

  const sections: string[] = [];

  sections.push(`# ${meta.title}

**Experiment report — simulated results**

| | |
| --- | --- |
| Run identifier | \`${result.id}\` |
| Executed | ${new Date(result.startedAt).toLocaleString()} |
| Wall-clock duration | ${(result.durationMs / 1000).toFixed(2)} s |
| Random seed | \`${config.seed}\` |
${author ? `| Prepared by | ${author} |\n` : ''}
> Every figure in this report was produced by the simulation engine of the AI
> for 6G Virtual Live Lab. Nothing here is a measurement of a physical network,
> and none of it has been validated against deployed hardware.`);

  sections.push(`## 1. Objective

${meta.question}

${meta.summary}`);

  sections.push(`## 2. Method

### 2.1 Communication parameters

${table(
  ['Parameter', 'Value'],
  [
    ['Carrier frequency', `${(config.communication.frequencyHz / 1e9).toFixed(1)} GHz`],
    ['System bandwidth', `${(config.communication.bandwidthHz / 1e6).toFixed(0)} MHz`],
    ['Users sharing the band', config.communication.users],
    ['Bandwidth per user', `${(link.perUserBandwidthHz / 1e6).toFixed(1)} MHz`],
    ['Transmitter–receiver separation', `${config.communication.distanceM} m`],
    ['Transmit power', `${config.communication.txPowerDbm} dBm`],
    ['Receiver noise figure', `${config.communication.noiseFigureDb} dB`],
    ['Propagation environment', condition.label],
    ['Rician K-factor', Number.isFinite(condition.ricianKDb) ? `${condition.ricianKDb} dB` : 'Rayleigh (no specular path)'],
    ['Path-loss exponent', condition.pathLossExponent],
    ['Shadowing σ', `${condition.shadowingSigmaDb} dB`],
    ['Noise floor', `${link.noiseFloorDbm.toFixed(1)} dBm`],
  ],
)}

### 2.2 Reconfigurable surface

${
  config.irs.enabled
    ? table(
        ['Parameter', 'Value'],
        [
          ['Reflecting elements', config.irs.elementCount],
          ['Reflection amplitude β', config.irs.reflectionCoefficient.toFixed(2)],
          ['Phase control', config.irs.phaseBits > 0 ? `${config.irs.phaseBits} bit (${1 << config.irs.phaseBits} states)` : 'Continuous'],
          ['Transmitter → surface', `${link.txToSurfaceM.toFixed(1)} m`],
          ['Surface → receiver', `${link.surfaceToRxM.toFixed(1)} m`],
        ],
      )
    : 'No reconfigurable surface was used in this run.'
}

### 2.3 Models

The channel follows \`Y = HX + N\` with block fading: one complex channel draw
per block, Rician with the K-factor above. The surface applies
\`y = (h_rᵀ Φ h_t + h_d)x + n\` with \`Φ = diag(β e^{jθ₁} … β e^{jθ_N})\`.
Capacity is \`C = B·log₂(1 + SNR)\`; the achieved rate is the highest modulation
and coding scheme the SNR sustains, after a 14% physical-layer overhead and the
measured block error rate.

Bit errors were **counted** over ${grouped(measured.bitsSent)} transmitted
bits rather than read from a formula. The closed-form AWGN curve is reported
beside the count so the two can be compared.`);

  const performanceRows: (string | number)[][] = [
    ['SNR without the surface (direct path alone)', db(link.directSnrDb)],
  ];
  if (link.irsSnrDb !== null) {
    performanceRows.push(['SNR with the surface (combined channel)', db(link.irsSnrDb)]);
    performanceRows.push(['Contribution of the surface', db(link.surfaceGainDb ?? 0)]);
  }
  performanceRows.push(
    [
      'Dominant contribution',
      link.servingRoute === 'irs'
        ? 'The reconfigurable surface'
        : 'The direct path (the surface adds under 1 dB)',
    ],
    ['Operating SNR', db(link.servingSnrDb)],
    ['Modulation selected', measured.modulation?.name ?? 'Outage — no modulation closes'],
    ['Measured bit error rate', berText(measured.ber)],
    ['Closed-form AWGN BER at this SNR', berText(measured.theoreticalBer)],
    ['Block error rate', pct(measured.bler)],
    ['Error vector magnitude', `${measured.evmPercent.toFixed(2)}%`],
    ['Signal quality grade', quality.grade],
    ['Shannon capacity', formatRate(throughput.capacityBps)],
    ['Achieved goodput', formatRate(throughput.goodputBps)],
    ['One-way latency', formatLatency(latency.totalMs)],
    ['  of which retransmission', formatLatency(latency.retransmissionMs)],
    ['Expected transmissions per packet', latency.expectedTransmissions.toFixed(2)],
    ['Residual packet loss after HARQ', pct(latency.residualLossProbability)],
    ['Total power consumed', `${energy.totalW.toFixed(2)} W`],
    ['Energy efficiency', `${energy.megabitsPerJoule.toFixed(1)} Mbit/J`],
  );

  sections.push(`## 3. Results

### 3.1 Link performance

${table(['Quantity', 'Value'], performanceRows)}

### 3.2 Element scaling

SNR of the combined channel against the number of reflecting elements, with the
phases aligned and with them set at random. Every row uses the same channel
realisation, so the direct-path column is constant and the movement in the other
two is the surface alone.

${table(
  ['Elements', 'Aligned (dB)', 'Random (dB)', 'Direct (dB)'],
  result.elementSweep.map((point) => [point.elements, point.aligned, point.random, point.direct]),
)}`);

  if (result.optimisers) {
    const best = [...result.optimisers].sort((a, b) => b.bestSnrDb - a.bestSnrDb)[0]!;
    const optimum = result.optimisers.find((o) => o.id === 'closed-form');
    sections.push(`### 3.3 Optimiser comparison

Each method searched the same surface with a budget of ${grouped(config.ai.budget)}
channel evaluations and the same starting seed.

${table(
  ['Method', 'Final SNR (dB)', 'Evaluations used', 'Gap to closed form (dB)', 'Wall clock (ms)'],
  result.optimisers.map((entry) => [
    entry.label,
    entry.bestSnrDb.toFixed(2),
    grouped(entry.evaluations),
    optimum ? (optimum.bestSnrDb - entry.bestSnrDb).toFixed(2) : '—',
    entry.elapsedMs,
  ]),
)}

The best-performing search method in this run was **${best.label}**.
${optimizerById(best.id).summary}`);
  }

  if (result.semantic) {
    const s = result.semantic;
    const architecture = architectureById(s.config.architecture);
    sections.push(`### 3.3 Semantic transmission

Both systems received ${s.budget.channelUses} complex channel uses — a bandwidth
ratio of ${s.budget.bandwidthRatio.toFixed(4)} channel uses per source pixel — over
the same channel realisation at ${db(s.config.snrDb)}.

${table(
  ['Metric', `${architecture.label} (DeepJSCC)`, 'Classical DCT + channel coding'],
  [
    ['Peak signal-to-noise ratio', db(s.aggregate.neuralPsnrDb), db(s.aggregate.classicalPsnrDb)],
    ['Structural similarity', s.aggregate.neuralSsim.toFixed(4), s.aggregate.classicalSsim.toFixed(4)],
    [
      `Task-weighted PSNR (importance ${s.config.importance.toFixed(2)})`,
      db(s.aggregate.neuralSemanticDb),
      db(s.aggregate.classicalSemanticDb),
    ],
    ['Blocks lost entirely', '0.00%', pct(s.aggregate.classicalLossRate)],
  ],
)}

The classical path used ${s.budget.modulation.name} and kept
${s.budget.coefficientsKept} DCT coefficients within ${s.budget.classicalPayloadBits}
payload bits.`);
  }

  if (result.architectureSweep) {
    sections.push(`### 3.3 Architecture comparison across SNR

Reconstruction PSNR in dB. Identical scenes and identical noise seeds at every
point.

${table(
  ['SNR (dB)', 'CNN', 'Transformer', 'Dense', 'Classical'],
  result.architectureSweep.map((point) => [
    point.snrDb,
    point.cnn ?? '—',
    point.transformer ?? '—',
    point.mlp ?? '—',
    point.classical ?? '—',
  ]),
)}`);
  }

  if (result.users) {
    sections.push(`### 3.3 Multi-user allocation

${table(
  ['User', 'Distance (m)', 'SNR (dB)', 'Modulation', 'Goodput'],
  result.users.map((user) => [
    user.index,
    user.distanceM,
    user.snrDb,
    user.modulation?.name ?? 'outage',
    formatRate(user.goodputBps),
  ]),
)}

Sum goodput: **${formatRate(result.users.reduce((total, u) => total + u.goodputBps, 0))}**.
Jain fairness index: **${(result.fairness ?? 0).toFixed(3)}** — 1.0 would mean every
user receives the same rate, 1/${result.users.length} would mean one user receives
everything.`);
  }

  sections.push(`## 4. Discussion

${buildObservations(result)
  .map((observation) => `- ${observation}`)
  .join('\n')}`);

  sections.push(`## 5. Limitations

${result.notes.map((note) => `- ${note}`).join('\n')}`);

  sections.push(`## 6. Reproduction

This run is fully determined by its configuration and seed. Re-entering the
parameters in section 2 with seed \`${config.seed}\` reproduces every number
above exactly.

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\``);

  sections.push(`## References

1. C. E. Shannon, "A Mathematical Theory of Communication", *Bell System Technical Journal*, 1948.
2. Q. Wu and R. Zhang, "Intelligent Reflecting Surface Enhanced Wireless Network via Joint Active and Passive Beamforming", *IEEE Transactions on Wireless Communications*, 2019.
3. E. Bourtsoulatze, D. Burth Kurka and D. Gündüz, "Deep Joint Source-Channel Coding for Wireless Image Transmission", *IEEE Transactions on Cognitive Communications and Networking*, 2019.
4. C. Huang, A. Zappone, G. C. Alexandropoulos, M. Debbah and C. Yuen, "Reconfigurable Intelligent Surfaces for Energy Efficiency in Wireless Communication", *IEEE Transactions on Wireless Communications*, 2019.
5. R. J. Williams, "Simple Statistical Gradient-Following Algorithms for Connectionist Reinforcement Learning", *Machine Learning*, 1992.
6. 3GPP TR 38.901, "Study on channel model for frequencies from 0.5 to 100 GHz".`);

  return sections.join('\n\n');
}

/**
 * Findings, each conditional on a measured quantity.
 *
 * Written as explicit branches rather than free text so that the report cannot
 * say something the numbers do not support — if the surface loses, the report
 * says the surface lost.
 */
export function buildObservations(result: ExperimentResult): string[] {
  const observations: string[] = [];
  const { link, measured, throughput, latency, energy, config } = result;

  if (link.irsSnrDb !== null && link.surfaceGainDb !== null) {
    const delta = link.surfaceGainDb;
    observations.push(
      delta >= 3
        ? `Deploying the surface raised the SNR by ${db(delta)}, from ${db(link.directSnrDb)} to ${db(link.irsSnrDb)}. With ${config.irs.elementCount} elements the coherent 20·log₁₀(N) gain more than covered the double free-space loss of the cascaded path.`
        : delta >= 1
          ? `The surface added ${db(delta)} — real, but modest. At ${config.irs.elementCount} elements the cascaded path is close enough to the direct one that the two are comparable, which is the interesting regime: a few more elements would change the answer.`
          : `The surface added **less than a decibel** (${db(delta)}). At ${config.irs.elementCount} elements, over these distances, the cascade pays so much more free-space loss than the direct path that its contribution disappears into the sum. The link is doing what it would do with no surface at all.`,
    );
  }

  /*
   * The slope of the aligned curve is only the N² law where the surface
   * actually dominates the sum. While the direct path is the larger term the
   * total barely moves, so measuring the slope across the whole sweep averages
   * a flat region with a steep one and reports something like 2.3 dB per
   * doubling — which then invites the (wrong) conclusion that the phases are
   * misaligned. The slope is therefore measured only over the points where the
   * surface is at least 3 dB above the direct path.
   */
  // 10 dB, not 3. At 3 dB above the direct path the cascade is only twice the
  // direct term, so the combined SNR is still being dragged by it and the
  // measured slope comes out near 4 dB per doubling — close enough to 3 to be
  // mistaken for the incoherent case. The N² law is a statement about the
  // cascade, and it can only be read where the cascade is the sum.
  const dominated = result.elementSweep.filter((point) => point.aligned > point.direct + 10);
  /*
   * The crossover is where the cascaded path *matches* the direct one. With
   * aligned phases two equal terms add in amplitude, so equal contributions
   * show up as +6 dB on the combined channel, not +3. A +3 dB threshold marks
   * the point where the cascade is still about 8 dB *below* the direct path,
   * and calling that "dominant" would be wrong by an order of magnitude in
   * power.
   */
  const crossover = result.elementSweep.find((point) => point.aligned >= point.direct + 6);

  if (dominated.length >= 2) {
    const first = dominated[0]!;
    const last = dominated[dominated.length - 1]!;
    const doublings = Math.log2(last.elements / first.elements);
    const perDoubling = doublings > 0 ? (last.aligned - first.aligned) / doublings : 0;
    observations.push(
      `Once the surface dominates the sum — from ${first.elements} elements upward — the aligned configuration gains ${perDoubling.toFixed(1)} dB per doubling of N. The N² law predicts 6.02 dB. Below that point the curve is flat because the direct path is still the larger term, not because the phases are wrong.`,
    );
    const randomFirst = dominated[0]!.random;
    const randomLast = dominated[dominated.length - 1]!.random;
    const randomSlope = doublings > 0 ? (randomLast - randomFirst) / doublings : 0;
    observations.push(
      `Over the same range, random phases gained ${randomSlope.toFixed(1)} dB per doubling — the N law, because incoherent terms add in power rather than in amplitude. The gap between the two curves is what choosing the phases is worth.`,
    );
  } else {
    observations.push(
      'Nowhere in the element sweep did the surface rise 10 dB clear of the direct path, so the combined SNR is still partly the direct term everywhere and the N² law cannot be read off this chart. Block the direct path harder, move the surface closer to one end, or add elements, and the region will appear.',
    );
  }

  if (crossover) {
    observations.push(
      `The cascaded path matches the direct one at about ${crossover.elements} elements — two equal terms adding in amplitude, which shows up as +6 dB on the combined channel. Below that the surface's double free-space loss is not covered by its coherent gain, and deploying it changes little.`,
    );
  } else if (result.config.irs.enabled) {
    observations.push(
      'Nowhere in the sweep did the cascaded path match the direct one. With this geometry it pays too much free-space loss for even 256 elements to recover.',
    );
  }

  /*
   * Both bit error rates can be zero — a clean link over a bounded number of
   * bits genuinely produces no errors — and the ratio is then undefined. The
   * previous arithmetic took 1/max(0, 1e-9) and printed that the two "agree to
   * within a factor of 1000000000.0", in an exported report, as a finding.
   * Zero errors is a real result and says its own thing: the run was too short
   * to measure a rate this low.
   */
  const bothClean = measured.ber === 0 && measured.theoreticalBer < 1e-6;
  const ratio =
    measured.theoreticalBer > 0 && measured.ber > 0
      ? measured.ber / measured.theoreticalBer
      : null;

  if (measured.modulation && bothClean) {
    observations.push(
      `No bit errors were counted in ${grouped(measured.bitsSent)} transmitted bits, and the closed form predicts ${berText(measured.theoreticalBer)}. Both are consistent with a link comfortably above threshold; this run is simply too short to measure a rate that low, so the honest statement is that the BER is below ${(1 / measured.bitsSent).toExponential(1)}.`,
    );
  } else if (measured.modulation && ratio !== null) {
    const agreement = Math.max(ratio, 1 / ratio);
    observations.push(
      ratio > 3
        ? `The measured bit error rate (${berText(measured.ber)}) is ${ratio.toFixed(1)}× the closed-form AWGN prediction (${berText(measured.theoreticalBer)}). That gap is fading: the average SNR is the same, but the blocks that drew a deep fade dominate the error count.`
        : `The measured bit error rate (${berText(measured.ber)}) agrees with the closed-form AWGN prediction (${berText(measured.theoreticalBer)}) to within a factor of ${agreement.toFixed(1)}, which is what a channel with little fading should give.`,
    );
  } else if (measured.modulation) {
    observations.push(
      `The measured bit error rate is ${berText(measured.ber)} against a closed-form prediction of ${berText(measured.theoreticalBer)}. One of the two is zero, so no meaningful ratio can be formed between them.`,
    );
  } else {
    observations.push(
      'The link is in outage: even BPSK does not clear its threshold at this SNR, so no modulation was selected and the throughput is zero.',
    );
  }

  if (throughput.capacityBps > 0 && throughput.goodputBps > 0) {
    observations.push(
      `The achieved goodput is ${((throughput.goodputBps / throughput.capacityBps) * 100).toFixed(0)}% of the Shannon bound. The shortfall is the gap between a practical modulation-and-coding scheme and the bound, plus the ${(measured.bler * 100).toFixed(1)}% of blocks that had to be repeated.`,
    );
  }

  if (Number.isFinite(latency.totalMs)) {
    const retransmissionShare = latency.retransmissionMs / latency.totalMs;
    observations.push(
      retransmissionShare > 0.2
        ? `Retransmissions account for ${(retransmissionShare * 100).toFixed(0)}% of the latency budget. At this block error rate the dominant cost is not time on air but waiting for HARQ.`
        : `Latency is dominated by time on air rather than retransmission — the block error rate is low enough that most packets arrive on the first attempt.`,
    );
  }

  if (config.irs.enabled && energy.surfaceW > 0) {
    observations.push(
      `The surface consumes ${energy.surfaceW.toFixed(2)} W of the ${energy.totalW.toFixed(2)} W total — ${((energy.surfaceW / energy.totalW) * 100).toFixed(0)}% — because each element's phase control draws power even though the surface is passive to the signal.`,
    );
  }

  if (result.semantic) {
    const s = result.semantic.aggregate;
    const delta = s.neuralPsnrDb - s.classicalPsnrDb;
    observations.push(
      delta > 0
        ? `At this SNR the trained model reconstructed the scene ${delta.toFixed(1)} dB better than the classical scheme on the same bandwidth, and lost no blocks at all where the classical decoder failed on ${(s.classicalLossRate * 100).toFixed(0)}% of them.`
        : `At this SNR the classical scheme beat the trained model by ${(-delta).toFixed(1)} dB. Above its threshold, separation is efficient — the neural system's advantage is at the bottom of the range, not the top.`,
    );
  }

  if (result.architectureSweep && result.architectureSweep.length > 1) {
    const cliff = result.architectureSweep.find(
      (point, index) =>
        index > 0 &&
        (point.classical ?? 0) - (result.architectureSweep![index - 1]!.classical ?? 0) > 6,
    );
    if (cliff) {
      observations.push(
        `The classical curve gains more than 6 dB of reconstruction quality in a single 3 dB step near ${cliff.snrDb} dB SNR. That is the cliff effect: below the code's threshold the decoder recovers nothing, above it everything.`,
      );
    }
    const best = ['cnn', 'transformer', 'mlp'] as const;
    const lowSnr = result.architectureSweep[0]!;
    const ranked = best
      .map((id) => ({ id, value: lowSnr[id] ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => b.value - a.value);
    observations.push(
      `At the lowest SNR tested (${lowSnr.snrDb} dB) the architectures ranked ${ranked
        .map((entry) => `${architectureById(entry.id).label} (${entry.value.toFixed(1)} dB)`)
        .join(', ')}.`,
    );
  }

  if (result.users && result.fairness !== undefined) {
    observations.push(
      result.fairness < 0.7
        ? `Jain fairness of ${result.fairness.toFixed(3)} means the rate is concentrated on the near users. Equal bandwidth shares do not produce equal rates, because SNR falls with distance.`
        : `Jain fairness of ${result.fairness.toFixed(3)} indicates the users receive comparable rates at this spread of distances.`,
    );
  }

  return observations;
}

/** A plain-text filename stem for the downloaded report. */
export const reportFilename = (result: ExperimentResult): string =>
  `ai-6g-${result.experimentId}-${result.id}`;
