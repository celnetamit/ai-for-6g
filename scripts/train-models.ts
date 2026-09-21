/**
 * Trains the three DeepJSCC architectures and writes their weights and model
 * cards into `lib/models/`.
 *
 * Run with:  npx vite-node scripts/train-models.ts
 * Options:   --epochs=N --train=N --val=N --quick
 *
 * This script is the reason the lab can claim to compare AI approaches. It runs
 * offline, on a developer machine, and commits its output — the browser only
 * ever does inference. Every number in a model card comes from this run on a
 * held-out set the models never saw, and the card records the seeds, so the
 * whole thing can be reproduced rather than believed.
 *
 * The three architectures get identical treatment: same data, same optimiser,
 * same schedule, same SNR distribution, same evaluation grid. The only
 * difference is the encoder family, which is the variable under test.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type Tensor,
  adamStep,
  backward,
  createAdamState,
  mseLoss,
  tensor,
} from '../lib/nn/autograd';
import {
  ARCHITECTURES,
  type ArchitectureId,
  BANDWIDTH_RATIO,
  CHANNEL_USES,
  LATENT_DIM,
  SUPPORTED_CHANNEL_USES,
  applyChannel,
  createModel,
  decode,
  encode,
  parameterCount,
} from '../lib/nn/jscc';
import { IMAGE_PIXELS, generateDataset, makeRng, packSamples, psnr, ssim } from '../lib/sources';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../lib/models/weights');

const argOf = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const quick = process.argv.includes('--quick');

const CONFIG = {
  trainSize: argOf('train', quick ? 256 : 3072),
  valSize: argOf('val', quick ? 128 : 768),
  epochs: argOf('epochs', quick ? 2 : 34),
  batch: 32,
  learningRate: 2e-3,
  /** Training SNR is drawn per sample, so one model serves the whole range. */
  trainSnrRange: [-2, 20] as const,
  evalSnrGrid: [-5, 0, 5, 10, 15, 20, 25],
  /** Rates the models must serve, in complex channel uses out of 32. */
  rates: SUPPORTED_CHANNEL_USES,
  trainSeed: 20260921,
  valSeed: 7761,
  initSeed: 4242,
  noiseSeed: 991,
};

const TRAIN = generateDataset(CONFIG.trainSize, CONFIG.trainSeed);
const VAL = generateDataset(CONFIG.valSize, CONFIG.valSeed);
const TRAIN_PACKED = packSamples(TRAIN);
const VAL_PACKED = packSamples(VAL);

/** Uniform in dB across the training range — the standard DeepJSCC recipe. */
function trainingSnrGains(rows: number, random: () => number): Float64Array {
  const gains = new Float64Array(rows);
  const [low, high] = CONFIG.trainSnrRange;
  for (let i = 0; i < rows; i += 1) {
    const snrDb = low + random() * (high - low);
    gains[i] = 10 ** (snrDb / 10);
  }
  return gains;
}

function batchTensor(packed: Float64Array, indices: number[]): { x: Tensor; target: Float64Array } {
  const x = tensor(indices.length, IMAGE_PIXELS);
  indices.forEach((sampleIndex, row) => {
    for (let p = 0; p < IMAGE_PIXELS; p += 1) {
      x.data[row * IMAGE_PIXELS + p] = packed[sampleIndex * IMAGE_PIXELS + p]!;
    }
  });
  return { x, target: Float64Array.from(x.data) };
}

function collectNodes(root: Tensor): Tensor[] {
  const seen = new Set<Tensor>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const parent of node.parents) stack.push(parent);
  }
  return [...seen];
}

interface SnrPoint {
  snrDb: number;
  channelUses: number;
  psnrDb: number;
  ssim: number;
  mse: number;
}

/**
 * Evaluates on the held-out set across the SNR grid.
 *
 * The noise seed is fixed per evaluation so the three architectures face the
 * *same* channel realisations. Comparing models over independently drawn noise
 * adds a variance term to the comparison that has nothing to do with the
 * models, and at this sample count that term is large enough to reorder them.
 */
