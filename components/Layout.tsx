import React, { Suspense, lazy, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

/**
 * The feedback dialog is loaded on demand.
 *
 * It pulls in the hub client and the whole form, and most visits never open it,
 * so it has no business in the chunk every page already pays for.
 */
const FeedbackDialog = lazy(() => import('./ui/FeedbackDialog'));

/**
 * Human-readable names for the screen a report was sent from.
 *
 * The raw path would do, but "/experiments/ai-phase-optimisation" in an admin's
 * inbox is a worse starting point than the title the sender was looking at.
 */
const SCREEN_NAMES: { prefix: string; name: string }[] = [
  { prefix: '/experiments/', name: 'Experiment workspace' },
  { prefix: '/experiments', name: 'Experiment catalogue' },
  { prefix: '/knowledge-bank', name: 'Knowledge Bank' },
  { prefix: '/levels', name: 'Learning level' },
  { prefix: '/models', name: 'AI model engine' },
  { prefix: '/datasets', name: 'Dataset manager' },
  { prefix: '/history', name: 'Experiment history' },
  { prefix: '/lessons/', name: 'Lesson' },
  { prefix: '/lessons', name: 'Lessons' },
  { prefix: '/assessment/', name: 'Assessment' },
  { prefix: '/tools', name: 'Interactive tools' },
  { prefix: '/capstone', name: 'Capstone project' },
  { prefix: '/about', name: 'About' },
  { prefix: '/legal/', name: 'Legal' },
];

const screenName = (pathname: string): string => {
  const match = SCREEN_NAMES.find((entry) => pathname.startsWith(entry.prefix));
  if (match) return `${match.name} (${pathname})`;
  return pathname === '/' ? 'Dashboard' : pathname;
};

const Layout: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background-light dark:bg-background-dark text-on-surface-light dark:text-on-surface-dark">
      <Header onSendFeedback={() => setFeedbackOpen(true)} />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <Footer onSendFeedback={() => setFeedbackOpen(true)} />

      {feedbackOpen && (
        <Suspense fallback={null}>
          <FeedbackDialog
            screen={screenName(location.pathname)}
            onClose={() => setFeedbackOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Layout;
