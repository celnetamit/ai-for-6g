import React, { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProgressProvider } from './context/ProgressContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';

/**
 * Every page is code-split.
 *
 * These routes pull in the heavy visualisation stack — three.js plus
 * @react-three/fiber and drei is ~1.2 MB, recharts another ~360 KB,
 * react-markdown more still. Imported statically they all landed in the initial
 * download, so a visitor paid for the entire 3D engine before they could type a
 * password. Splitting per route means each visitor downloads only what they open.
 */
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const Lessons = lazy(() => import('./pages/Lessons'));
const LessonDetail = lazy(() => import('./pages/LessonDetail'));
const KnowledgeBank = lazy(() => import('./pages/KnowledgeBank'));
const Tools = lazy(() => import('./pages/Tools'));
const Assessment = lazy(() => import('./pages/Assessment'));
const CapstoneProject = lazy(() => import('./pages/CapstoneProject'));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="about" element={<About />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="lessons/:moduleId/:lessonId" element={<LessonDetail />} />
        <Route path="assessment/:moduleId" element={<Assessment />} />
        <Route path="knowledge-bank" element={<KnowledgeBank />} />
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
    <AuthProvider>
      <ProgressProvider>
        <HashRouter>
          {/*
            ErrorBoundary wraps Suspense so that a chunk which fails to load —
            stale cache after a deploy, flaky network — renders a recovery screen
            rather than an indefinitely blank page.
          */}
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
        </HashRouter>
      </ProgressProvider>
    </AuthProvider>
  </ThemeProvider>
);

export default App;