function evaluate(
  model: ReturnType<typeof createModel>,
  rates: readonly number[] = [CHANNEL_USES],
): SnrPoint[] {
  const points: SnrPoint[] = [];
  const evalBatch = 64;

  for (const channelUses of rates) {
   const activeDims = channelUses * 2;
   for (const snrDb of CONFIG.evalSnrGrid) {
    const random = makeRng(CONFIG.noiseSeed + Math.round(snrDb * 13) + channelUses * 7);
    let mseSum = 0;
    let psnrSum = 0;
    let ssimSum = 0;
    let counted = 0;

    for (let start = 0; start + evalBatch <= VAL.length; start += evalBatch) {
      const indices = Array.from({ length: evalBatch }, (_unused, i) => start + i);
      const { x, target } = batchTensor(VAL_PACKED, indices);
      const gains = new Float64Array(evalBatch).fill(10 ** (snrDb / 10));

      const latent = encode(model, x, evalBatch, activeDims);
      const received = applyChannel(latent, 0, random, gains, activeDims);
      const output = decode(model, received, evalBatch);

      for (let row = 0; row < evalBatch; row += 1) {
        const reference = target.slice(row * IMAGE_PIXELS, (row + 1) * IMAGE_PIXELS);
        const reconstruction = output.data.slice(row * IMAGE_PIXELS, (row + 1) * IMAGE_PIXELS);
        let sum = 0;
        for (let p = 0; p < IMAGE_PIXELS; p += 1) sum += (reference[p]! - reconstruction[p]!) ** 2;
        mseSum += sum / IMAGE_PIXELS;
        const value = psnr(reference, reconstruction);
        psnrSum += Number.isFinite(value) ? value : 60;
        ssimSum += ssim(reference, reconstruction);
        counted += 1;
      }
    }

    points.push({
      snrDb,
      channelUses,
      psnrDb: Number((psnrSum / counted).toFixed(3)),
      ssim: Number((ssimSum / counted).toFixed(4)),
      mse: Number((mseSum / counted).toExponential(4)),
    });
   }
  }
  return points;
}

// ------------------------------------------------------------ serialisation

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

function encodeFloat32(data: Float64Array): string {
  const floats = Float32Array.from(data);
  return toBase64(new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength));
}

/**
 * Symmetric per-tensor int8 quantisation: q = round(w/s), s = max|w|/127.
 *
 * Offered because three sets of float32 weights is a third of a megabyte in a
 * bundle that a learner downloads before they can run anything, and int8 is a
 * quarter of that. Whether it is *used* is decided by measurement below, not by
 * assumption — the cost in reconstruction quality is evaluated on the same
 * held-out set and recorded in the model card either way.
 */
function quantiseInt8(data: Float64Array): { bytes: Int8Array; scale: number } {
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? peak / 127 : 1;
  const bytes = new Int8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    bytes[i] = Math.max(-127, Math.min(127, Math.round(data[i]! / scale)));
  }
  return { bytes, scale };
}

function applyQuantisation(model: ReturnType<typeof createModel>): () => void {
  const originals = model.parameters.map((p) => Float64Array.from(p.data));
  model.parameters.forEach((p) => {
    const { bytes, scale } = quantiseInt8(p.data);
    for (let i = 0; i < p.data.length; i += 1) p.data[i] = bytes[i]! * scale;
  });
  return () => {
    model.parameters.forEach((p, index) => p.data.set(originals[index]!));
  };
}

// ------------------------------------------------------------------ training

interface TrainingLog {
  epoch: number;
  trainLoss: number;
  valPsnrDb: number;
}

