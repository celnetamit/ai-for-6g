/**
 * Three deep joint source-channel coding architectures, sharing one interface.
 *
 * Spec §5 lets a learner pick CNN, Transformer or DeepJSCC as the AI model, and
 * §2 (Advanced) asks them to compare AI algorithms. For that comparison to mean
 * anything the three have to be trained the same way, on the same data, at the
 * same bandwidth ratio, and evaluated on the same held-out set — otherwise the
 * winner is whichever one got the better deal, which is the most common way for
 * an architecture comparison to be wrong.
 *
 * So all three:
 *   • map a 16×16 scene to the same 64 real dimensions = 32 complex channel
 *     uses, a bandwidth ratio of 1/8;
 *   • pass through the same power constraint and the same channel layer;
 *   • are trained by `scripts/train-models.ts` with the same optimiser,
 *     schedule and number of epochs, on the same seeds.
 *
 * All three are DeepJSCC in the sense of Bourtsoulatze, Burth Kurka & Gündüz
 * (2019): one network maps source straight to channel symbols, with no separate
 * compression or error-correction stage, trained end-to-end through a
 * differentiable channel. What differs is the encoder family — fully connected,
 * convolutional, or self-attention — which is exactly the axis the lab asks
 * learners to explore.
 */

import {
  type Tensor,
  add,
  addConstant,
  maskColumns,
  backward,
  matmul,
  parameter,
  powerNormalise,
  relu,
  reshape,
  sigmoid,
  tensor,
  zeroGrad,
} from './autograd';
import {
  type AttentionBlock,
  type Conv2d,
  type Dense,
  applyAttention,
  applyConv2d,
  applyDense,
  attentionParameters,
  buildUpsampleMap,
  concatRows,
  convParameters,
  createAttentionBlock,
  createConv2d,
  createDense,
  denseParameters,
  gather,
  sliceRows,
} from './layers';
import { IMAGE_PIXELS, IMAGE_SIZE, makeRng } from '../sources';

export type ArchitectureId = 'mlp' | 'cnn' | 'transformer';

export interface ArchitectureMeta {
  id: ArchitectureId;
  label: string;
  family: string;
  summary: string;
  /** What this family is expected to be good and bad at, stated in advance. */
  hypothesis: string;
}

/** Real dimensions on the wire; two per complex channel use. */
export const LATENT_DIM = 64;
export const CHANNEL_USES = LATENT_DIM / 2;
export const BANDWIDTH_RATIO = CHANNEL_USES / IMAGE_PIXELS;

export const ARCHITECTURES: readonly ArchitectureMeta[] = [
  {
    id: 'mlp',
    label: 'Dense autoencoder',
    family: 'Fully connected',
    summary:
      'Every pixel connects to every hidden unit. The most general mapping of the three, and the one with the most parameters for the least structure.',
    hypothesis:
      'Expected to fit the training set easily but to generalise worst, because nothing in the architecture knows that neighbouring pixels are related.',
  },
  {
    id: 'cnn',
    label: 'CNN DeepJSCC',
    family: 'Convolutional',
    summary:
      'Strided convolutions down to a 4×4×4 latent, then resize-convolutions back up. The architecture used in the original DeepJSCC paper.',
    hypothesis:
      'Expected to do best per parameter: weight sharing encodes the fact that a feature means the same thing wherever it appears in the scene.',
  },
  {
    id: 'transformer',
    label: 'Transformer DeepJSCC',
    family: 'Self-attention',
    summary:
      'The scene is split into sixteen 4×4 patches; one self-attention block lets every patch condition on every other before the channel.',
    hypothesis:
      'Expected to handle scenes whose parts are far apart better than convolution, at the cost of more parameters and more data to train them.',
  },
];

export const architectureById = (id: ArchitectureId): ArchitectureMeta =>
  ARCHITECTURES.find((a) => a.id === id) ?? ARCHITECTURES[1]!;

// --------------------------------------------------------------- the models

interface MlpWeights {
  kind: 'mlp';
  encode1: Dense;
  encode2: Dense;
  decode1: Dense;
  decode2: Dense;
}

