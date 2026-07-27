import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LabAuthGuard } from './components/LabAuthGuard';
import ErrorBoundary from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/registerServiceWorker';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find #root element to mount to');
}

/**
 * Catches rejections that never reach a React error boundary — async handlers,
 * failed dynamic imports — so they are visible instead of vanishing silently.
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ai-6g] Unhandled promise rejection:', event.reason);
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Outermost boundary: a crash inside the auth gate should still render a
        recovery screen rather than a blank page. */}
    <ErrorBoundary>
      <LabAuthGuard>
        <App />
      </LabAuthGuard>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Registered after mount, and only in production builds.
registerServiceWorker();
