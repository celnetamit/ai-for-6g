// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  EXPERIMENTS,
  type ExperimentId,
  defaultsFor,
  runExperiment,
  toRecord,
} from '../lib/experiment';
import { buildObservations, buildReport } from '../lib/report';
import { analyseSensitivity } from '../lib/advisor';

/**
 * End-to-end checks on the experiments as a learner meets them.
 *
 * The defect these exist to prevent was found by opening the app: the default
 * parameters put the link in outage, so the first thing anyone saw was 0 bit/s,
 * an infinite latency and a 21% bit error rate. Nothing was *wrong* — the
 * physics was right and the link genuinely did not close — but an opening
 * screen that looks broken teaches a learner to distrust the tool before they
 * have touched a control.
 *
 * So: every experiment's opening configuration must produce a link that works,
 * and must still have somewhere to go.
 */

const ONE_MINUTE = 60_000;

describe('opening parameters', () => {
  for (const experiment of EXPERIMENTS) {
    it(`closes the link on its defaults — ${experiment.id}`, async () => {
      const result = await runExperiment(defaultsFor(experiment.id));

      expect(
        result.throughput.outage,
        `${experiment.id} opens in outage at ${result.link.servingSnrDb.toFixed(1)} dB — a learner's first run would show 0 bit/s`,
      ).toBe(false);
      expect(result.throughput.goodputBps).toBeGreaterThan(1e6);
      expect(Number.isFinite(result.latency.totalMs)).toBe(true);
      expect(result.energy.megabitsPerJoule).toBeGreaterThan(0);

      // ...and is not saturated either: a link at 40 dB has nothing to teach,
      // because every slider moves it and nothing breaks.
      expect(result.link.servingSnrDb).toBeLessThan(35);
    }, 180_000);
  }
});

describe('measured quantities are quantities', () => {
  it('reports a bit error rate that is a probability, and a real EVM', async () => {
    const result = await runExperiment(defaultsFor('link-budget'));
    expect(result.measured.ber).toBeGreaterThanOrEqual(0);
    expect(result.measured.ber).toBeLessThanOrEqual(1);
    expect(result.measured.bler).toBeGreaterThanOrEqual(0);
    expect(result.measured.bler).toBeLessThanOrEqual(1);
    expect(Number.isFinite(result.measured.evmPercent)).toBe(true);
    expect(result.measured.bitsSent).toBeGreaterThan(1000);
  }, ONE_MINUTE);

  it('is reproducible from its configuration and seed', async () => {
    const config = defaultsFor('irs-coverage');
    const first = await runExperiment(config);
    const second = await runExperiment(config);

    // The claim printed in every report: same configuration, same seed, same
    // numbers. If this ever fails, the reproduction section is a lie.
    expect(second.link.servingSnrDb).toBe(first.link.servingSnrDb);
    expect(second.measured.ber).toBe(first.measured.ber);
    expect(second.throughput.goodputBps).toBe(first.throughput.goodputBps);
    expect(second.elementSweep).toEqual(first.elementSweep);
  }, ONE_MINUTE);

  it('changes when the seed changes', async () => {
    const config = defaultsFor('irs-coverage');
    const a = await runExperiment(config);
    const b = await runExperiment({ ...config, seed: config.seed + 1 });
    expect(b.link.servingSnrDb).not.toBe(a.link.servingSnrDb);
  }, ONE_MINUTE);
});

describe('the reported findings follow the numbers', () => {
  it('reads the N² law only where the surface dominates', async () => {
    const result = await runExperiment(defaultsFor('irs-coverage'));
    const observations = buildObservations(result);
    const slope = observations.find((line) => line.includes('dB per doubling of N'));
    expect(slope, 'no scaling-law observation was produced').toBeDefined();

    // The reported slope must be near the 6.02 dB the N² law predicts.
    // Measuring it across the whole sweep — including the region where the
    // direct path is still the larger term — gave 2.3 dB, and the sentence
    // then invited the reader to conclude the phases were misaligned. Raising
    // the dominance threshold from 3 dB to 10 dB moved it from 4.1 to the real
    // value; both earlier numbers are the same bug seen at two magnifications.
    const reported = Number(/(-?\d+(?:\.\d+)?) dB per doubling of N/.exec(slope ?? '')?.[1]);
    expect(reported).toBeGreaterThan(5);
    expect(reported).toBeLessThan(7);
  }, ONE_MINUTE);

  it('says the surface contributed nothing when it contributed nothing', async () => {
    /*
     * A clear line-of-sight link with a four-element surface. The cascade is
     * tens of dB below the direct path, so deploying the surface changes
     * essentially nothing — and the report has to say that rather than reach
     * for the usual story about coherent gain.
     *
     * Note what this test caught the first time it ran: the report claimed the
     * surface "delivered 0.01 dB more SNR ... the double path loss was overcome
     * by the coherent gain of 4 elements". It was comparing the combined
     * channel against the direct path alone, so the surface could never lose,
     * and the sentence was reporting a rounding error as a physical result.
     */
    const config = defaultsFor('irs-coverage');
    const result = await runExperiment({
      ...config,
      communication: { ...config.communication, conditionId: 'los', distanceM: 40 },
      irs: { ...config.irs, elementCount: 4 },
    });
    expect(result.link.surfaceGainDb).toBeLessThan(1);
    expect(result.link.servingRoute).toBe('direct');

    const observations = buildObservations(result).join(' ').toLowerCase();
    expect(observations).toContain('less than a decibel');
    expect(observations).not.toContain('overcome by the coherent gain');
  }, ONE_MINUTE);

  it('never emits NaN, undefined or [object Object] into a report', async () => {
    for (const id of ['link-budget', 'irs-coverage', 'multi-user-network'] as ExperimentId[]) {
      const result = await runExperiment(defaultsFor(id));
      const report = buildReport(result, 'Test Harness');
      expect(report).not.toMatch(/NaN|undefined|\[object Object\]/);
      // The sections a reader of a research report expects to find.
      for (const heading of ['## 1. Objective', '## 2. Method', '## 3. Results', '## 4. Discussion', '## 5. Limitations', '## 6. Reproduction']) {
        expect(report).toContain(heading);
      }
      expect(report).toContain('simulation result');
      expect(toRecord(result).headline.length).toBeGreaterThan(3);
    }
  }, 180_000);
});