interface CnnWeights {
  kind: 'cnn';
  enc1: Conv2d;
  enc2: Conv2d;
  enc3: Conv2d;
  dec1: Conv2d;
  dec2: Conv2d;
  dec3: Conv2d;
}

interface TransformerWeights {
  kind: 'transformer';
  embed: Dense;
  positionEncode: Tensor;
  blockEncode: AttentionBlock;
  project: Dense;
  lift: Dense;
  positionDecode: Tensor;
  blockDecode: AttentionBlock;
  unembed: Dense;
}

export type JsccWeights = MlpWeights | CnnWeights | TransformerWeights;

export interface JsccModel {
  id: ArchitectureId;
  weights: JsccWeights;
  parameters: Tensor[];
  /** Names in a fixed order, so serialised weights survive a rebuild. */
  parameterNames: string[];
}

const MLP_HIDDEN = 48;
const TOKEN_GRID = 4;
const TOKENS = TOKEN_GRID * TOKEN_GRID;
const PATCH = IMAGE_SIZE / TOKEN_GRID;
const PATCH_DIM = PATCH * PATCH;
const TOKEN_DIM = 32;
const TOKEN_LATENT = LATENT_DIM / TOKENS;

function named(pairs: [string, Tensor[]][]): { parameters: Tensor[]; parameterNames: string[] } {
  const parameters: Tensor[] = [];
  const parameterNames: string[] = [];
  for (const [prefix, list] of pairs) {
    list.forEach((t, index) => {
      parameters.push(t);
      parameterNames.push(`${prefix}.${index}`);
    });
  }
  return { parameters, parameterNames };
}

export function createModel(id: ArchitectureId, seed = 1234): JsccModel {
  const random = makeRng(seed);

  if (id === 'mlp') {
    const weights: MlpWeights = {
      kind: 'mlp',
      encode1: createDense(IMAGE_PIXELS, MLP_HIDDEN, random),
      encode2: createDense(MLP_HIDDEN, LATENT_DIM, random, 1),
      decode1: createDense(LATENT_DIM, MLP_HIDDEN, random),
      decode2: createDense(MLP_HIDDEN, IMAGE_PIXELS, random, 1),
    };
    return {
      id,
      weights,
      ...named([
        ['encode1', denseParameters(weights.encode1)],
        ['encode2', denseParameters(weights.encode2)],
        ['decode1', denseParameters(weights.decode1)],
        ['decode2', denseParameters(weights.decode2)],
      ]),
    };
  }

  if (id === 'cnn') {
    const conv = (
      inChannels: number,
      outChannels: number,
      kernel: number,
      stride: number,
      padding: number,
      inHeight: number,
      inWidth: number,
    ) =>
      createConv2d(
        { inChannels, outChannels, kernel, stride, padding, inHeight, inWidth },
        1,
        random,
      );

    const weights: CnnWeights = {
      kind: 'cnn',
      enc1: conv(1, 16, 3, 2, 1, 16, 16), // → 16×8×8
      enc2: conv(16, 32, 3, 2, 1, 8, 8), // → 32×4×4
      enc3: conv(32, 4, 1, 1, 0, 4, 4), // → 4×4×4 = 64
      dec1: conv(4, 32, 1, 1, 0, 4, 4), // → 32×4×4
      dec2: conv(32, 16, 3, 1, 1, 8, 8), // after ×2 upsample → 16×8×8
      dec3: conv(16, 1, 3, 1, 1, 16, 16), // after ×2 upsample → 1×16×16
    };
    return {
      id,
      weights,
      ...named([
        ['enc1', convParameters(weights.enc1)],
        ['enc2', convParameters(weights.enc2)],
        ['enc3', convParameters(weights.enc3)],
        ['dec1', convParameters(weights.dec1)],
        ['dec2', convParameters(weights.dec2)],
        ['dec3', convParameters(weights.dec3)],
      ]),
    };
  }

  const positions = (count: number, dim: number) => {
    const t = parameter(count, dim);
    for (let i = 0; i < t.data.length; i += 1) t.data[i] = (random() - 0.5) * 0.04;
    return t;
  };

  const weights: TransformerWeights = {
    kind: 'transformer',
    embed: createDense(PATCH_DIM, TOKEN_DIM, random),
    positionEncode: positions(TOKENS, TOKEN_DIM),
    blockEncode: createAttentionBlock(TOKEN_DIM, TOKEN_DIM * 2, random),
    project: createDense(TOKEN_DIM, TOKEN_LATENT, random, 1),
    lift: createDense(TOKEN_LATENT, TOKEN_DIM, random),
    positionDecode: positions(TOKENS, TOKEN_DIM),
    blockDecode: createAttentionBlock(TOKEN_DIM, TOKEN_DIM * 2, random),
    unembed: createDense(TOKEN_DIM, PATCH_DIM, random, 1),
  };
  return {
    id,
    weights,
    ...named([
      ['embed', denseParameters(weights.embed)],
      ['positionEncode', [weights.positionEncode]],
      ['blockEncode', attentionParameters(weights.blockEncode)],
      ['project', denseParameters(weights.project)],
      ['lift', denseParameters(weights.lift)],
      ['positionDecode', [weights.positionDecode]],
      ['blockDecode', attentionParameters(weights.blockDecode)],
      ['unembed', attentionSafe(denseParameters(weights.unembed))],
    ]),
  };
}

