
import React, { Component, ErrorInfo, ReactNode } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-4">
            <Card className="max-w-lg w-full text-center">
                <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong.</h1>
                <p className="text-on-surface-light dark:text-on-surface-dark mb-6">
                    We're sorry, but the application encountered an unexpected error. Please try refreshing the page.
                </p>
                <Button onClick={() => window.location.reload()}>
                    Refresh Page
                </Button>
            </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
