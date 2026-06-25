import type { PropsWithChildren } from 'react';
import { Component } from 'react';

type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: React.ReactNode;
}>;

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen app-shell-bg text-white flex items-center justify-center px-6">
            <div className="tos-card max-w-lg w-full p-6">
              <div className="text-sm font-semibold text-white/80">Something went wrong</div>
              <div className="mt-2 text-xs text-white/45">Refresh the page. If this persists, we’ll inspect the console and stack trace.</div>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

