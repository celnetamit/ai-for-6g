// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadModel, loadModelCards } from '../lib/models/loader';
import { ARCHITECTURES, applyChannel, decode, encode, parameterCount } from '../lib/nn/jscc';
import { tensor } from '../lib/nn/autograd';
import { IMAGE_PIXELS, generateDataset, makeRng, packSamples, psnr, ssim } from '../lib/sources';

/**
 * Does the model we ship reproduce the numbers on its card?
 *
 * This is the test that makes the model cards worth reading. Training writes a
 * card; loading decodes int8 weights and rebuilds the architecture from
 * `createModel`. Anything that drifts between those two paths — a reordered
 * parameter list, a changed layer, a quantisation bug, a stale weight file left
 * behind by an interrupted run — produces a model that still runs and still
 * looks plausible, while its published performance is fiction.
 *
 * So the check is the honest one: re-run the card's own evaluation, with the
 * card's own seeds, and require the result to match what the card claims. A
 * tolerance of 0.5 dB covers the int8 round trip; anything larger means the
 * served model is not the model that was measured.
 */

const EVAL_BATCH = 64;

/** Reproduces `evaluate()` from scripts/train-models.ts, seed for seed. */
function measure(
  model: Awaited<ReturnType<typeof loadModel>>,
  card: { trainedOn: { valSamples: number; valSeed: number } },
  channelUses: number,
  snrDb: number,
): { psnrDb: number; ssim: number } {
  const validation = generateDataset(card.trainedOn.valSamples, card.trainedOn.valSeed);
  const packed = packSamples(validation);
  const activeDims = channelUses * 2;
  // The noise seed formula is the training script's; matching it is the point.
  const random = makeRng(991 + Math.round(snrDb * 13) + channelUses * 7);

  let psnrSum = 0;
  let ssimSum = 0;
  let counted = 0;

  for (let start = 0; start + EVAL_BATCH <= validation.length; start += EVAL_BATCH) {
    const x = tensor(EVAL_BATCH, IMAGE_PIXELS);
    for (let row = 0; row < EVAL_BATCH; row += 1) {
      for (let p = 0; p < IMAGE_PIXELS; p += 1) {
        x.data[row * IMAGE_PIXELS + p] = packed[(start + row) * IMAGE_PIXELS + p]!;
      }
    }
    const gains = new Float64Array(EVAL_BATCH).fill(10 ** (snrDb / 10));
    const latent = encode(model, x, EVAL_BATCH, activeDims);
    const received = applyChannel(latent, 0, random, gains, activeDims);
    const output = decode(model, received, EVAL_BATCH);

    for (let row = 0; row < EVAL_BATCH; row += 1) {
      const reference = x.data.slice(row * IMAGE_PIXELS, (row + 1) * IMAGE_PIXELS);
      const reconstruction = output.data.slice(row * IMAGE_PIXELS, (row + 1) * IMAGE_PIXELS);
      const value = psnr(reference, reconstruction);
      psnrSum += Number.isFinite(value) ? value : 60;
      ssimSum += ssim(reference, reconstruction);
      counted += 1;
    }
  }

  return { psnrDb: psnrSum / counted, ssim: ssimSum / counted };
}

describe('shipped model weights', () => {
  it('has a card for every architecture, and no card without weights', async () => {
    const { cards } = await loadModelCards();
    expect(cards.map((card) => card.id).sort()).toEqual(
      ARCHITECTURES.map((architecture) => architecture.id).sort(),
    );
  });

  for (const architecture of ARCHITECTURES) {
    it(`loads and matches its card — ${architecture.id}`, async () => {
      const { cards } = await loadModelCards();
      const card = cards.find((entry) => entry.id === architecture.id);
      expect(card, `no model card for ${architecture.id}`).toBeDefined();
      if (!card) return;

      const model = await loadModel(architecture.id);
      expect(parameterCount(model)).toBe(card.parameters);

      // Check the top and bottom of the SNR grid at the full rate, and one
      // punctured rate — a model that was not trained rate-adaptively passes
      // the first two and fails the third.
      const probes = [
        { channelUses: 32, snrDb: 0 },
        { channelUses: 32, snrDb: 20 },
        { channelUses: 8, snrDb: 10 },
      ];

      for (const probe of probes) {
        const claimed = card.evaluation.int8.find(
          (point) =>
            point.snrDb === probe.snrDb &&
            (point as { channelUses?: number }).channelUses === probe.channelUses,
        );
        expect(
          claimed,
          `card for ${architecture.id} has no entry at ${probe.snrDb} dB / ${probe.channelUses} uses`,
        ).toBeDefined();
        if (!claimed) continue;

        const measured = measure(model, card, probe.channelUses, probe.snrDb);
        expect(
          Math.abs(measured.psnrDb - claimed.psnrDb),
          `${architecture.id} at ${probe.snrDb} dB / ${probe.channelUses} uses: card says ${claimed.psnrDb} dB, served model gives ${measured.psnrDb.toFixed(3)} dB`,
        ).toBeLessThan(0.5);
      }
    }, 60_000);
  }

  it('improves with SNR, and with bandwidth', async () => {
    // Two monotonicities that must hold for any sane joint source-channel code.
    // They are cheap to check and they catch a decoder wired to the wrong input.
    const { cards } = await loadModelCards();
    const card = cards.find((entry) => entry.id === 'cnn')!;
    const model = await loadModel('cnn');

    const low = measure(model, card, 32, -5);
    const high = measure(model, card, 32, 20);
    expect(high.psnrDb).toBeGreaterThan(low.psnrDb + 3);

    const narrow = measure(model, card, 8, 15);
    const wide = measure(model, card, 32, 15);
    expect(wide.psnrDb).toBeGreaterThan(narrow.psnrDb);
  }, 60_000);

  it('reports an int8 storage cost small enough to be irrelevant to a comparison', async () => {
    const { cards } = await loadModelCards();
    for (const card of cards) {
      expect(card.storedAs).toBe('int8');
      // The threshold the training script applies before choosing int8.
      expect(card.evaluation.quantisationCostDb).toBeLessThanOrEqual(0.25);
    }
  });
});
