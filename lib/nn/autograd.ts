/**
 * A small reverse-mode autodiff engine over dense 2-D matrices.
 *
 * The lab needs real trained models — §5 lists CNN, Transformer and DeepJSCC as
 * selectable AI inputs, and §8 forbids the assistant from generating fake
 * experimental results. A comparison between three architectures is a fake
 * experimental result unless the three architectures exist and were trained.
 * So they are trained, offline, by `scripts/train-models.ts`, and this file is
 * what trains them.
 *
 * Why hand-rolled rather than a library: the browser bundle only ever runs the
 * forward pass, and a training framework would be megabytes of dependency for
 * code that ships nothing. The training script and the browser inference path
 * then share exactly one implementation of every layer, which is the property
 * that matters — a model whose weights were learned under a slightly different
 * forward pass than the one that serves them is a subtly broken model, and the
 * failure looks like bad accuracy rather than like a bug.
 *
 * Correctness is checked by finite differences in `tests/autograd.test.ts`:
 * every op's analytic gradient is compared against (f(x+ε) − f(x−ε))/2ε. That
 * test is the reason to trust anything downstream of this file.
 */

export interface Tensor {
  rows: number;
  cols: number;
  data: Float64Array;
  grad: Float64Array | null;
  /** Nodes this one was computed from, for the topological walk. */
  parents: Tensor[];
  /** Adds this node's contribution to its parents' gradients. */
  backward: (() => void) | null;
  requiresGrad: boolean;
  label?: string;
}

export function tensor(rows: number, cols: number, data?: ArrayLike<number>, requiresGrad = false): Tensor {
  const buffer = new Float64Array(rows * cols);
  if (data) {
    for (let i = 0; i < Math.min(buffer.length, data.length); i += 1) buffer[i] = data[i]!;
  }
  return {
    rows,
    cols,
    data: buffer,
    grad: requiresGrad ? new Float64Array(rows * cols) : null,
    parents: [],
    backward: null,
    requiresGrad,
  };
}

/** A leaf that will be updated by the optimiser. */
export const parameter = (rows: number, cols: number, data?: ArrayLike<number>): Tensor =>
  tensor(rows, cols, data, true);

const derived = (rows: number, cols: number, parents: Tensor[]): Tensor => {
  const requiresGrad = parents.some((p) => p.requiresGrad);
  const node = tensor(rows, cols, undefined, false);
  node.requiresGrad = requiresGrad;
  node.grad = requiresGrad ? new Float64Array(rows * cols) : null;
  node.parents = parents;
  return node;
};

/** Zeroes every gradient reachable from `root`. */
export function zeroGrad(nodes: Tensor[]): void {
  for (const node of nodes) node.grad?.fill(0);
}

/**
 * Backward pass from a scalar node.
 *
 * Iterative, not recursive: a transformer block is deep enough that a recursive
 * walk over a batch graph can exhaust the stack, and that failure looks like a
 * mysterious crash halfway through epoch 3.
 */
export function backward(loss: Tensor): void {
  if (loss.rows !== 1 || loss.cols !== 1) {
    throw new Error('backward() expects a scalar loss');
  }

  const order: Tensor[] = [];
  const seen = new Set<Tensor>();
  const stack: { node: Tensor; expanded: boolean }[] = [{ node: loss, expanded: false }];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.expanded) {
      order.push(frame.node);
      continue;
    }
    if (seen.has(frame.node)) continue;
    seen.add(frame.node);
    stack.push({ node: frame.node, expanded: true });
    for (const parent of frame.node.parents) {
      if (!seen.has(parent)) stack.push({ node: parent, expanded: false });
    }
  }

  loss.grad![0] = 1;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    order[i]!.backward?.();
  }
}

// ----------------------------------------------------------------------- ops

/** C = A · B. */
export function matmul(a: Tensor, b: Tensor): Tensor {
  if (a.cols !== b.rows) throw new Error(`matmul shape mismatch: ${a.rows}x${a.cols} · ${b.rows}x${b.cols}`);
  const out = derived(a.rows, b.cols, [a, b]);

  for (let i = 0; i < a.rows; i += 1) {
    for (let k = 0; k < a.cols; k += 1) {
      const av = a.data[i * a.cols + k]!;
      if (av === 0) continue;
      for (let j = 0; j < b.cols; j += 1) {
        out.data[i * b.cols + j] += av * b.data[k * b.cols + j]!;
      }
    }
  }

  out.backward = () => {
    const g = out.grad!;
    if (a.grad) {
      for (let i = 0; i < a.rows; i += 1) {
        for (let j = 0; j < b.cols; j += 1) {
          const gv = g[i * b.cols + j]!;
          if (gv === 0) continue;
          for (let k = 0; k < a.cols; k += 1) {
            a.grad[i * a.cols + k] += gv * b.data[k * b.cols + j]!;
          }
        }
      }
    }
    if (b.grad) {
      for (let i = 0; i < a.rows; i += 1) {
        for (let k = 0; k < a.cols; k += 1) {
          const av = a.data[i * a.cols + k]!;
          if (av === 0) continue;
          for (let j = 0; j < b.cols; j += 1) {
            b.grad[k * b.cols + j] += av * g[i * b.cols + j]!;
          }
        }
      }
    }
  };
  return out;
}

