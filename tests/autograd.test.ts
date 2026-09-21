import { describe, expect, it } from 'vitest';
import {
  type Tensor,
  adamStep,
  addBias,
  backward,
  createAdamState,
  layerNorm,
  matmul,
  mseLoss,
  parameter,
  powerNormalise,
  relu,
  sigmoid,
  softmaxRows,
  tanh,
  tensor,
  zeroGrad,
} from '../lib/nn/autograd';
import { applyAttention, applyConv2d, createAttentionBlock, createConv2d } from '../lib/nn/layers';
import { ARCHITECTURES, createModel, encode, decode, parameterCount } from '../lib/nn/jscc';
import { IMAGE_PIXELS, makeRng } from '../lib/sources';

/**
 * Finite-difference gradient checking.
 *
 * Nothing else in this repository can verify the training code. A model that
 * trains to a plausible loss with a wrong gradient is entirely possible — it
 * just trains to a worse loss than it should, which looks like "that
 * architecture is weaker" rather than like a bug, and would then be reported to
 * a learner as an experimental finding. These tests are what make the numbers
 * in the model cards defensible.
 *
 * The check is the central difference (f(x+ε) − f(x−ε))/2ε, which has error
 * O(ε²) rather than the O(ε) of a forward difference — with ε = 1e-5 and
 * doubles that leaves several digits of agreement to assert on.
 */
function checkGradients(
  build: () => { loss: Tensor; params: Tensor[] },
  tolerance = 2e-5,
): void {
  const { loss, params } = build();
  zeroGrad(collect(loss));
  backward(loss);

  const analytic = params.map((p) => Float64Array.from(p.grad!));
  const epsilon = 1e-5;

  for (let pIndex = 0; pIndex < params.length; pIndex += 1) {
    const parameterTensor = params[pIndex]!;
    // Checking every scalar of a 12 000-parameter conv stack is needless; a
    // spread of positions catches an indexing error just as well.
    const stride = Math.max(1, Math.floor(parameterTensor.data.length / 7));
    for (let i = 0; i < parameterTensor.data.length; i += stride) {
      const original = parameterTensor.data[i]!;

      parameterTensor.data[i] = original + epsilon;
      const up = build().loss.data[0]!;
      parameterTensor.data[i] = original - epsilon;
      const down = build().loss.data[0]!;
      parameterTensor.data[i] = original;

      const numeric = (up - down) / (2 * epsilon);
      const value = analytic[pIndex]![i]!;
      const scale = Math.max(1, Math.abs(numeric), Math.abs(value));
      expect(Math.abs(numeric - value) / scale).toBeLessThan(tolerance);
    }
  }
}

function collect(root: Tensor): Tensor[] {
  const seen = new Set<Tensor>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...node.parents);
  }
  return [...seen];
}

const target = (length: number, seed: number): Float64Array => {
  const random = makeRng(seed);
  return Float64Array.from({ length }, () => random());
};

