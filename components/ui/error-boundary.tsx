"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Label shown above the error — defaults to "Something went wrong" */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, pipe to Sentry here:
    // Sentry.captureException(error, { extra: info });
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {this.props.label ?? "Something went wrong"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {this.state.message}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-accent"
          >
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Lightweight functional wrapper for one-liner use */
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  label?: string,
) {
  return function BoundedComponent(props: T) {
    return (
      <ErrorBoundary label={label}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
