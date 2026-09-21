// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runSemantic } from '../lib/semantic';
import { transmitClassical, dct2, idct2, ZIGZAG } from '../lib/classical';
import { QPSK, BPSK } from '../lib/modulation';
import { IMAGE_PIXELS, generateDataset, makeRng } from '../lib/sources';
import { generateDatasetRows, DEFAULT_DATASET_OPTIONS } from '../lib/datasets';

/**
 * The separation baseline, and the comparison it anchors.
 *
 * DeepJSCC is only interesting relative to a baseline that is implemented
 * honestly, so the properties that make the comparison trustworthy are pinned
 * here rather than left to inspection of a chart.
 */

describe('the DCT', () => {
  it('round-trips an image to within floating-point error', () => {
    const scene = generateDataset(1, 4242)[0]!;
    const back = idct2(dct2(scene.pixels));
    for (let i = 0; i < IMAGE_PIXELS; i += 1) {
      expect(back[i]!).toBeCloseTo(scene.pixels[i]!, 9);
    }
  });

  it('scans every coefficient exactly once, low frequencies first', () => {
    expect(new Set(ZIGZAG).size).toBe(IMAGE_PIXELS);
    expect(ZIGZAG[0]).toBe(0); // DC leads the scan.
  });

  it('concentrates energy in the leading coefficients', () => {
    // The premise of transform coding. If this fails, keeping the first K
    // coefficients is not a compression scheme at all.
    const scene = generateDataset(1, 99)[0]!;
    const coefficients = dct2(scene.pixels);
    const leading = ZIGZAG.slice(0, 16).reduce((sum, i) => sum + coefficients[i]! ** 2, 0);
    const total = coefficients.reduce((sum, c) => sum + c * c, 0);
    // 16 of 256 coefficients — 6% of them — carry ~88% of the energy.
    expect(leading / total).toBeGreaterThan(0.85);
  });
});

describe('the coded link', () => {
  it('charges errors over the same codeword it grants correction capacity for', () => {
    /*
     * The decoder corrects up to ⌊n(1−R)/2⌋ errors in an n-bit codeword. Only
     * the payload used to be pushed through the channel, so a quarter of the
     * codeword was repaired for free and the baseline was flattered.
     *
     * The observable consequence: at an SNR bad enough to break the code, the
     * block must actually be lost.
     */
    const scene = generateDataset(1, 7)[0]!;
    const terrible = transmitClassical(
      scene.pixels,
      { modulation: QPSK, channelUses: 32, codeRate: 0.75, snrDb: -12, importance: 0 },
      makeRng(11),
    );
    expect(terrible.rawBitErrors).toBeGreaterThan(terrible.correctionCapacity);
    expect(terrible.blockLost).toBe(true);
    // Flat grey is what a receiver with nothing has to show.
    expect(terrible.image.every((v) => v === 0.5)).toBe(true);
  });

  it('recovers the block on a clean channel', () => {
    const scene = generateDataset(1, 7)[0]!;
    const clean = transmitClassical(
      scene.pixels,
      { modulation: QPSK, channelUses: 32, codeRate: 0.75, snrDb: 30, importance: 0 },
      makeRng(11),
    );
    expect(clean.blockLost).toBe(false);
    expect(clean.image.every((v) => v === 0.5)).toBe(false);
  });
});

describe('the classical curve across SNR', () => {
  const GRID = [-5, -2, 1, 4, 7, 10, 13, 16, 20, 25];

  it('never gets worse as the channel gets better', async () => {
    /*
     * This is the regression that motivated the test. The outage fallback
     * handed a link below the BPSK threshold a QPSK constellation and six DCT
     * coefficients, while a link just ABOVE the threshold correctly selected
     * BPSK and could afford one — so reconstruction quality fell 1.94 dB as
     * the SNR rose from 4 dB to 7 dB, and the architecture-comparison chart
     * had a kink in it that no physics accounted for.
     */
    let previous = Number.NEGATIVE_INFINITY;
    const curve: { snrDb: number; psnr: number }[] = [];
    for (const snrDb of GRID) {
      const run = await runSemantic({
        architecture: 'cnn',
        channelUses: 32,
        snrDb,
        importance: 0.5,
        codeRate: 0.75,
        sceneSeed: 20260921,
        sampleCount: 16,
      });
      const psnr = run.aggregate.classicalPsnrDb;
      curve.push({ snrDb, psnr });
      expect(
        psnr,
        `classical PSNR fell from ${previous.toFixed(2)} dB to ${psnr.toFixed(2)} dB when the SNR improved to ${snrDb} dB — curve: ${JSON.stringify(curve)}`,
      ).toBeGreaterThan(previous - 0.2);
      previous = psnr;
    }
  }, 180_000);

  it('loses whole blocks at the bottom of the range and none at the top', async () => {
    const shared = {
      architecture: 'cnn' as const,
      channelUses: 32,
      importance: 0.5,
      codeRate: 0.75,
      sceneSeed: 20260921,
      sampleCount: 16,
    };
    const bad = await runSemantic({ ...shared, snrDb: -5 });
    const good = await runSemantic({ ...shared, snrDb: 20 });
    // The cliff: nothing arrives below threshold, everything above it.
    expect(bad.aggregate.classicalLossRate).toBeGreaterThan(0.3);
    expect(good.aggregate.classicalLossRate).toBe(0);
    // The neural path has no equivalent failure mode at either end.
    expect(bad.aggregate.neuralPsnrDb).toBeGreaterThan(bad.aggregate.classicalPsnrDb);
  }, 120_000);

  it('reports outage rather than silently assuming a modulation it cannot run', async () => {
    const run = await runSemantic({
      architecture: 'cnn',
      channelUses: 32,
      snrDb: 0,
      importance: 0,
      codeRate: 0.75,
      sceneSeed: 5,
      sampleCount: 4,
    });
    expect(run.budget.inOutage).toBe(true);
    // The weakest entry in the table, never a stronger one.
    expect(run.budget.modulation.name).toBe(BPSK.name);
  }, 60_000);
});

describe('generated datasets', () => {
  it('produces the number of rows that was asked for', async () => {
    // The semantic generator built one row per returned sample, and `samples`
    // is capped at four for display — so every request above 84 rows silently
    // returned 84.
    for (const id of ['wireless-channel', 'irs-optimisation', 'semantic'] as const) {
      const dataset = await generateDatasetRows(id, { ...DEFAULT_DATASET_OPTIONS, rows: 120 });
      expect(dataset.rows.length, `${id} returned ${dataset.rows.length} rows instead of 120`).toBe(120);
    }
  }, 180_000);

  it('stamps every export with its provenance', async () => {
    const dataset = await generateDatasetRows('irs-optimisation', {
      ...DEFAULT_DATASET_OPTIONS,
      rows: 5,
    });
    const { toCsv, toJson } = await import('../lib/datasets');
    expect(toCsv(dataset)).toContain('SIMULATED DATA');
    expect(toCsv(dataset)).toContain(`seed=${dataset.options.seed}`);
    expect(JSON.parse(toJson(dataset)).disclaimer).toContain('SIMULATED DATA');
  });
});