/** Adds a 1×C bias row to every row of A. */
export function addBias(a: Tensor, bias: Tensor): Tensor {
  if (bias.rows !== 1 || bias.cols !== a.cols) throw new Error('bias shape mismatch');
  const out = derived(a.rows, a.cols, [a, bias]);
  for (let i = 0; i < a.rows; i += 1) {
    for (let j = 0; j < a.cols; j += 1) {
      out.data[i * a.cols + j] = a.data[i * a.cols + j]! + bias.data[j]!;
    }
  }
  out.backward = () => {
    const g = out.grad!;
    if (a.grad) for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]!;
    if (bias.grad) {
      for (let i = 0; i < a.rows; i += 1) {
        for (let j = 0; j < a.cols; j += 1) bias.grad[j] += g[i * a.cols + j]!;
      }
    }
  };
  return out;
}

/** Elementwise sum of two identically shaped tensors. */
export function add(a: Tensor, b: Tensor): Tensor {
  if (a.rows !== b.rows || a.cols !== b.cols) throw new Error('add shape mismatch');
  const out = derived(a.rows, a.cols, [a, b]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = a.data[i]! + b.data[i]!;
  out.backward = () => {
    const g = out.grad!;
    if (a.grad) for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]!;
    if (b.grad) for (let i = 0; i < g.length; i += 1) b.grad[i] += g[i]!;
  };
  return out;
}

export function scale(a: Tensor, k: number): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = a.data[i]! * k;
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]! * k;
  };
  return out;
}

/** Adds a constant matrix — the channel noise layer. No gradient to the noise. */
export function addConstant(a: Tensor, constant: Float64Array): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = a.data[i]! + (constant[i] ?? 0);
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]!;
  };
  return out;
}

export function relu(a: Tensor): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = Math.max(0, a.data[i]!);
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) if (a.data[i]! > 0) a.grad[i] += g[i]!;
  };
  return out;
}

export function tanh(a: Tensor): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = Math.tanh(a.data[i]!);
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]! * (1 - out.data[i]! * out.data[i]!);
  };
  return out;
}

/** Logistic sigmoid — the output activation for pixels in [0, 1]. */
export function sigmoid(a: Tensor): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.data.length; i += 1) out.data[i] = 1 / (1 + Math.exp(-a.data[i]!));
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) {
      const s = out.data[i]!;
      a.grad[i] += g[i]! * s * (1 - s);
    }
  };
  return out;
}

/**
 * Row-wise softmax.
 *
 * Shifted by the row maximum before exponentiating. Without the shift an
 * attention logit of 800 — which happens the moment a learning rate is a little
 * too high — overflows to Infinity and every subsequent number is NaN.
 */
export function softmaxRows(a: Tensor): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  for (let i = 0; i < a.rows; i += 1) {
    const base = i * a.cols;
    let max = Number.NEGATIVE_INFINITY;
    for (let j = 0; j < a.cols; j += 1) max = Math.max(max, a.data[base + j]!);
    let sum = 0;
    for (let j = 0; j < a.cols; j += 1) {
      const e = Math.exp(a.data[base + j]! - max);
      out.data[base + j] = e;
      sum += e;
    }
    for (let j = 0; j < a.cols; j += 1) out.data[base + j] /= sum;
  }
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < a.rows; i += 1) {
      const base = i * a.cols;
      let dot = 0;
      for (let j = 0; j < a.cols; j += 1) dot += g[base + j]! * out.data[base + j]!;
      for (let j = 0; j < a.cols; j += 1) {
        a.grad[base + j] += out.data[base + j]! * (g[base + j]! - dot);
      }
    }
  };
  return out;
}

