import { Component, type ErrorInfo, type ReactNode } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Recovery UI for render-time crashes.
 *
 * With routes now code-split, this also catches a failed dynamic import — the
 * case where a returning visitor holds a stale index.html referencing chunks
 * that a deploy removed. A plain reload fixes exactly that, so it is offered as
 * the primary action.
 */
class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ai-6g] Uncaught error:', error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    // A chunk-load failure is almost always a stale cache, not a code bug, so it
    // gets a plainer explanation than a generic crash.
    const isChunkError = /Loading chunk|dynamically imported module|Importing a module/i.test(
      this.state.error?.message ?? '',
    );

    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-4">
        <Card className="max-w-lg w-full text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">
            {isChunkError ? 'This page needs a refresh' : 'Something went wrong.'}
          </h1>
          <p className="text-on-surface-light dark:text-on-surface-dark mb-6">
            {isChunkError
              ? 'The application was updated while your tab was open. Reloading will pick up the new version.'
              : 'The application hit an unexpected error. Your saved progress is stored locally and has not been lost.'}
          </p>

          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs bg-gray-100 dark:bg-gray-900 rounded p-3 mb-6 overflow-auto max-h-40 text-red-600 dark:text-red-400">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={this.handleReload}>Reload page</Button>
            {!isChunkError && (
              <Button variant="secondary" onClick={this.handleReset}>
                Try again
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