/** Identity; exists only so the list above reads uniformly. */
const attentionSafe = (list: Tensor[]): Tensor[] => list;

// ------------------------------------------------------------ index maps

const mapCache = new Map<string, Int32Array>();

function cachedMap(key: string, build: () => Int32Array): Int32Array {
  let map = mapCache.get(key);
  if (!map) {
    map = build();
    mapCache.set(key, map);
  }
  return map;
}

/** [batch, 256] → [batch·16 tokens, 16 dims]. */
function patchifyMap(batch: number): Int32Array {
  return cachedMap(`patch:${batch}`, () => {
    const map = new Int32Array(batch * TOKENS * PATCH_DIM);
    let index = 0;
    for (let b = 0; b < batch; b += 1) {
      for (let ty = 0; ty < TOKEN_GRID; ty += 1) {
        for (let tx = 0; tx < TOKEN_GRID; tx += 1) {
          for (let py = 0; py < PATCH; py += 1) {
            for (let px = 0; px < PATCH; px += 1) {
              map[index] =
                b * IMAGE_PIXELS + (ty * PATCH + py) * IMAGE_SIZE + (tx * PATCH + px);
              index += 1;
            }
          }
        }
      }
    }
    return map;
  });
}

/** The inverse: [batch·16 tokens, 16 dims] → [batch, 256]. */
function unpatchifyMap(batch: number): Int32Array {
  return cachedMap(`unpatch:${batch}`, () => {
    const forward = patchifyMap(batch);
    const map = new Int32Array(batch * IMAGE_PIXELS);
    for (let i = 0; i < forward.length; i += 1) map[forward[i]!] = i;
    return map;
  });
}

/** [batch·16 tokens, 4 dims] → [batch, 64]. */
function tokensToLatentMap(batch: number): Int32Array {
  return cachedMap(`tok2lat:${batch}`, () => {
    const map = new Int32Array(batch * LATENT_DIM);
    for (let b = 0; b < batch; b += 1) {
      for (let t = 0; t < TOKENS; t += 1) {
        for (let d = 0; d < TOKEN_LATENT; d += 1) {
          map[b * LATENT_DIM + t * TOKEN_LATENT + d] = (b * TOKENS + t) * TOKEN_LATENT + d;
        }
      }
    }
    return map;
  });
}

function latentToTokensMap(batch: number): Int32Array {
  return cachedMap(`lat2tok:${batch}`, () => {
    const forward = tokensToLatentMap(batch);
    const map = new Int32Array(batch * TOKENS * TOKEN_LATENT);
    for (let i = 0; i < forward.length; i += 1) map[forward[i]!] = i;
    return map;
  });
}

