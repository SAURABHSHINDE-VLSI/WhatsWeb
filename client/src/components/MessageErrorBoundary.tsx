import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  messageId?: string;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class MessageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Render failure',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(`[MessageErrorBoundary] Message ${this.props.messageId || 'unknown'} render error:`, error.message, {
      componentStack: errorInfo.componentStack?.slice(0, 150),
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl text-xs bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 my-1 max-w-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">Couldn't display this message</span>
          <button
            type="button"
            onClick={this.handleRetry}
            title="Retry displaying message"
            className="p-1 hover:bg-rose-500/20 rounded transition-colors focus-visible:ring-1 focus-visible:ring-rose-500"
            aria-label="Retry displaying message"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
