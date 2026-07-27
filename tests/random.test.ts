import { describe, expect, it } from 'vitest';
import { sample, shuffle } from '../lib/random';

describe('shuffle', () => {
  it('returns a new array and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5]) as readonly number[];
    const result = shuffle(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves every element exactly once', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(input).sort((a, b) => a - b)).toEqual(input);
  });

  it.each([[[]], [[1]]])('handles trivial input %j', (input) => {
    expect(shuffle(input as number[])).toEqual(input);
  });

  /**
   * Uniformity check — the reason this module replaced
   * `array.sort(() => 0.5 - Math.random())`, whose distribution is markedly
   * skewed because a random comparator violates sort's ordering contract.
   *
   * Over 12,000 shuffles of 3 elements each permutation should appear ~2,000
   * times. The bounds are wide enough not to flake but tight enough that the
   * old comparator-based shuffle fails them.
   */
  it('produces a near-uniform distribution over permutations', () => {
    const counts = new Map<string, number>();
    const runs = 12_000;

    for (let i = 0; i < runs; i += 1) {
      const key = shuffle([0, 1, 2]).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.size).toBe(6);
    const expected = runs / 6;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it('moves the first element away from position 0 most of the time', () => {
    let stayed = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (shuffle([0, 1, 2, 3, 4])[0] === 0) stayed += 1;
    }
    // Expected ~1/5 of the time.
    expect(stayed / 3000).toBeGreaterThan(0.14);
    expect(stayed / 3000).toBeLessThan(0.26);
  });
});

describe('sample', () => {
  it('returns the requested count', () => {
    expect(sample([1, 2, 3, 4, 5], 3)).toHaveLength(3);
  });

  it('never repeats an element', () => {
    const result = sample([1, 2, 3, 4, 5, 6, 7, 8], 5);
    expect(new Set(result).size).toBe(result.length);
  });

  it('caps at the input length rather than padding', () => {
    expect(sample([1, 2], 10)).toHaveLength(2);
  });

  it('treats a non-positive count as empty', () => {
    expect(sample([1, 2, 3], 0)).toEqual([]);
    expect(sample([1, 2, 3], -4)).toEqual([]);
  });
});