function train(id: ArchitectureId) {
  const model = createModel(id, CONFIG.initSeed);
  const state = createAdamState(model.parameters);
  const shuffleRng = makeRng(31337 + id.length);
  const noiseRng = makeRng(CONFIG.noiseSeed);
  const started = Date.now();
  const log: TrainingLog[] = [];

  const order = Array.from({ length: TRAIN.length }, (_unused, i) => i);

  for (let epoch = 1; epoch <= CONFIG.epochs; epoch += 1) {
    // Fisher–Yates each epoch: the generator emits classes in a fixed cycle, so
    // an unshuffled pass would show the network one class per mini-batch.
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(shuffleRng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    // Cosine decay from the base rate. A flat rate leaves the last epochs
    // bouncing around the minimum and the final weights depend on where the
    // bounce stopped.
    const learningRate =
      CONFIG.learningRate * (0.5 * (1 + Math.cos((Math.PI * (epoch - 1)) / CONFIG.epochs)) * 0.9 + 0.1);

    let epochLoss = 0;
    let steps = 0;

    for (let start = 0; start + CONFIG.batch <= order.length; start += CONFIG.batch) {
      const indices = order.slice(start, start + CONFIG.batch);
      const { x, target } = batchTensor(TRAIN_PACKED, indices);
      const gains = trainingSnrGains(CONFIG.batch, noiseRng);
      // The rate is drawn per batch. Training at a single rate produces an
      // encoder whose information is spread evenly across the latent, so
      // puncturing it at inference destroys the reconstruction; drawing the cut
      // point during training is what makes the leading symbols the important
      // ones.
      const channelUses = CONFIG.rates[Math.floor(noiseRng() * CONFIG.rates.length)]!;
      const activeDims = channelUses * 2;

      const latent = encode(model, x, CONFIG.batch, activeDims);
      const received = applyChannel(latent, 0, noiseRng, gains, activeDims);
      const output = decode(model, received, CONFIG.batch);
      const loss = mseLoss(output, target);

      for (const node of collectNodes(loss)) node.grad?.fill(0);
      backward(loss);
      adamStep(model.parameters, state, learningRate);

      epochLoss += loss.data[0]!;
      steps += 1;
    }

    if (epoch === 1 || epoch % 4 === 0 || epoch === CONFIG.epochs) {
      const grid = evaluate(model);
      const mid = grid.find((p) => p.snrDb === 10) ?? grid[Math.floor(grid.length / 2)]!;
      log.push({
        epoch,
        trainLoss: Number((epochLoss / steps).toExponential(4)),
        valPsnrDb: mid.psnrDb,
      });
      process.stdout.write(
        `  ${id} epoch ${String(epoch).padStart(3)}  loss ${(epochLoss / steps).toExponential(3)}  val PSNR@10dB ${mid.psnrDb.toFixed(2)} dB\n`,
      );
    }
  }

  const trainingSeconds = Math.round((Date.now() - started) / 1000);
  const float32Grid = evaluate(model, CONFIG.rates);

  const restore = applyQuantisation(model);
  const int8Grid = evaluate(model, CONFIG.rates);
  restore();

  const meanFloat = float32Grid.reduce((a, p) => a + p.psnrDb, 0) / float32Grid.length;
  const meanInt8 = int8Grid.reduce((a, p) => a + p.psnrDb, 0) / int8Grid.length;
  const quantisationCostDb = Number((meanFloat - meanInt8).toFixed(3));

  // Ship the small weights only when they cost almost nothing. 0.25 dB is
  // below what the reconstruction viewer can show and well inside the spread
  // between architectures, so it cannot change a comparison.
  const useInt8 = quantisationCostDb <= 0.25;

  const tensors = model.parameters.map((p, index) => {
    const base = {
      name: model.parameterNames[index]!,
      rows: p.rows,
      cols: p.cols,
    };
    if (!useInt8) return { ...base, data: encodeFloat32(p.data) };
    const { bytes, scale } = quantiseInt8(p.data);
    return { ...base, scale, data: toBase64(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)) };
  });

  const meta = ARCHITECTURES.find((a) => a.id === id)!;
  const payload = {
    id,
    formatVersion: 1,
    dtype: useInt8 ? ('int8' as const) : ('float32' as const),
    latentDim: LATENT_DIM,
    imagePixels: IMAGE_PIXELS,
    tensors,
  };

  const card = {
    id,
    label: meta.label,
    family: meta.family,
    parameters: parameterCount(model),
    storedAs: payload.dtype,
    bandwidthRatio: BANDWIDTH_RATIO,
    channelUses: CHANNEL_USES,
    latentDim: LATENT_DIM,
    trainedOn: {
      generator: 'lib/sources.ts — procedural 16×16 scene primitives, 4 classes',
      trainSamples: TRAIN.length,
      valSamples: VAL.length,
      trainSeed: CONFIG.trainSeed,
      valSeed: CONFIG.valSeed,
      sensorNoise: 0.03,
    },
    training: {
      epochs: CONFIG.epochs,
      batch: CONFIG.batch,
      optimiser: 'Adam, cosine-decayed from 2e-3, global-norm gradient clipping at 5',
      loss: 'Mean squared error on pixels, taken through the channel',
      channel: `AWGN, SNR drawn uniformly in [${CONFIG.trainSnrRange[0]}, ${CONFIG.trainSnrRange[1]}] dB per sample`,
      rates: `Rate drawn per batch from ${CONFIG.rates.join(', ')} complex channel uses (puncturing the latent tail)`,
      seconds: trainingSeconds,
      history: log,
    },
    evaluation: {
      note: 'Held-out set, never trained on. Identical noise seeds across architectures.',
      float32: float32Grid,
      int8: int8Grid,
      quantisationCostDb,
    },
    rates: CONFIG.rates,
    limitations: [
      'Trained on procedurally generated 16×16 scenes, not on photographs or real sensor captures. The numbers describe this source and do not transfer to natural images.',
      'The channel during training is AWGN after equalisation. Fading is applied at evaluation time as a per-block SNR change, which is exact for a known channel but does not model channel estimation error.',
      'The comparison between architectures holds at these bandwidth ratios and this parameter budget. A different budget can reorder them.',
    ],
  };

  return { payload, card };
}

// ----------------------------------------------------------------------- run

mkdirSync(outputDir, { recursive: true });
process.stdout.write(
  `Training ${ARCHITECTURES.length} architectures — ${CONFIG.trainSize} train / ${CONFIG.valSize} val, ${CONFIG.epochs} epochs\n`,
);

const cards: unknown[] = [];
for (const architecture of ARCHITECTURES) {
  process.stdout.write(`\n${architecture.label} (${architecture.id})\n`);
  const { payload, card } = train(architecture.id);
  writeFileSync(resolve(outputDir, `${architecture.id}.json`), JSON.stringify(payload));
  cards.push(card);
  process.stdout.write(
    `  stored as ${payload.dtype}, ${(JSON.stringify(payload).length / 1024).toFixed(0)} kB\n`,
  );
}

writeFileSync(
  resolve(outputDir, 'model-cards.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), cards }, null, 2)}\n`,
);
process.stdout.write('\nWrote lib/models/weights/*.json\n');
