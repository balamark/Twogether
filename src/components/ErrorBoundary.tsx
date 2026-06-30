import React from 'react';
import { clientLog, getLastRequestId } from '../utils/telemetry';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // Optional label so logs/telemetry can tell which boundary tripped
  // (e.g. the whole app vs. just a modal).
  context?: string;
  // When provided, renders inline instead of the full-screen fallback — used
  // to wrap a single panel (e.g. a modal) so a crash there doesn't blank the
  // entire app. `onReset` lets the parent close/reset the wrapped UI.
  inline?: boolean;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// App-wide safety net. Before this existed, any uncaught error during render
// unmounted the whole React tree and left a blank white page with no message —
// which is exactly what made script upload look like it "silently died" (see
// the script-upload-blank-screen investigation). Catching here turns that into
// a recoverable, visible error and surfaces the real exception in the console.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the real stack visible for debugging — this is the only place the
    // underlying exception shows up once the tree has crashed.
    console.error(
      `[ErrorBoundary${this.props.context ? `:${this.props.context}` : ''}] render crashed:`,
      error,
      info.componentStack,
    );
    // Ship the crash to Cloud Logging with the last backend request id, so a
    // blank-screen report links to the exact backend trace that served it.
    clientLog(
      'render_crash',
      {
        context: this.props.context,
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        requestId: getLastRequestId(),
      },
      'error',
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || '發生未知錯誤';

    if (this.props.inline) {
      return (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-5 text-center"
          data-testid="error-boundary-inline"
        >
          <h4 className="font-body text-sm font-medium text-red-800 mb-1">這個區塊發生錯誤</h4>
          <p className="font-body text-xs text-red-700/90 mb-4 break-words">{message}</p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-display italic text-sm"
          >
            關閉並重試
          </button>
        </div>
      );
    }

    return (
      <div
        className="min-h-screen bg-petal-cream flex items-center justify-center p-4"
        data-testid="error-boundary-fallback"
      >
        <div className="max-w-md w-full text-center bg-petal-cream rounded-md border border-petal-rule shadow-petal p-8">
          <h2 className="font-display text-2xl font-light text-petal-ink mb-2">頁面發生錯誤</h2>
          <p className="font-body text-sm text-petal-ink-soft mb-1">
            畫面遇到了一個問題，你的資料並未遺失。請重新整理頁面再試一次。
          </p>
          <p className="font-body text-xs text-petal-muted mb-6 break-words">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-display italic text-base"
          >
            重新整理頁面 →
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
