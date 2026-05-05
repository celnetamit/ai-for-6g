
import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { content } from '../data/content';
import { useProgress } from '../context/ProgressContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import NotFound from './NotFound';

const LessonDetail: React.FC = () => {
  const { moduleId, lessonId } = useParams<{ moduleId: string; lessonId: string }>();
  const { markLessonCompleted, getLessonCompleted } = useProgress();
  const navigate = useNavigate();

  const module = content.learningMaterials.find(m => m.id === moduleId);
  const lesson = module?.lessons.find(l => l.id === lessonId);

  if (!module || !lesson) {
    return <NotFound />;
  }

  const isCompleted = getLessonCompleted(lesson.id);

  const handleComplete = () => {
    markLessonCompleted(lesson.id);
    navigate('/lessons');
  };

  return (
    <div>
      <Link to="/lessons" className="text-primary hover:underline mb-4 inline-block">&larr; Back to Lessons</Link>
      <Card>
        <h1 className="text-3xl font-bold mb-4">{lesson.title}</h1>
        <div className="prose prose-lg dark:prose-invert max-w-none text-on-surface-light dark:text-on-surface-dark">
          <ReactMarkdown
            components={{
                h1: ({node, ...props}) => <h1 className="text-3xl font-bold my-4" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-2xl font-bold my-3" {...props} />,
                p: ({node, ...props}) => <p className="my-4 leading-relaxed" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside my-4" {...props} />,
                li: ({node, ...props}) => <li className="my-2" {...props} />,
                code: ({node, ...props}) => <code className="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 font-mono text-sm" {...props} />,
                img: ({node, ...props}) => <img className="max-w-full h-auto rounded-lg shadow-md my-4 mx-auto" {...props} />,
            }}
          >
            {lesson.content}
          </ReactMarkdown>
        </div>
      </Card>
      <div className="mt-6 text-center">
        <Button onClick={handleComplete} disabled={isCompleted}>
          {isCompleted ? '✓ Completed' : 'Mark as Complete'}
        </Button>
      </div>
    </div>
  );
};

export default LessonDetail;