/** Row-wise layer normalisation with learned gain and bias. */
export function layerNorm(a: Tensor, gain: Tensor, bias: Tensor, eps = 1e-5): Tensor {
  const out = derived(a.rows, a.cols, [a, gain, bias]);
  const means = new Float64Array(a.rows);
  const inverseStd = new Float64Array(a.rows);

  for (let i = 0; i < a.rows; i += 1) {
    const base = i * a.cols;
    let mean = 0;
    for (let j = 0; j < a.cols; j += 1) mean += a.data[base + j]!;
    mean /= a.cols;
    let variance = 0;
    for (let j = 0; j < a.cols; j += 1) {
      const d = a.data[base + j]! - mean;
      variance += d * d;
    }
    variance /= a.cols;
    const inv = 1 / Math.sqrt(variance + eps);
    means[i] = mean;
    inverseStd[i] = inv;
    for (let j = 0; j < a.cols; j += 1) {
      out.data[base + j] = (a.data[base + j]! - mean) * inv * gain.data[j]! + bias.data[j]!;
    }
  }

  out.backward = () => {
    const g = out.grad!;
    for (let i = 0; i < a.rows; i += 1) {
      const base = i * a.cols;
      const inv = inverseStd[i]!;
      const mean = means[i]!;

      let sumDy = 0;
      let sumDyXhat = 0;
      for (let j = 0; j < a.cols; j += 1) {
        const xhat = (a.data[base + j]! - mean) * inv;
        const dy = g[base + j]! * gain.data[j]!;
        sumDy += dy;
        sumDyXhat += dy * xhat;
        if (gain.grad) gain.grad[j] += g[base + j]! * xhat;
        if (bias.grad) bias.grad[j] += g[base + j]!;
      }
      if (a.grad) {
        for (let j = 0; j < a.cols; j += 1) {
          const xhat = (a.data[base + j]! - mean) * inv;
          const dy = g[base + j]! * gain.data[j]!;
          a.grad[base + j] += (inv / a.cols) * (a.cols * dy - sumDy - xhat * sumDyXhat);
        }
      }
    }
  };
  return out;
}

export function transpose(a: Tensor): Tensor {
  const out = derived(a.cols, a.rows, [a]);
  for (let i = 0; i < a.rows; i += 1) {
    for (let j = 0; j < a.cols; j += 1) out.data[j * a.rows + i] = a.data[i * a.cols + j]!;
  }
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < a.rows; i += 1) {
      for (let j = 0; j < a.cols; j += 1) a.grad[i * a.cols + j] += g[j * a.rows + i]!;
    }
  };
  return out;
}

/** Reinterprets the same values with a different shape. */
export function reshape(a: Tensor, rows: number, cols: number): Tensor {
  if (rows * cols !== a.rows * a.cols) throw new Error('reshape size mismatch');
  const out = derived(rows, cols, [a]);
  out.data.set(a.data);
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < g.length; i += 1) a.grad[i] += g[i]!;
  };
  return out;
}

/**
 * Zeroes every column at or beyond `activeCols` — rate adaptation by puncturing.
 *
 * A learner's "compression level" has to change what is actually sent, not just
 * a label. Puncturing the tail of the latent is how rate-adaptive DeepJSCC does
 * it: the encoder emits an ordered representation, and the transmitter sends as
 * many of the leading symbols as the bandwidth allows. Training with the cut
 * point drawn at random is what makes that ordering meaningful — without it the
 * encoder spreads information evenly and dropping any symbol is equally
 * damaging.
 */
export function maskColumns(a: Tensor, activeCols: number): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  const active = Math.max(0, Math.min(a.cols, activeCols));
  for (let r = 0; r < a.rows; r += 1) {
    for (let c = 0; c < active; c += 1) out.data[r * a.cols + c] = a.data[r * a.cols + c]!;
  }
  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let r = 0; r < a.rows; r += 1) {
      for (let c = 0; c < active; c += 1) a.grad[r * a.cols + c] += g[r * a.cols + c]!;
    }
  };
  return out;
}

/**
 * Per-row power normalisation to a total energy of `targetEnergy`.
 *
 * This is the transmit power constraint in DeepJSCC: whatever the encoder
 * produces, the radio can only send a signal of a fixed average power, so the
 * latent is projected onto that sphere before the channel. Training without it
 * lets the encoder "beat" the noise by simply scaling up, which is not a coding
 * gain and does not survive contact with a power amplifier.
 *
 *   y = x·s/‖x‖,   ∂y/∂x · g = (s/‖x‖)·(g − x(x·g)/‖x‖²)
 */
