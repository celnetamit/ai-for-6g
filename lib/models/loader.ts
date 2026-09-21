/**
 * Loads trained weights into a freshly constructed model.
 *
 * The browser never trains. It builds the same architecture the training script
 * built — from the same `createModel` — and overwrites the randomly initialised
 * parameters with the values learned offline. Sharing `createModel` between the
 * two is what guarantees the served forward pass is the one the weights were
 * learned under.
 *
 * Weight files are fetched lazily. Together they are under 100 kB, but nobody
 * reading the knowledge bank should pay for a neural network they have not
 * opened, and the import below is a dynamic one so Rollup gives each its own
 * chunk.
 */

import { type ArchitectureId, type JsccModel, createModel } from '../nn/jscc';

interface StoredTensor {
  name: string;
  rows: number;
  cols: number;
  /** Present only for int8 storage. */
  scale?: number;
  data: string;
}

interface StoredModel {
  id: ArchitectureId;
  formatVersion: number;
  dtype: 'float32' | 'int8';
  latentDim: number;
  imagePixels: number;
  tensors: StoredTensor[];
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeTensor(stored: StoredTensor, dtype: StoredModel['dtype']): Float64Array {
  const bytes = base64ToBytes(stored.data);
  const count = stored.rows * stored.cols;
  const out = new Float64Array(count);

  if (dtype === 'float32') {
    // `bytes.buffer` may not be 4-byte aligned after atob, so copy into an
    // aligned buffer rather than viewing it in place — a misaligned view
    // throws in every engine.
    const aligned = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(aligned).set(bytes);
    const floats = new Float32Array(aligned);
    for (let i = 0; i < count; i += 1) out[i] = floats[i] ?? 0;
    return out;
  }

  const scale = stored.scale ?? 1;
  const signed = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i += 1) out[i] = (signed[i] ?? 0) * scale;
  return out;
}

const cache = new Map<ArchitectureId, Promise<JsccModel>>();

async function fetchWeights(id: ArchitectureId): Promise<StoredModel> {
  switch (id) {
    case 'mlp':
      return (await import('./weights/mlp.json')).default as StoredModel;
    case 'transformer':
      return (await import('./weights/transformer.json')).default as StoredModel;
    case 'cnn':
    default:
      return (await import('./weights/cnn.json')).default as StoredModel;
  }
}

/** Returns the trained model, building and caching it on first use. */
export function loadModel(id: ArchitectureId): Promise<JsccModel> {
  const existing = cache.get(id);
  if (existing) return existing;

  const promise = (async () => {
    const stored = await fetchWeights(id);
    const model = createModel(id);

    if (stored.tensors.length !== model.parameters.length) {
      throw new Error(
        `Weight file for ${id} has ${stored.tensors.length} tensors, architecture expects ${model.parameters.length}. Re-run scripts/train-models.ts.`,
      );
    }

    stored.tensors.forEach((entry, index) => {
      const target = model.parameters[index]!;
      const expectedName = model.parameterNames[index];
      if (entry.name !== expectedName) {
        throw new Error(
          `Weight file for ${id} is out of order: expected ${expectedName} at ${index}, found ${entry.name}.`,
        );
      }
      if (entry.rows !== target.rows || entry.cols !== target.cols) {
        throw new Error(
          `Shape mismatch for ${entry.name}: file has ${entry.rows}×${entry.cols}, architecture expects ${target.rows}×${target.cols}.`,
        );
      }
      target.data.set(decodeTensor(entry, stored.dtype));
    });

    return model;
  })();

  cache.set(id, promise);
  // A failed load must not be cached forever — a transient chunk failure would
  // otherwise poison the model for the rest of the session.
  promise.catch(() => cache.delete(id));
  return promise;
}

export interface ModelCardEvaluationPoint {
  snrDb: number;
  psnrDb: number;
  ssim: number;
  mse: number;
}

export interface ModelCard {
  id: ArchitectureId;
  label: string;
  family: string;
  parameters: number;
  storedAs: 'float32' | 'int8';
  bandwidthRatio: number;
  channelUses: number;
  latentDim: number;
  trainedOn: {
    generator: string;
    trainSamples: number;
    valSamples: number;
    trainSeed: number;
    valSeed: number;
    sensorNoise: number;
  };
  training: {
    epochs: number;
    batch: number;
    optimiser: string;
    loss: string;
    channel: string;
    seconds: number;
    history: { epoch: number; trainLoss: number; valPsnrDb: number }[];
  };
  evaluation: {
    note: string;
    float32: ModelCardEvaluationPoint[];
    int8: ModelCardEvaluationPoint[];
    quantisationCostDb: number;
  };
  limitations: string[];
}

export interface ModelCardFile {
  generatedAt: string;
  cards: ModelCard[];
}

let cardsPromise: Promise<ModelCardFile> | null = null;

export function loadModelCards(): Promise<ModelCardFile> {
  cardsPromise ??= import('./weights/model-cards.json').then(
    (module) => module.default as ModelCardFile,
  );
  return cardsPromise;
}