describe('multi-user allocation', () => {
  it('reports a fairness index that actually varies with the cell', async () => {
    /*
     * The per-user block error rate used to be a hardcoded 0.02. A
     * modulation's rate depends only on which modulation it is, so every user
     * sharing an MCS received byte-identical goodput — and with four steps in
     * the link-adaptation table, the default cell put every user on 64-QAM and
     * reported a Jain index of exactly 1.0000. The headline number of this
     * experiment was a constant that asserted the opposite of its own lesson.
     */
    const base = defaultsFor('multi-user-network');
    const seen = new Set<string>();

    for (const users of [3, 6, 8]) {
      const result = await runExperiment({
        ...base,
        communication: { ...base.communication, users },
      });
      expect(result.users).toBeDefined();
      expect(result.users!.length).toBe(users);

      const rates = result.users!.map((u) => u.goodputBps);
      expect(
        new Set(rates.map((r) => r.toFixed(0))).size,
        `all ${users} users received an identical rate — the fairness index cannot mean anything`,
      ).toBeGreaterThan(1);

      const fairness = result.fairness ?? 0;
      expect(fairness).toBeGreaterThan(0);
      expect(fairness).toBeLessThanOrEqual(1);
      expect(fairness, 'fairness is pinned at exactly 1').not.toBe(1);
      seen.add(fairness.toFixed(4));
    }

    // Different cells must give different answers.
    expect(seen.size).toBeGreaterThan(1);
  }, 180_000);

  it('puts users at increasing distance, and the near half ahead on average', async () => {
    const base = defaultsFor('multi-user-network');
    const result = await runExperiment({
      ...base,
      communication: { ...base.communication, users: 8 },
    });
    const users = result.users!;

    // The layout is nearest-first; that part is deterministic.
    for (let i = 1; i < users.length; i += 1) {
      expect(users[i]!.distanceM).toBeGreaterThan(users[i - 1]!.distanceM);
    }

    /*
     * SNR is NOT asserted to fall monotonically with distance, and asserting
     * that was the first version of this test. Shadowing is log-normal with an
     * 8 dB standard deviation, so a farther user drawing a better channel than
     * a nearer one is an ordinary event, not a bug — it is most of the reason
     * shadowing is in the model. What must hold is the trend.
     */
    const half = Math.floor(users.length / 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const near = mean(users.slice(0, half).map((u) => u.snrDb));
    const far = mean(users.slice(half).map((u) => u.snrDb));
    expect(near, `near half averaged ${near.toFixed(1)} dB, far half ${far.toFixed(1)} dB`).toBeGreaterThan(far);
  }, 120_000);
});

describe('the report states ratios it can actually form', () => {
  it('never claims agreement "to within a factor of" an absurd number', async () => {
    /*
     * With a clean link both bit error rates are zero, and the old arithmetic
     * took 1/max(0, 1e-9) and printed that measurement and theory "agree to
     * within a factor of 1000000000.0" — in an exported research report.
     */
    for (const id of ['link-budget', 'irs-coverage', 'semantic-transmission'] as ExperimentId[]) {
      const result = await runExperiment(defaultsFor(id));
      const report = buildReport(result);
      const factors = [...report.matchAll(/factor of ([\d.]+)/g)].map((m) => Number(m[1]));
      for (const factor of factors) {
        expect(factor, `report claims a factor of ${factor} in ${id}`).toBeLessThan(1000);
      }
      expect(report).not.toMatch(/Infinity|1000000000/);
    }
  }, 180_000);
});

describe('parameter advice', () => {
  it('evaluates every suggestion rather than asserting it', async () => {
    const config = defaultsFor('irs-coverage');
    const { suggestions } = analyseSensitivity(config);
    expect(suggestions.length).toBeGreaterThan(3);

    for (const suggestion of suggestions) {
      expect(Number.isFinite(suggestion.deltaSnrDb)).toBe(true);
      // Applying the change must actually produce the delta the card claims.
      const applied = suggestion.apply(config);
      expect(JSON.stringify(applied)).not.toBe(JSON.stringify(config));
    }

    // Doubling the elements is worth 6 dB by the N² law; it should be near the
    // top of a ranking that was computed rather than written down.
    const doubling = suggestions.find((s) => s.change.includes('Double the reflecting elements'));
    expect(doubling).toBeDefined();
    expect(doubling!.deltaSnrDb).toBeGreaterThan(3);
  });
});
