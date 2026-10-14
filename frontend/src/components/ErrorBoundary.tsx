import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Changing this value (for example the active tab) clears a previous error. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
}

/** Catches render errors so one broken page does not blank the whole app (FE-01). */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="max-w-lg mx-auto mt-16 p-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-100">
        <h2 className="text-lg font-bold">Something went wrong on this page</h2>
        <p className="mt-2 text-sm">Your data is safe. Try again, or open another page from the menu.</p>
        <button
          type="button"
          onClick={() => this.setState({ hasError: false })}
          className="mt-4 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
