/**
 * Layers built on the autodiff core.
 *
 * Everything that rearranges values — im2col for convolution, patchifying for
 * the transformer, slicing a batch apart for attention — is expressed as one
 * `gather` op with a precomputed index map. That is worth doing once rather
 * than writing a bespoke backward pass for each rearrangement: a gather's
 * gradient is a scatter-add, which is three lines and hard to get wrong, while
 * a hand-derived col2im is a dozen nested loops and easy to get subtly wrong in
 * a way that still trains, just worse.
 */

import {
  type Tensor,
  add,
  addBias,
  layerNorm,
  matmul,
  parameter,
  relu,
  reshape,
  scale,
  softmaxRows,
  tensor,
} from './autograd';

/**
 * Rearranges values by an index map. `map[i] < 0` emits a zero (used for
 * convolution padding), and repeated indices accumulate on the backward pass.
 */
export function gather(a: Tensor, map: Int32Array, rows: number, cols: number): Tensor {
  if (map.length !== rows * cols) throw new Error('gather map size mismatch');
  const out = tensor(rows, cols);
  out.requiresGrad = a.requiresGrad;
  out.grad = a.requiresGrad ? new Float64Array(rows * cols) : null;
  out.parents = [a];
  for (let i = 0; i < map.length; i += 1) {
    const source = map[i]!;
    out.data[i] = source < 0 ? 0 : a.data[source]!;
  }
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < map.length; i += 1) {
      const source = map[i]!;
      if (source >= 0) a.grad[source] += g[i]!;
    }
  };
  return out;
}

/** Concatenates tensors along rows; all must share a column count. */
export function concatRows(parts: Tensor[]): Tensor {
  const cols = parts[0]?.cols ?? 0;
  const rows = parts.reduce((total, p) => total + p.rows, 0);
  const out = tensor(rows, cols);
  out.requiresGrad = parts.some((p) => p.requiresGrad);
  out.grad = out.requiresGrad ? new Float64Array(rows * cols) : null;
  out.parents = parts;

  let offset = 0;
  const offsets: number[] = [];
  for (const part of parts) {
    offsets.push(offset);
    out.data.set(part.data, offset);
    offset += part.data.length;
  }

  out.backward = () => {
    const g = out.grad!;
    parts.forEach((part, index) => {
      if (!part.grad) return;
      const base = offsets[index]!;
      for (let i = 0; i < part.data.length; i += 1) part.grad[i] += g[base + i]!;
    });
  };
  return out;
}

export function sliceRows(a: Tensor, start: number, count: number): Tensor {
  const map = new Int32Array(count * a.cols);
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < a.cols; j += 1) map[i * a.cols + j] = (start + i) * a.cols + j;
  }
  return gather(a, map, count, a.cols);
}

// ------------------------------------------------------------------- dense

export interface Dense {
  weight: Tensor;
  bias: Tensor;
}

/**
 * He initialisation for ReLU stacks, Xavier otherwise.
 *
 * Not a detail: with a naive N(0, 1) init a four-layer stack either saturates
 * or collapses within a few hundred steps, and the resulting model would be
 * reported as "the architecture performing poorly" when the architecture was
 * never given a chance.
 */