describe('autodiff primitives', () => {
  it('differentiates a dense layer with bias', () => {
    const random = makeRng(7);
    const x = tensor(4, 5, Array.from({ length: 20 }, () => random() - 0.5));
    const w = parameter(5, 3, Array.from({ length: 15 }, () => random() - 0.5));
    const b = parameter(1, 3, Array.from({ length: 3 }, () => random() - 0.5));
    const goal = target(12, 3);
    checkGradients(() => ({ loss: mseLoss(addBias(matmul(x, w), b), goal), params: [w, b] }));
  });

  it('differentiates relu, tanh and sigmoid stacks', () => {
    const random = makeRng(11);
    const x = tensor(3, 4, Array.from({ length: 12 }, () => random() * 2 - 1));
    const w = parameter(4, 4, Array.from({ length: 16 }, () => random() * 2 - 1));
    const goal = target(12, 5);
    checkGradients(() => ({ loss: mseLoss(sigmoid(tanh(relu(matmul(x, w)))), goal), params: [w] }));
  });

  it('differentiates a row-wise softmax', () => {
    const random = makeRng(13);
    const w = parameter(3, 5, Array.from({ length: 15 }, () => random() * 2 - 1));
    const goal = target(15, 7);
    checkGradients(() => ({ loss: mseLoss(softmaxRows(w), goal), params: [w] }));
  });

  it('differentiates layer normalisation, including its gain and bias', () => {
    const random = makeRng(17);
    const x = tensor(4, 6, Array.from({ length: 24 }, () => random() * 3 - 1.5));
    const gain = parameter(1, 6, Array.from({ length: 6 }, () => 0.8 + random() * 0.4));
    const bias = parameter(1, 6, Array.from({ length: 6 }, () => random() - 0.5));
    const goal = target(24, 19);
    checkGradients(() => ({ loss: mseLoss(layerNorm(x, gain, bias), goal), params: [gain, bias] }));
  });

  it('differentiates the transmit power constraint', () => {
    const random = makeRng(23);
    const w = parameter(3, 8, Array.from({ length: 24 }, () => random() * 2 - 1));
    const goal = target(24, 29);
    checkGradients(() => ({ loss: mseLoss(powerNormalise(w, 8), goal), params: [w] }));
  });

  it('enforces the power constraint it claims to', () => {
    const random = makeRng(31);
    const z = tensor(5, 16, Array.from({ length: 80 }, () => random() * 10 - 5));
    const normalised = powerNormalise(z, 16);
    for (let r = 0; r < 5; r += 1) {
      let energy = 0;
      for (let c = 0; c < 16; c += 1) energy += normalised.data[r * 16 + c]! ** 2;
      expect(energy).toBeCloseTo(16, 9);
    }
  });

  it('differentiates a strided convolution', () => {
    const random = makeRng(37);
    const conv = createConv2d(
      { inChannels: 2, outChannels: 3, kernel: 3, stride: 2, padding: 1, inHeight: 6, inWidth: 6 },
      2,
      random,
    );
    const x = tensor(2, 2 * 36, Array.from({ length: 144 }, () => random() - 0.5));
    const goal = target(2 * 3 * 9, 41);
    checkGradients(() => ({ loss: mseLoss(applyConv2d(x, conv), goal), params: [conv.weight, conv.bias] }));
  });

  it('differentiates a self-attention block', () => {
    const random = makeRng(43);
    const block = createAttentionBlock(8, 16, random);
    const x = tensor(4, 8, Array.from({ length: 32 }, () => random() - 0.5));
    const goal = target(32, 47);
    checkGradients(
      () => ({
        loss: mseLoss(applyAttention(x, block), goal),
        params: [block.query.weight, block.normGain1, block.ffnUp.weight, block.output.bias],
      }),
      5e-5,
    );
  });
});

describe('JSCC architectures', () => {
  for (const architecture of ARCHITECTURES) {
    it(`produces the agreed shapes and a power-constrained latent — ${architecture.id}`, () => {
      const model = createModel(architecture.id, 99);
      const random = makeRng(53);
      const batch = 3;
      const x = tensor(
        batch,
        IMAGE_PIXELS,
        Array.from({ length: batch * IMAGE_PIXELS }, () => random()),
      );

      const latent = encode(model, x, batch);
      expect(latent.rows).toBe(batch);
      expect(latent.cols).toBe(64);
      for (let r = 0; r < batch; r += 1) {
        let energy = 0;
        for (let c = 0; c < 64; c += 1) energy += latent.data[r * 64 + c]! ** 2;
        expect(energy).toBeCloseTo(64, 6);
      }

      const output = decode(model, latent, batch);
      expect(output.rows).toBe(batch);
      expect(output.cols).toBe(IMAGE_PIXELS);
      for (const value of output.data) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(parameterCount(model)).toBeGreaterThan(1000);
    });

    it(`has a correct end-to-end gradient — ${architecture.id}`, () => {
      const model = createModel(architecture.id, 101);
      const random = makeRng(59);
      const batch = 2;
      const x = tensor(
        batch,
        IMAGE_PIXELS,
        Array.from({ length: batch * IMAGE_PIXELS }, () => random()),
      );
      const goal = target(batch * IMAGE_PIXELS, 61);

      // A representative slice of each model's parameters: the first and last
      // weight tensors exercise both ends of the graph.
      const params = [model.parameters[0]!, model.parameters[model.parameters.length - 2]!];
      checkGradients(() => {
        const latent = encode(model, x, batch);
        return { loss: mseLoss(decode(model, latent, batch), goal), params };
      }, 1e-4);
    });
  }

  it('reduces the loss when trained — Adam actually descends', () => {
    const model = createModel('mlp', 7);
    const random = makeRng(67);
    const batch = 8;
    const x = tensor(
      batch,
      IMAGE_PIXELS,
      Array.from({ length: batch * IMAGE_PIXELS }, () => random()),
    );
    const goal = Float64Array.from(x.data);
    const state = createAdamState(model.parameters);

    const lossAt = () => mseLoss(decode(model, encode(model, x, batch), batch), goal);
    const before = lossAt().data[0]!;

    for (let step = 0; step < 40; step += 1) {
      const loss = lossAt();
      zeroGrad(collect(loss));
      backward(loss);
      adamStep(model.parameters, state, 0.01);
    }

    expect(lossAt().data[0]!).toBeLessThan(before);
  });
});