export function powerNormalise(a: Tensor, targetEnergy: number): Tensor {
  const out = derived(a.rows, a.cols, [a]);
  const norms = new Float64Array(a.rows);
  const s = Math.sqrt(targetEnergy);

  for (let i = 0; i < a.rows; i += 1) {
    const base = i * a.cols;
    let sum = 0;
    for (let j = 0; j < a.cols; j += 1) sum += a.data[base + j]! ** 2;
    const norm = Math.sqrt(sum) || 1e-12;
    norms[i] = norm;
    for (let j = 0; j < a.cols; j += 1) out.data[base + j] = (a.data[base + j]! * s) / norm;
  }

  out.backward = () => {
    if (!a.grad) return;
    const g = out.grad!;
    for (let i = 0; i < a.rows; i += 1) {
      const base = i * a.cols;
      const norm = norms[i]!;
      let dot = 0;
      for (let j = 0; j < a.cols; j += 1) dot += a.data[base + j]! * g[base + j]!;
      for (let j = 0; j < a.cols; j += 1) {
        a.grad[base + j] +=
          (s / norm) * (g[base + j]! - (a.data[base + j]! * dot) / (norm * norm));
      }
    }
  };
  return out;
}

/** Mean squared error against a fixed target. Returns a 1×1 scalar. */
export function mseLoss(prediction: Tensor, target: Float64Array): Tensor {
  const out = derived(1, 1, [prediction]);
  const n = prediction.data.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = prediction.data[i]! - (target[i] ?? 0);
    sum += d * d;
  }
  out.data[0] = sum / n;
  out.backward = () => {
    if (!prediction.grad) return;
    const g = out.grad![0]!;
    for (let i = 0; i < n; i += 1) {
      prediction.grad[i] += (2 * g * (prediction.data[i]! - (target[i] ?? 0))) / n;
    }
  };
  return out;
}

/**
 * Importance-weighted MSE.
 *
 * `weights` has one entry per column, so a learner's "semantic importance"
 * setting can actually change what the network is optimised for rather than
 * being a slider that multiplies the displayed score.
 */
export function weightedMseLoss(
  prediction: Tensor,
  target: Float64Array,
  weights: Float64Array,
): Tensor {
  const out = derived(1, 1, [prediction]);
  const n = prediction.data.length;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < n; i += 1) {
    const w = weights[i % prediction.cols] ?? 1;
    const d = prediction.data[i]! - (target[i] ?? 0);
    sum += w * d * d;
    weightSum += w;
  }
  const denominator = (weightSum / prediction.cols) * prediction.rows || 1;
  out.data[0] = sum / denominator;
  out.backward = () => {
    if (!prediction.grad) return;
    const g = out.grad![0]!;
    for (let i = 0; i < n; i += 1) {
      const w = weights[i % prediction.cols] ?? 1;
      prediction.grad[i] += (2 * g * w * (prediction.data[i]! - (target[i] ?? 0))) / denominator;
    }
  };
  return out;
}

// ------------------------------------------------------------------- Adam

export interface AdamState {
  m: Float64Array;
  v: Float64Array;
  step: number;
}

export function createAdamState(parameters: Tensor[]): Map<Tensor, AdamState> {
  const state = new Map<Tensor, AdamState>();
  for (const p of parameters) {
    state.set(p, { m: new Float64Array(p.data.length), v: new Float64Array(p.data.length), step: 0 });
  }
  return state;
}

/** Adam (Kingma & Ba, 2015) with decoupled gradient clipping by global norm. */
export function adamStep(
  parameters: Tensor[],
  state: Map<Tensor, AdamState>,
  learningRate: number,
  options: { beta1?: number; beta2?: number; eps?: number; clipNorm?: number } = {},
): void {
  const beta1 = options.beta1 ?? 0.9;
  const beta2 = options.beta2 ?? 0.999;
  const eps = options.eps ?? 1e-8;
  const clipNorm = options.clipNorm ?? 5;

  let globalNorm = 0;
  for (const p of parameters) {
    if (!p.grad) continue;
    for (let i = 0; i < p.grad.length; i += 1) globalNorm += p.grad[i]! ** 2;
  }
  globalNorm = Math.sqrt(globalNorm);
  const clipScale = globalNorm > clipNorm ? clipNorm / globalNorm : 1;

  for (const p of parameters) {
    if (!p.grad) continue;
    const s = state.get(p);
    if (!s) continue;
    s.step += 1;
    const correction1 = 1 - beta1 ** s.step;
    const correction2 = 1 - beta2 ** s.step;
    for (let i = 0; i < p.data.length; i += 1) {
      const g = p.grad[i]! * clipScale;
      s.m[i] = beta1 * s.m[i]! + (1 - beta1) * g;
      s.v[i] = beta2 * s.v[i]! + (1 - beta2) * g * g;
      const mHat = s.m[i]! / correction1;
      const vHat = s.v[i]! / correction2;
      p.data[i] -= (learningRate * mHat) / (Math.sqrt(vHat) + eps);
    }
  }
}
