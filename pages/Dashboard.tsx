
import React from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../context/ProgressContext';
import { content } from '../data/content';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const Dashboard: React.FC = () => {
  const { progress } = useProgress();

  const totalLessons = content.learningMaterials.reduce((acc, module) => acc + module.lessons.length, 0);
  const completedLessonsCount = progress.completedLessons.length;
  const progressPercentage = totalLessons > 0 ? Math.round((completedLessonsCount / totalLessons) * 100) : 0;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold mb-2">Welcome to the {content.workshopTitle}</h1>
        <p className="text-lg text-secondary dark:text-gray-400">Your journey into the future of wireless communication starts here. Let's get started!</p>
      </section>

      <Card>
        <h2 className="text-xl font-semibold mb-4">Your Progress</h2>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
          <div
            className="bg-primary h-4 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <p className="text-right font-semibold">{progressPercentage}% Complete ({completedLessonsCount} / {totalLessons} lessons)</p>
      </Card>
      
      <section>
        <h2 className="text-2xl font-bold mb-4">Capstone Project</h2>
        <Card>
          {progress.capstoneResult ? (
            <div>
                <h3 className="text-xl font-semibold text-green-500 mb-2">Project Completed!</h3>
                <p className="mb-4 text-secondary dark:text-gray-400">
                    Congratulations on completing the capstone project. Here are your results from{' '}
                    {new Date(progress.capstoneResult.completedOn).toLocaleDateString()}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-sm font-semibold">Noise Level</p>
                        <p className="text-2xl font-bold">{progress.capstoneResult.noiseLevel}%</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Traditional Accuracy</p>
                        <p className="text-2xl font-bold text-red-500">{progress.capstoneResult.traditionalAccuracy.toFixed(1)}%</p>
                    </div>
                     <div>
                        <p className="text-sm font-semibold">Semantic Accuracy</p>
                        <p className="text-2xl font-bold text-green-500">{progress.capstoneResult.semanticAccuracy.toFixed(1)}%</p>
                    </div>
                </div>
                 <Link to="/capstone" className="mt-6 block">
                    <Button variant="secondary" className="w-full">Review or Rerun Project</Button>
                </Link>
            </div>
          ) : (
             <div>
                <h3 className="text-xl font-semibold mb-2">Apply Your Knowledge</h3>
                <p className="mb-4 text-secondary dark:text-gray-400">
                    Ready to put it all together? The capstone project challenges you to implement and evaluate a semantic communication system.
                </p>
                <Link to="/capstone">
                    <Button className="w-full">Start Capstone Project</Button>
                </Link>
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Workshop Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {content.learningMaterials.map((module) => (
            <Card key={module.id} className="flex flex-col">
              <h3 className="text-xl font-semibold text-primary mb-2">{module.title}</h3>
              <p className="text-secondary dark:text-gray-400 mb-4 flex-grow">{module.description}</p>
              <Link to={`/lessons#${module.id}`}>
                <Button className="w-full">Go to Module</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Assessment Results</h2>
        {Object.keys(progress.assessmentScores).length > 0 ? (
          <Card>
            <ul className="space-y-3">
              {Object.entries(progress.assessmentScores).map(([moduleId, score]) => {
                const module = content.learningMaterials.find(m => m.id === moduleId);
                return (
                  <li key={moduleId} className="flex justify-between items-center p-2 rounded bg-background-light dark:bg-background-dark">
                    <span>{module?.title || 'Unknown Module'}</span>
                    <span className={`font-bold ${score >= 80 ? 'text-green-500' : 'text-yellow-500'}`}>{score.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card>
            <p className="text-secondary dark:text-gray-400">You haven't completed any assessments yet. Go to the <Link to="/lessons" className="text-primary hover:underline">Lessons</Link> page to get started.</p>
          </Card>
        )}
      </section>
      
      <section>
        <h2 className="text-2xl font-bold mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/tools">
                <Card className="text-center hover:shadow-lg transition-shadow">
                    <h3 className="text-lg font-semibold">Interactive Tools</h3>
                </Card>
            </Link>
            <Link to="/knowledge-bank">
                <Card className="text-center hover:shadow-lg transition-shadow">
                    <h3 className="text-lg font-semibold">Knowledge Bank</h3>
                </Card>
            </Link>
             <Link to="/about">
                <Card className="text-center hover:shadow-lg transition-shadow">
                    <h3 className="text-lg font-semibold">About this App</h3>
                </Card>
            </Link>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;