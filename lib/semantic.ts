/**
 * The semantic communication experiment: one scene, two systems, one channel.
 *
 * This is where spec §5's semantic inputs (data type, compression level,
 * semantic importance, channel noise) meet §6's semantic outputs (original
 * data, reconstructed data, similarity score). The point of running both paths
 * over the same channel realisation is that the comparison then has no free
 * parameters — the same noise, the same symbols, the same bandwidth. Whatever
 * difference appears is attributable to how each system spends its channel
 * uses, which is the only thing under study.
 *
 * Neither reconstruction is described in advance. Both are produced, and then
 * measured against the original.
 */

import {
  type ArchitectureId,
  LATENT_DIM,
  applyChannel,
  decode,
  encode,
} from './nn/jscc';
import { tensor } from './nn/autograd';
import { loadModel } from './models/loader';
import { transmitClassical } from './classical';
import {
  type SceneDescriptor,
  type SceneSample,
  IMAGE_PIXELS,
  coverageMask,
  generateDataset,
  makeRng,
  psnr,
  ssim,
  weightedPsnr,
} from './sources';
import { type Modulation, selectModulation, BPSK } from './modulation';

export interface SemanticConfig {
  architecture: ArchitectureId;
  /**
   * Keep every per-scene result rather than the handful used for display.
   *
   * `samples` is capped so the workspace does not hold hundreds of
   * reconstructed images. The dataset generator builds one row per sample, so
   * with the cap in force its row count silently topped out at four per
   * configuration — a "400 rows" request produced 84.
   */
  keepAllSamples?: boolean;
  /** Complex channel uses available to both systems. */
  channelUses: number;
  /** Per-symbol SNR in dB after equalisation. */
  snrDb: number;
  /** 0 = ordinary fidelity, 1 = the object matters ten times the background. */
  importance: number;
  /** Channel code rate for the classical path. */
  codeRate: number;
  sceneSeed: number;
  sampleCount: number;
}

export interface SemanticSampleResult {
  descriptor: SceneDescriptor;
  original: Float64Array;
  neural: Float64Array;
  classical: Float64Array;
  neuralPsnrDb: number;
  neuralSsim: number;
  neuralSemanticDb: number;
  classicalPsnrDb: number;
  classicalSsim: number;
  classicalSemanticDb: number;
  classicalLost: boolean;
}

export interface SemanticResult {
  config: SemanticConfig;
  /** A handful of reconstructions for display. */
  samples: SemanticSampleResult[];
  aggregate: {
    neuralPsnrDb: number;
    neuralSsim: number;
    neuralSemanticDb: number;
    classicalPsnrDb: number;
    classicalSsim: number;
    classicalSemanticDb: number;
    /** Fraction of blocks the classical decoder could not recover at all. */
    classicalLossRate: number;
  };
  budget: {
    channelUses: number;
    bandwidthRatio: number;
    modulation: Modulation;
    classicalPayloadBits: number;
    coefficientsKept: number;
    /** True when no modulation clears its threshold — BPSK is being assumed. */
    inOutage: boolean;
  };
}

const DISPLAY_SAMPLES = 4;

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** PSNR saturates at infinity for a perfect match; cap it for averaging. */
const finite = (value: number): number => (Number.isFinite(value) ? value : 60);

/**
 * Runs the whole semantic pipeline.
 *
 * Asynchronous because the trained weights are fetched on demand — the first
 * run of a given architecture pays for a ~30 kB chunk, and every run after it
 * is instant.
 */
