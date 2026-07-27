/**
 * Uniform Fisher–Yates shuffle, returning a new array.
 *
 * Replaces `array.sort(() => 0.5 - Math.random())`, which is a well-known broken
 * shuffle: comparison sorts assume a consistent comparator, and a random one
 * produces a markedly non-uniform distribution that varies by engine. For a quiz
 * that means some orderings appear far more often than others.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Returns up to `count` distinct items chosen uniformly at random. */
export function sample<T>(input: readonly T[], count: number): T[] {
  return shuffle(input).slice(0, Math.max(0, count));
}
