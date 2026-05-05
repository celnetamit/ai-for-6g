
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { content } from '../data/content';
import { useProgress } from '../context/ProgressContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import NotFound from './NotFound';
import { AssessmentQuestion } from '../types';

const Assessment: React.FC = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { progress, saveAssessmentScore } = useProgress();

  const questions: AssessmentQuestion[] = moduleId ? content.assessments[moduleId] || [] : [];
  const moduleTitle = content.learningMaterials.find(m => m.id === moduleId)?.title;
  const previousScore = moduleId ? progress.assessmentScores[moduleId] : undefined;

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentScore, setCurrentScore] = useState<number | null>(null);

  useEffect(() => {
      if (previousScore !== undefined) {
          setIsSubmitted(true);
          setCurrentScore(previousScore);
      }
  }, [previousScore]);

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(answers).length !== questions.length) {
      alert("Please answer all questions before submitting.");
      return;
    }

    let correctCount = 0;
    questions.forEach((q, index) => {
      if (answers[index] === q.correctAnswer) {
        correctCount++;
      }
    });
    
    const finalScore = (correctCount / questions.length) * 100;
    setCurrentScore(finalScore);
    if (moduleId) {
      saveAssessmentScore(moduleId, finalScore);
    }
    setIsSubmitted(true);
  };
  
  const handleRetake = () => {
      setAnswers({});
      setCurrentScore(null);
      setIsSubmitted(false);
  };

  const getOptionClassName = (q: AssessmentQuestion, option: string, index: number) => {
      if (!isSubmitted) return 'border-transparent';
      if (option === q.correctAnswer) return 'bg-green-100 dark:bg-green-900 border-green-500';
      if (option === answers[index] && option !== q.correctAnswer) return 'bg-red-100 dark:bg-red-900 border-red-500';
      return 'border-transparent';
  };

  if (!moduleTitle || questions.length === 0) {
    return <NotFound />;
  }

  const allQuestionsAnswered = Object.keys(answers).length === questions.length;

  return (
    <div className="space-y-6">
      <Link to="/lessons" className="text-primary hover:underline mb-4 inline-block">&larr; Back to Lessons</Link>
      <h1 className="text-3xl font-bold">Assessment: {moduleTitle}</h1>
      
      <Card>
          {isSubmitted && currentScore !== null && (
              <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold mb-2">Your Score</h2>
                  <p className="text-5xl font-bold text-primary">{currentScore.toFixed(0)}%</p>
              </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="space-y-8">
              {questions.map((q, index) => (
                <fieldset key={index} disabled={isSubmitted}>
                  <legend className="font-semibold mb-2 text-lg">{index + 1}. {q.question}</legend>
                  <div className="space-y-2">
                    {q.options.map(option => (
                      <div key={option} className={`border-2 p-3 rounded-md transition-colors ${getOptionClassName(q, option, index)}`}>
                          <label className={`flex items-center ${isSubmitted ? 'cursor-default' : 'cursor-pointer'}`}>
                              <input
                                  type="radio"
                                  name={`question-${index}`}
                                  value={option}
                                  onChange={() => handleAnswerChange(index, option)}
                                  checked={answers[index] === option}
                                  className="mr-3 h-4 w-4 text-primary focus:ring-primary border-gray-300"
                                  disabled={isSubmitted}
                              />
                              <span>{option}</span>
                          </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-8 text-center space-x-4">
              {isSubmitted ? (
                 <Button type="button" onClick={handleRetake}>Retake Assessment</Button>
              ) : (
                 <Button type="submit" disabled={!allQuestionsAnswered}>Submit Answers</Button>
              )}
            </div>
          </form>
      </Card>
    </div>
  );
};

export default Assessment;
