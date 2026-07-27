import React, { useCallback, useState } from 'react';
import { content } from '../data/content';
import { generateQuestions, type GeneratedQuestion } from '../lib/quiz';
import Card from './ui/Card';
import Button from './ui/Button';

const NUM_QUESTIONS = 5;

type QuizState = 'idle' | 'active' | 'finished';

const KnowledgeCheck: React.FC = () => {
  const { glossary } = content.knowledgeBank;

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [quizState, setQuizState] = useState<QuizState>('idle');

  const startQuiz = useCallback(() => {
    setQuestions(generateQuestions(glossary, NUM_QUESTIONS));
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setQuizState('active');
  }, [glossary]);

  const currentQuestion = questions[currentIndex];

  const handleAnswerSelect = useCallback(
    (answer: string) => {
      // Guard on `showResult` so a second click cannot score the same question
      // twice — the old version relied on the disabled attribute alone, which
      // keyboard activation can outrun.
      if (showResult || !currentQuestion) return;
      setSelectedAnswer(answer);
      setShowResult(true);
      if (answer === currentQuestion.correctAnswer) setScore((previous) => previous + 1);
    },
    [showResult, currentQuestion],
  );

  const handleNextQuestion = useCallback(() => {
    setShowResult(false);
    setSelectedAnswer(null);
    setCurrentIndex((previous) => {
      if (previous < questions.length - 1) return previous + 1;
      setQuizState('finished');
      return previous;
    });
  }, [questions.length]);

  const getOptionClassName = (option: string): string => {
    if (!showResult) {
      return 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600';
    }
    if (option === currentQuestion?.correctAnswer) return 'bg-green-200 dark:bg-green-800';
    if (option === selectedAnswer) return 'bg-red-200 dark:bg-red-800';
    return 'bg-gray-100 dark:bg-gray-700 opacity-70';
  };

  if (quizState === 'idle') {
    return (
      <Card className="text-center">
        <p className="mb-4 text-on-surface-light dark:text-on-surface-dark">
          Test your understanding of the key terms from the workshop.
        </p>
        <Button onClick={startQuiz}>Start Knowledge Check</Button>
      </Card>
    );
  }

  if (quizState === 'finished') {
    const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    return (
      <Card className="text-center">
        <h3 className="text-xl font-semibold mb-2">Quiz Complete!</h3>
        <p className="text-3xl font-bold mb-1">
          Your Score: {score} / {questions.length}
        </p>
        <p className="mb-4 text-secondary dark:text-gray-400">{percentage}%</p>
        <Button onClick={startQuiz}>Play Again</Button>
      </Card>
    );
  }

  // The glossary is too small to build a quiz, or generation produced nothing.
  if (!currentQuestion) {
    return (
      <Card className="text-center">
        <p className="mb-4 text-on-surface-light dark:text-on-surface-dark">
          There are not enough glossary terms to build a knowledge check yet.
        </p>
        <Button onClick={() => setQuizState('idle')}>Back</Button>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm text-secondary dark:text-gray-400 mb-2">
        Question {currentIndex + 1} of {questions.length}
      </p>
      <p className="font-semibold mb-4">
        Which term matches this definition? &ldquo;{currentQuestion.question}&rdquo;
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Answer options">
        {currentQuestion.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleAnswerSelect(option)}
            disabled={showResult}
            aria-pressed={selectedAnswer === option}
            className={`p-3 rounded-md text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${getOptionClassName(option)}`}
          >
            {option}
          </button>
        ))}
      </div>

      {showResult && (
        <div className="mt-6 text-center" aria-live="polite">
          <p className="mb-3 font-medium">
            {selectedAnswer === currentQuestion.correctAnswer
              ? 'Correct.'
              : `Not quite — the answer is “${currentQuestion.correctAnswer}”.`}
          </p>
          <Button onClick={handleNextQuestion}>
            {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default KnowledgeCheck;
