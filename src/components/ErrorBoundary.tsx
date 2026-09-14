"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="rounded-[var(--radius-card)] border border-red-500/20 bg-red-500/5 p-6 text-center">
          <div className="w-10 h-10 rounded-[11px] bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-display font-semibold text-ink mb-1">Something went wrong</h3>
          <p className="text-[13px] text-ink-faint mb-4 max-w-sm mx-auto">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={this.reset}
            className="inline-flex h-9 items-center gap-1.5 px-4 text-[13px] font-semibold bg-brand hover:bg-brand-strong text-brand-ink rounded-[10px] shadow-[var(--shadow-sm)] transition-all active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
