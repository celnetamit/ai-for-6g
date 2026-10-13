import React, { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ProgressProvider } from './context/ProgressContext';
import { LabProvider } from './context/LabContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import RouteFallback from './components/RouteFallback';
import ReviewerGate from './components/review/ReviewerGate';

/**
 * Every page is code-split.
 *
 * These routes pull in the heavy visualisation stack — three.js plus
 * @react-three/fiber and drei is ~1.2 MB, recharts another ~360 KB,
 * react-markdown more still. Imported statically they all landed in the initial
 * download, so a visitor paid for the entire 3D engine before the dashboard
 * could paint. Splitting per route means each visitor downloads only what they
 * open.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const Lessons = lazy(() => import('./pages/Lessons'));
const LessonDetail = lazy(() => import('./pages/LessonDetail'));
const KnowledgeBank = lazy(() => import('./pages/KnowledgeBank'));
const Levels = lazy(() => import('./pages/Levels'));
const Experiments = lazy(() => import('./pages/Experiments'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Datasets = lazy(() => import('./pages/Datasets'));
const ModelEngine = lazy(() => import('./pages/ModelEngine'));
const History = lazy(() => import('./pages/History'));
const Tools = lazy(() => import('./pages/Tools'));
const Assessment = lazy(() => import('./pages/Assessment'));
const CapstoneProject = lazy(() => import('./pages/CapstoneProject'));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

/**
 * There is no second login here.
 *
 * The lab used to carry its own `demo_user` / `demo123` gate, which printed
 * those credentials on the screen that asked for them. It protected nothing —
 * anybody who could read the form could read the password — and it sat in front
 * of a lab the hub has *already* authorised, so a learner arriving from their
 * dashboard was asked to sign in a second time to a box that told them what to
 * type. `LabAuthGuard` does the real check against live-labs.org.
 *
 * `/login` still resolves, redirecting to the dashboard, so an old bookmark or
 * a link someone pasted into a worksheet lands somewhere sensible rather than
 * on the 404 page.
 */
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="about" element={<About />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="lessons/:moduleId/:lessonId" element={<LessonDetail />} />
        <Route path="assessment/:moduleId" element={<Assessment />} />
        <Route path="knowledge-bank" element={<KnowledgeBank />} />
        <Route path="levels" element={<Levels />} />
        <Route path="experiments" element={<Experiments />} />
        <Route path="experiments/:experimentId" element={<Workspace />} />
        <Route path="datasets" element={<Datasets />} />
        <Route path="models" element={<ModelEngine />} />
        <Route path="history" element={<History />} />
        <Route path="tools" element={<Tools />} />
        <Route path="capstone" element={<CapstoneProject />} />
        <Route path="legal/privacy" element={<PrivacyPolicy />} />
        <Route path="legal/terms" element={<TermsOfService />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <ProgressProvider>
      <LabProvider>
        <HashRouter>
          {/*
            ErrorBoundary wraps Suspense so that a chunk which fails to load —
            stale cache after a deploy, flaky network — renders a recovery
            screen rather than an indefinitely blank page.
          */}
          <ErrorBoundary>
            {/*
              The reviewer gate sits outside the router on purpose: an account
              the hub marks as a reviewer gives the confidentiality undertaking
              before any route renders. Every other account — every learner,
              every admin without the flag — passes straight through it.
            */}
            <ReviewerGate>
              <Suspense fallback={<RouteFallback />}>
                <AppRoutes />
              </Suspense>
            </ReviewerGate>
          </ErrorBoundary>
        </HashRouter>
      </LabProvider>
    </ProgressProvider>
  </ThemeProvider>
);

export default App;