export async function runSemantic(config: SemanticConfig): Promise<SemanticResult> {
  const model = await loadModel(config.architecture);
  const scenes: SceneSample[] = generateDataset(config.sampleCount, config.sceneSeed);
  const activeDims = Math.max(2, Math.min(LATENT_DIM, config.channelUses * 2));

  // The neural path runs the whole batch at once; the classical path is
  // per-image because its decoder either succeeds or fails per block.
  const batch = scenes.length;
  const x = tensor(batch, IMAGE_PIXELS);
  scenes.forEach((scene, index) => x.data.set(scene.pixels, index * IMAGE_PIXELS));

  const channelRng = makeRng(config.sceneSeed * 31 + Math.round(config.snrDb * 100) + 7);
  const latent = encode(model, x, batch, activeDims);
  const received = applyChannel(latent, config.snrDb, channelRng, undefined, activeDims);
  const decoded = decode(model, received, batch);

  /*
   * Link adaptation for the classical path: the best modulation this SNR
   * supports, which is the fairest reading of "separate source and channel
   * coding with a modern radio".
   *
   * The fallback is BPSK, the weakest entry in the table, and it used to be
   * QPSK. That inverted the curve: below the BPSK threshold the fallback
   * handed the link QPSK and six DCT coefficients, while just ABOVE the
   * threshold link adaptation correctly selected BPSK and could afford only
   * one — so reconstruction quality fell 1.94 dB as the channel IMPROVED from
   * 4 dB to 7 dB. A scheme cannot get worse for having a better channel, and a
   * comparison chart with that kink in it is worse than no chart.
   */
  const modulation = selectModulation(config.snrDb) ?? BPSK;
  const inOutage = selectModulation(config.snrDb) === null;
  const classicalRng = makeRng(config.sceneSeed * 97 + Math.round(config.snrDb * 100) + 13);

  const samples: SemanticSampleResult[] = [];
  const neuralPsnrs: number[] = [];
  const neuralSsims: number[] = [];
  const neuralSemantic: number[] = [];
  const classicalPsnrs: number[] = [];
  const classicalSsims: number[] = [];
  const classicalSemantic: number[] = [];
  let lost = 0;
  let coefficientsKept = 0;
  let classicalPayloadBits = 0;

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]!;
    const original = scene.pixels;
    const mask = coverageMask(scene.descriptor);

    const neural = decoded.data.slice(index * IMAGE_PIXELS, (index + 1) * IMAGE_PIXELS);

    const classicalRun = transmitClassical(
      original,
      {
        modulation,
        channelUses: config.channelUses,
        codeRate: config.codeRate,
        snrDb: config.snrDb,
        importance: config.importance,
      },
      classicalRng,
    );
    coefficientsKept = classicalRun.coefficientsKept;
    classicalPayloadBits = classicalRun.sourceBits;
    if (classicalRun.blockLost) lost += 1;

    const entry: SemanticSampleResult = {
      descriptor: scene.descriptor,
      original,
      neural,
      classical: classicalRun.image,
      neuralPsnrDb: finite(psnr(original, neural)),
      neuralSsim: ssim(original, neural),
      neuralSemanticDb: finite(weightedPsnr(original, neural, mask, config.importance)),
      classicalPsnrDb: finite(psnr(original, classicalRun.image)),
      classicalSsim: ssim(original, classicalRun.image),
      classicalSemanticDb: finite(
        weightedPsnr(original, classicalRun.image, mask, config.importance),
      ),
      classicalLost: classicalRun.blockLost,
    };

    neuralPsnrs.push(entry.neuralPsnrDb);
    neuralSsims.push(entry.neuralSsim);
    neuralSemantic.push(entry.neuralSemanticDb);
    classicalPsnrs.push(entry.classicalPsnrDb);
    classicalSsims.push(entry.classicalSsim);
    classicalSemantic.push(entry.classicalSemanticDb);

    if (config.keepAllSamples || samples.length < DISPLAY_SAMPLES) samples.push(entry);
  }

  return {
    config,
    samples,
    aggregate: {
      neuralPsnrDb: mean(neuralPsnrs),
      neuralSsim: mean(neuralSsims),
      neuralSemanticDb: mean(neuralSemantic),
      classicalPsnrDb: mean(classicalPsnrs),
      classicalSsim: mean(classicalSsims),
      classicalSemanticDb: mean(classicalSemantic),
      classicalLossRate: scenes.length === 0 ? 0 : lost / scenes.length,
    },
    budget: {
      channelUses: config.channelUses,
      bandwidthRatio: config.channelUses / IMAGE_PIXELS,
      modulation,
      classicalPayloadBits,
      coefficientsKept,
      inOutage,
    },
  };
}

export interface SweepPoint {
  snrDb: number;
  cnn?: number;
  transformer?: number;
  mlp?: number;
  classical?: number;
}

/**
 * Sweeps SNR for a set of architectures plus the classical baseline.
 *
 * The shape of these curves is the finding the Advanced level is built around:
 * the separation-based scheme is excellent right up to its threshold and
 * useless a decibel below it, while every trained model degrades smoothly.
 * That cliff is not a modelling artefact — it is what a block code does when it
 * runs out of correction capability.
 */
export async function sweepArchitectures(
  architectures: ArchitectureId[],
  options: {
    snrGrid: number[];
    channelUses: number;
    codeRate: number;
    sceneSeed: number;
    sampleCount: number;
    importance: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<SweepPoint[]> {
  const points: SweepPoint[] = options.snrGrid.map((snrDb) => ({ snrDb }));
  const total = options.snrGrid.length * (architectures.length + 1);
  let done = 0;

  for (let index = 0; index < options.snrGrid.length; index += 1) {
    const snrDb = options.snrGrid[index]!;
    for (const architecture of architectures) {
      const result = await runSemantic({
        architecture,
        channelUses: options.channelUses,
        snrDb,
        importance: options.importance,
        codeRate: options.codeRate,
        sceneSeed: options.sceneSeed,
        sampleCount: options.sampleCount,
      });
      points[index]![architecture] = Number(result.aggregate.neuralPsnrDb.toFixed(2));
      // The classical baseline is identical across architectures, so it is
      // recorded once per SNR from whichever run produced it.
      points[index]!.classical = Number(result.aggregate.classicalPsnrDb.toFixed(2));
      done += 1;
      options.onProgress?.(done, total);
    }
    done += 1;
    options.onProgress?.(done, total);
    // Yield to the event loop so the progress bar can paint. Without this the
    // whole sweep runs in one task and the UI freezes until it finishes.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return points;
}