/** Tiles a [tokens, dim] positional table across the batch. */
function positionMap(batch: number): Int32Array {
  return cachedMap(`pos:${batch}`, () => {
    const map = new Int32Array(batch * TOKENS * TOKEN_DIM);
    for (let b = 0; b < batch; b += 1) {
      for (let i = 0; i < TOKENS * TOKEN_DIM; i += 1) {
        map[b * TOKENS * TOKEN_DIM + i] = i;
      }
    }
    return map;
  });
}

const convCache = new Map<string, Conv2d>();

function convFor(conv: Conv2d, batch: number, key: string): Conv2d {
  if (conv.batch === batch) return conv;
  const cacheKey = `${key}:${batch}`;
  const hit = convCache.get(cacheKey);
  // The weights are shared by reference, so a cached shape wrapper stays in
  // sync with training updates — only the index maps differ.
  if (hit && hit.weight === conv.weight) return hit;
  const rebuilt = createConv2d(conv.spec, batch, () => 0.5);
  rebuilt.weight = conv.weight;
  rebuilt.bias = conv.bias;
  convCache.set(cacheKey, rebuilt);
  return rebuilt;
}

// -------------------------------------------------------------- forward

/**
 * Encoder: scene → power-constrained channel symbols.
 *
 * `activeDims` is the rate: the leading `activeDims` real dimensions are
 * transmitted and the rest are punctured. Power is normalised over the
 * transmitted dimensions only, so the energy per channel use — and therefore
 * the SNR per symbol — is the same at every rate. A lower rate buys bandwidth,
 * not signal strength, which is the trade the learner is being shown.
 */
export function encode(
  model: JsccModel,
  x: Tensor,
  batch: number,
  activeDims: number = LATENT_DIM,
): Tensor {
  const w = model.weights;
  const rate = Math.max(2, Math.min(LATENT_DIM, activeDims));

  if (w.kind === 'mlp') {
    const hidden = relu(applyDense(x, w.encode1));
    return powerNormalise(maskColumns(applyDense(hidden, w.encode2), rate), rate);
  }

  if (w.kind === 'cnn') {
    const h1 = relu(applyConv2d(x, convFor(w.enc1, batch, 'enc1')));
    const h2 = relu(applyConv2d(h1, convFor(w.enc2, batch, 'enc2')));
    const h3 = applyConv2d(h2, convFor(w.enc3, batch, 'enc3'));
    return powerNormalise(maskColumns(h3, rate), rate);
  }

  const patches = gather(x, patchifyMap(batch), batch * TOKENS, PATCH_DIM);
  const embedded = add(
    applyDense(patches, w.embed),
    gather(w.positionEncode, positionMap(batch), batch * TOKENS, TOKEN_DIM),
  );

  // Attention must not mix samples, so each sample's token block is attended
  // separately and the results re-joined. Running the whole batch through one
  // attention would let patch 3 of image 7 attend to patch 1 of image 2, which
  // trains to a lower loss and is meaningless.
  const attended = concatRows(
    Array.from({ length: batch }, (_unused, b) =>
      applyAttention(sliceRows(embedded, b * TOKENS, TOKENS), w.blockEncode),
    ),
  );
  const projected = applyDense(attended, w.project);
  const flat = reshape(projected, 1, projected.data.length);
  const latent = gather(flat, tokensToLatentMap(batch), batch, LATENT_DIM);
  return powerNormalise(maskColumns(latent, rate), rate);
}

