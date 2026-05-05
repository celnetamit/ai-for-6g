
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProgressProvider } from './context/ProgressContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import About from './pages/About';
import Lessons from './pages/Lessons';
import LessonDetail from './pages/LessonDetail';
import KnowledgeBank from './pages/KnowledgeBank';
import Tools from './pages/Tools';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import Assessment from './pages/Assessment';
import CapstoneProject from './pages/CapstoneProject';
import ErrorBoundary from './components/ErrorBoundary';

const AppRoutes: React.FC = () => {
    const { isAuthenticated } = useAuth();

    return (
        <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
            
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
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

const App: React.FC = () => {
  return (
    <ThemeProvider>
        <AuthProvider>
            <ProgressProvider>
                <HashRouter>
                    <ErrorBoundary>
                        <AppRoutes />
                    </ErrorBoundary>
                </HashRouter>
            </ProgressProvider>
        </AuthProvider>
    </ThemeProvider>
  );
};

export default App;