export function createDense(inputs: number, outputs: number, random: () => number, gain = 2): Dense {
  const scaleFactor = Math.sqrt(gain / inputs);
  const weight = parameter(inputs, outputs);
  for (let i = 0; i < weight.data.length; i += 1) {
    // Box–Muller for a normal sample.
    const u1 = Math.max(random(), Number.MIN_VALUE);
    const u2 = random();
    weight.data[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scaleFactor;
  }
  return { weight, bias: parameter(1, outputs) };
}

export const applyDense = (x: Tensor, dense: Dense): Tensor =>
  addBias(matmul(x, dense.weight), dense.bias);

export const denseParameters = (dense: Dense): Tensor[] => [dense.weight, dense.bias];

// -------------------------------------------------------------- convolution

export interface ConvSpec {
  inChannels: number;
  outChannels: number;
  kernel: number;
  stride: number;
  padding: number;
  inHeight: number;
  inWidth: number;
}

export const convOutputSize = (spec: ConvSpec): { height: number; width: number } => ({
  height: Math.floor((spec.inHeight + 2 * spec.padding - spec.kernel) / spec.stride) + 1,
  width: Math.floor((spec.inWidth + 2 * spec.padding - spec.kernel) / spec.stride) + 1,
});

export interface Conv2d {
  spec: ConvSpec;
  /** [inChannels·k·k, outChannels] — convolution as a matrix multiply. */
  weight: Tensor;
  bias: Tensor;
  /** Cached maps; building them per forward pass dominated the training time. */
  im2colMap: Int32Array;
  outputMap: Int32Array;
  batch: number;
}

/**
 * Builds the im2col gather map for a whole batch.
 *
 * Input rows are samples, each row laid out channel-major: [c][y][x]. The map
 * produces one row per (sample, output pixel) with the receptive field
 * flattened, so the convolution itself is a single matmul.
 */
function buildIm2ColMap(spec: ConvSpec, batch: number): Int32Array {
  const { height: outH, width: outW } = convOutputSize(spec);
  const patch = spec.inChannels * spec.kernel * spec.kernel;
  const map = new Int32Array(batch * outH * outW * patch);
  const inputStride = spec.inChannels * spec.inHeight * spec.inWidth;

  let index = 0;
  for (let b = 0; b < batch; b += 1) {
    for (let oy = 0; oy < outH; oy += 1) {
      for (let ox = 0; ox < outW; ox += 1) {
        for (let c = 0; c < spec.inChannels; c += 1) {
          for (let ky = 0; ky < spec.kernel; ky += 1) {
            for (let kx = 0; kx < spec.kernel; kx += 1) {
              const y = oy * spec.stride + ky - spec.padding;
              const x = ox * spec.stride + kx - spec.padding;
              map[index] =
                y < 0 || x < 0 || y >= spec.inHeight || x >= spec.inWidth
                  ? -1
                  : b * inputStride + c * spec.inHeight * spec.inWidth + y * spec.inWidth + x;
              index += 1;
            }
          }
        }
      }
    }
  }
  return map;
}

/**
 * Maps the matmul output — [batch·outH·outW, outChannels] — back to one row per
 * sample laid out channel-major, so the next convolution can consume it.
 */
function buildOutputMap(spec: ConvSpec, batch: number): Int32Array {
  const { height: outH, width: outW } = convOutputSize(spec);
  const perSample = spec.outChannels * outH * outW;
  const map = new Int32Array(batch * perSample);
  for (let b = 0; b < batch; b += 1) {
    for (let c = 0; c < spec.outChannels; c += 1) {
      for (let y = 0; y < outH; y += 1) {
        for (let x = 0; x < outW; x += 1) {
          const destination = b * perSample + c * outH * outW + y * outW + x;
          const source = (b * outH * outW + y * outW + x) * spec.outChannels + c;
          map[destination] = source;
        }
      }
    }
  }
  return map;
}

export function createConv2d(spec: ConvSpec, batch: number, random: () => number): Conv2d {
  const patch = spec.inChannels * spec.kernel * spec.kernel;
  const dense = createDense(patch, spec.outChannels, random);
  return {
    spec,
    weight: dense.weight,
    bias: dense.bias,
    im2colMap: buildIm2ColMap(spec, batch),
    outputMap: buildOutputMap(spec, batch),
    batch,
  };
}

/** Rebuilds the cached maps for a different batch size (evaluation, inference). */
export function withBatch(conv: Conv2d, batch: number): Conv2d {
  if (conv.batch === batch) return conv;
  return {
    ...conv,
    batch,
    im2colMap: buildIm2ColMap(conv.spec, batch),
    outputMap: buildOutputMap(conv.spec, batch),
  };
}

export function applyConv2d(x: Tensor, conv: Conv2d): Tensor {
  const { height: outH, width: outW } = convOutputSize(conv.spec);
  const patch = conv.spec.inChannels * conv.spec.kernel * conv.spec.kernel;
  const columns = gather(x, conv.im2colMap, conv.batch * outH * outW, patch);
  const product = addBias(matmul(columns, conv.weight), conv.bias);
  const flat = reshape(product, 1, product.data.length);
  const mapped = gather(flat, conv.outputMap, conv.batch, conv.spec.outChannels * outH * outW);
  return mapped;
}

export const convParameters = (conv: Conv2d): Tensor[] => [conv.weight, conv.bias];

/**
 * Nearest-neighbour upsampling by an integer factor, as a gather.
 *
 * Paired with a convolution this is the "resize-convolution" decoder of Odena
 * et al. (2016). Transposed convolution is the alternative and produces the
 * checkerboard artefacts that paper is about; at 16×16 those artefacts would be
 * a large fraction of the image.
 */
export function buildUpsampleMap(
  channels: number,
  height: number,
  width: number,
  factor: number,
  batch: number,
): Int32Array {
  const outH = height * factor;
  const outW = width * factor;
  const perSample = channels * outH * outW;
  const map = new Int32Array(batch * perSample);
  for (let b = 0; b < batch; b += 1) {
    for (let c = 0; c < channels; c += 1) {
      for (let y = 0; y < outH; y += 1) {
        for (let x = 0; x < outW; x += 1) {
          const sourceY = Math.floor(y / factor);
          const sourceX = Math.floor(x / factor);
          map[b * perSample + c * outH * outW + y * outW + x] =
            b * channels * height * width + c * height * width + sourceY * width + sourceX;
        }
      }
    }
  }
  return map;
}

// -------------------------------------------------------------- attention

export interface AttentionBlock {
  query: Dense;
  key: Dense;
  value: Dense;
  output: Dense;
  ffnUp: Dense;
  ffnDown: Dense;
  normGain1: Tensor;
  normBias1: Tensor;
  normGain2: Tensor;
  normBias2: Tensor;
  dim: number;
}

export function createAttentionBlock(dim: number, hidden: number, random: () => number): AttentionBlock {
  const ones = (n: number) => {
    const t = parameter(1, n);
    t.data.fill(1);
    return t;
  };
  return {
    query: createDense(dim, dim, random, 1),
    key: createDense(dim, dim, random, 1),
    value: createDense(dim, dim, random, 1),
    output: createDense(dim, dim, random, 1),
    ffnUp: createDense(dim, hidden, random),
    ffnDown: createDense(hidden, dim, random, 1),
    normGain1: ones(dim),
    normBias1: parameter(1, dim),
    normGain2: ones(dim),
    normBias2: parameter(1, dim),
    dim,
  };
}

export const attentionParameters = (block: AttentionBlock): Tensor[] => [
  ...denseParameters(block.query),
  ...denseParameters(block.key),
  ...denseParameters(block.value),
  ...denseParameters(block.output),
  ...denseParameters(block.ffnUp),
  ...denseParameters(block.ffnDown),
  block.normGain1,
  block.normBias1,
  block.normGain2,
  block.normBias2,
];

/**
 * Pre-norm single-head self-attention over `tokens` rows, for one sample.
 *
 * Single head, because at dim 32 and 16 tokens splitting into heads would leave
 * each head with 8 dimensions and nothing to specialise on. Pre-norm rather
 * than post-norm because it trains without a warmup schedule, and a warmup
 * schedule is one more thing to get wrong in a script nobody will run twice.
 */
export function applyAttention(tokensIn: Tensor, block: AttentionBlock): Tensor {
  const normed = layerNorm(tokensIn, block.normGain1, block.normBias1);
  const q = applyDense(normed, block.query);
  const k = applyDense(normed, block.key);
  const v = applyDense(normed, block.value);

  // Scaled dot-product: softmax(QKᵀ/√d)·V.
  const scores = scale(matmul(q, transposeTokens(k)), 1 / Math.sqrt(block.dim));
  const weights = softmaxRows(scores);
  const attended = matmul(weights, v);
  const projected = applyDense(attended, block.output);
  const residual = add(tokensIn, projected);

  const normed2 = layerNorm(residual, block.normGain2, block.normBias2);
  const hidden = relu(applyDense(normed2, block.ffnUp));
  return add(residual, applyDense(hidden, block.ffnDown));
}

/** Local transpose for the attention scores (kept separate for clarity). */
function transposeTokens(a: Tensor): Tensor {
  const map = new Int32Array(a.rows * a.cols);
  for (let i = 0; i < a.rows; i += 1) {
    for (let j = 0; j < a.cols; j += 1) map[j * a.rows + i] = i * a.cols + j;
  }
  return gather(a, map, a.cols, a.rows);
}