/** Decoder: received symbols → reconstructed scene in [0, 1]. */
export function decode(model: JsccModel, z: Tensor, batch: number): Tensor {
  const w = model.weights;

  if (w.kind === 'mlp') {
    const hidden = relu(applyDense(z, w.decode1));
    return sigmoid(applyDense(hidden, w.decode2));
  }

  if (w.kind === 'cnn') {
    const h1 = relu(applyConv2d(z, convFor(w.dec1, batch, 'dec1')));
    const up1 = gather(
      h1,
      cachedMap(`up1:${batch}`, () => buildUpsampleMap(32, 4, 4, 2, batch)),
      batch,
      32 * 8 * 8,
    );
    const h2 = relu(applyConv2d(up1, convFor(w.dec2, batch, 'dec2')));
    const up2 = gather(
      h2,
      cachedMap(`up2:${batch}`, () => buildUpsampleMap(16, 8, 8, 2, batch)),
      batch,
      16 * 16 * 16,
    );
    return sigmoid(applyConv2d(up2, convFor(w.dec3, batch, 'dec3')));
  }

  const flat = reshape(z, 1, z.data.length);
  const tokens = gather(flat, latentToTokensMap(batch), batch * TOKENS, TOKEN_LATENT);
  const lifted = add(
    applyDense(tokens, w.lift),
    gather(w.positionDecode, positionMap(batch), batch * TOKENS, TOKEN_DIM),
  );
  const attended = concatRows(
    Array.from({ length: batch }, (_unused, b) =>
      applyAttention(sliceRows(lifted, b * TOKENS, TOKENS), w.blockDecode),
    ),
  );
  const patches = applyDense(attended, w.unembed);
  const patchFlat = reshape(patches, 1, patches.data.length);
  return sigmoid(gather(patchFlat, unpatchifyMap(batch), batch, IMAGE_PIXELS));
}

/**
 * The channel layer: complex AWGN at a given SNR, with the transmit power
 * already fixed by `powerNormalise`.
 *
 * The latent is read as `LATENT_DIM/2` complex symbols. After normalisation the
 * average power per real dimension is 1, so the energy per complex symbol is 2
 * and the noise variance per real dimension that realises an SNR of γ is 1/γ.
 *
 * This is differentiable — the noise is a constant added to the signal, so the
 * gradient passes straight through — which is the whole point: the encoder is
 * trained *through* the channel and therefore learns a representation whose
 * important information is robust to it. That is what separates DeepJSCC from
 * an autoencoder with a noisy bottleneck bolted on afterwards.
 */
export function applyChannel(
  z: Tensor,
  snrDb: number,
  random: () => number,
  fadingGains?: Float64Array,
  activeDims: number = LATENT_DIM,
): Tensor {
  const noise = new Float64Array(z.data.length);
  const rows = z.rows;
  const cols = z.cols;

  for (let r = 0; r < rows; r += 1) {
    // A fading draw scales the effective SNR for the whole block; after
    // equalisation by a known h this is exactly a change of noise variance.
    const gain = fadingGains?.[r] ?? 1;
    const snrLinear = 10 ** (snrDb / 10) * gain;
    const sigma = Math.sqrt(1 / Math.max(snrLinear, 1e-9));
    // Punctured dimensions are not transmitted, so they pick up no noise —
    // the receiver knows they are absent and substitutes zero.
    const active = Math.max(0, Math.min(cols, activeDims));
    for (let c = 0; c < active; c += 1) {
      const u1 = Math.max(random(), Number.MIN_VALUE);
      const u2 = random();
      noise[r * cols + c] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
    }
  }
  return addConstant(z, noise);
}

/** Convenience wrapper: one end-to-end pass. */
export function forward(
  model: JsccModel,
  x: Tensor,
  batch: number,
  snrDb: number,
  random: () => number,
  fadingGains?: Float64Array,
  activeDims: number = LATENT_DIM,
): { latent: Tensor; received: Tensor; output: Tensor } {
  const latent = encode(model, x, batch, activeDims);
  const received = applyChannel(latent, snrDb, random, fadingGains, activeDims);
  const output = decode(model, received, batch);
  return { latent, received, output };
}

/** The rates the models are trained to serve, in complex channel uses. */
export const SUPPORTED_CHANNEL_USES = [32, 24, 16, 8] as const;
export type SupportedRate = (typeof SUPPORTED_CHANNEL_USES)[number];

export { backward, matmul, tensor, zeroGrad };

/** Total trainable scalars — reported in the model card. */
export const parameterCount = (model: JsccModel): number =>
  model.parameters.reduce((total, p) => total + p.data.length, 0);
