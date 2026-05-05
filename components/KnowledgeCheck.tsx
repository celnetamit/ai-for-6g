
import React, { useState, useMemo, useCallback } from 'react';
import { content } from '../data/content';
import Card from './ui/Card';
import Button from './ui/Button';

const NUM_QUESTIONS = 5;

const KnowledgeCheck: React.FC = () => {
    const { glossary } = content.knowledgeBank;
    const [questions, setQuestions] = useState<any[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(0);
    const [quizState, setQuizState] = useState<'idle' | 'active' | 'finished'>('idle');

    const generateQuestions = useCallback(() => {
        const shuffledGlossary = [...glossary].sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffledGlossary.slice(0, NUM_QUESTIONS);

        const formattedQuestions = selectedQuestions.map(correctItem => {
            const incorrectOptions = shuffledGlossary
                .filter(item => item.term !== correctItem.term)
                .slice(0, 3)
                .map(item => item.term);
            
            const options = [...incorrectOptions, correctItem.term].sort(() => 0.5 - Math.random());
            
            return {
                question: correctItem.definition,
                options,
                correctAnswer: correctItem.term,
            };
        });

        setQuestions(formattedQuestions);
    }, [glossary]);

    const startQuiz = () => {
        generateQuestions();
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setScore(0);
        setQuizState('active');
    };
    
    const handleAnswerSelect = (answer: string) => {
        if(showResult) return;
        setSelectedAnswer(answer);
        setShowResult(true);
        if(answer === questions[currentQuestionIndex].correctAnswer){
            setScore(prev => prev + 1);
        }
    };

    const handleNextQuestion = () => {
        setShowResult(false);
        setSelectedAnswer(null);
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            setQuizState('finished');
        }
    };

    const getOptionClassName = (option: string) => {
        if (!showResult) return 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600';
        
        const currentQuestion = questions[currentQuestionIndex];
        if (option === currentQuestion.correctAnswer) {
            return 'bg-green-200 dark:bg-green-800';
        }
        if (option === selectedAnswer) {
            return 'bg-red-200 dark:bg-red-800';
        }
        return 'bg-gray-100 dark:bg-gray-700 opacity-70';
    };


    if (quizState === 'idle') {
        return (
            <Card className="text-center">
                <p className="mb-4 text-on-surface-light dark:text-on-surface-dark">Test your understanding of the key terms from the workshop.</p>
                <Button onClick={startQuiz}>Start Knowledge Check</Button>
            </Card>
        );
    }

    if (quizState === 'finished') {
        return (
             <Card className="text-center">
                <h3 className="text-xl font-semibold mb-2">Quiz Complete!</h3>
                <p className="text-3xl font-bold mb-4">Your Score: {score} / {questions.length}</p>
                <Button onClick={startQuiz}>Play Again</Button>
            </Card>
        );
    }

    const currentQuestion = questions[currentQuestionIndex];

    return (
        <Card>
            <p className="text-sm text-secondary dark:text-gray-400 mb-2">Question {currentQuestionIndex + 1} of {questions.length}</p>
            <p className="font-semibold mb-4">Which term matches this definition? "{currentQuestion.question}"</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((option: string) => (
                    <button
                        key={option}
                        onClick={() => handleAnswerSelect(option)}
                        disabled={showResult}
                        className={`p-3 rounded-md text-left transition-colors duration-200 ${getOptionClassName(option)}`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            {showResult && (
                <div className="mt-6 text-center">
                     <Button onClick={handleNextQuestion}>
                        {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
                    </Button>
                </div>
            )}
        </Card>
    );
};

export default KnowledgeCheck;
