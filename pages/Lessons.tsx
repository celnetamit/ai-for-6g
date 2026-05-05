
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { content } from '../data/content';
import { useProgress } from '../context/ProgressContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);


const Lessons: React.FC = () => {
    const { getLessonCompleted } = useProgress();
    const location = useLocation();

    React.useEffect(() => {
        if (location.hash) {
            const id = location.hash.replace('#', '');
            const element = document.getElementById(id);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [location]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Learning Modules</h1>
      {content.learningMaterials.map((module) => (
        <Card key={module.id} id={module.id}>
          <h2 className="text-2xl font-semibold text-primary mb-2">{module.title}</h2>
          <p className="text-secondary dark:text-gray-400 mb-6">{module.description}</p>
          <ul className="space-y-4">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  to={`/lessons/${module.id}/${lesson.id}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-background-light dark:bg-background-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="font-medium">{lesson.title}</span>
                  {getLessonCompleted(lesson.id) && <CheckIcon className="text-green-500" />}
                </Link>
              </li>
            ))}
          </ul>
           {content.assessments[module.id] && content.assessments[module.id].length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Link to={`/assessment/${module.id}`}>
                    <Button className="w-full">Take Assessment</Button>
                </Link>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default Lessons;