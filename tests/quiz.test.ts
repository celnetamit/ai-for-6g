import { describe, expect, it } from 'vitest';
import { generateQuestions, OPTIONS_PER_QUESTION } from '../lib/quiz';
import type { KnowledgeBankItem } from '../types';

const glossary: KnowledgeBankItem[] = Array.from({ length: 12 }, (_, index) => ({
  term: `Term ${index}`,
  definition: `Definition ${index}`,
}));

describe('generateQuestions', () => {
  it('returns the requested number of questions', () => {
    expect(generateQuestions(glossary, 5)).toHaveLength(5);
  });

  it('always includes the correct answer among the options', () => {
    for (const question of generateQuestions(glossary, 8)) {
      expect(question.options).toContain(question.correctAnswer);
    }
  });

  it('gives every question the full set of options with no duplicates', () => {
    for (const question of generateQuestions(glossary, 8)) {
      expect(question.options).toHaveLength(OPTIONS_PER_QUESTION);
      expect(new Set(question.options).size).toBe(OPTIONS_PER_QUESTION);
    }
  });

  it('pairs each definition with its own term', () => {
    for (const question of generateQuestions(glossary, 10)) {
      const index = question.question.replace('Definition ', '');
      expect(question.correctAnswer).toBe(`Term ${index}`);
    }
  });

  /**
   * The regression this file exists for.
   *
   * The old implementation drew every question's distractors from the head of a
   * single shuffled array, so the same three wrong answers appeared on nearly
   * every question and the correct one could be found by elimination alone.
   */
  it('does not reuse the same distractor set across questions', () => {
    const distractorSets = new Set<string>();

    for (let round = 0; round < 20; round += 1) {
      for (const question of generateQuestions(glossary, 5)) {
        const distractors = question.options
          .filter((option) => option !== question.correctAnswer)
          .sort()
          .join('|');
        distractorSets.add(distractors);
      }
    }

    // With 12 terms there are many possible distractor triples; a degenerate
    // generator would produce only a handful.
    expect(distractorSets.size).toBeGreaterThan(20);
  });

  it('never offers the correct answer twice or lists it as a distractor', () => {
    for (const question of generateQuestions(glossary, 10)) {
      const occurrences = question.options.filter((o) => o === question.correctAnswer).length;
      expect(occurrences).toBe(1);
    }
  });

  it('does not place the answer in a predictable position', () => {
    const positions = new Set<number>();
    for (let round = 0; round < 40; round += 1) {
      for (const question of generateQuestions(glossary, 3)) {
        positions.add(question.options.indexOf(question.correctAnswer));
      }
    }
    expect(positions.size).toBe(OPTIONS_PER_QUESTION);
  });

  it('handles a glossary smaller than the option count', () => {
    const tiny: KnowledgeBankItem[] = [
      { term: 'A', definition: 'a' },
      { term: 'B', definition: 'b' },
    ];
    const questions = generateQuestions(tiny, 5);
    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect(question.options).toHaveLength(2);
      expect(question.options).toContain(question.correctAnswer);
    }
  });

  it('returns nothing when there are not enough terms to build a question', () => {
    expect(generateQuestions([], 5)).toEqual([]);
    expect(generateQuestions([{ term: 'A', definition: 'a' }], 5)).toEqual([]);
  });
});
