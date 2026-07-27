import type { KnowledgeBankItem } from '../types';
import { sample, shuffle } from './random';

export interface GeneratedQuestion {
  /** The glossary definition the learner must match to a term. */
  question: string;
  options: string[];
  correctAnswer: string;
}

export const OPTIONS_PER_QUESTION = 4;

/**
 * Builds a definition-matching quiz from the glossary.
 *
 * The previous implementation shuffled the glossary once, took the first N items
 * as the questions, and then drew every question's distractors from
 * `shuffled.filter(notTheAnswer).slice(0, 3)` — i.e. the first three entries of
 * that same array. Two consequences, both fatal for an assessment:
 *
 *   - nearly every question showed the same three distractors, so a learner
 *     could answer correctly by spotting the one option that was not one of
 *     the usual three;
 *   - when the correct term was itself among those first entries the distractor
 *     set shifted by one, leaking which option was correct.
 *
 * Here each question draws its own distractors from the terms that are not the
 * answer, and the option order is shuffled independently.
 */
export function generateQuestions(
  glossary: readonly KnowledgeBankItem[],
  questionCount: number,
): GeneratedQuestion[] {
  if (glossary.length < 2) return [];

  const optionCount = Math.min(OPTIONS_PER_QUESTION, glossary.length);

  return sample(glossary, questionCount).map((answer) => {
    const distractors = sample(
      glossary.filter((item) => item.term !== answer.term),
      optionCount - 1,
    ).map((item) => item.term);

    return {
      question: answer.definition,
      options: shuffle([...distractors, answer.term]),
      correctAnswer: answer.term,
    };
  });
}
