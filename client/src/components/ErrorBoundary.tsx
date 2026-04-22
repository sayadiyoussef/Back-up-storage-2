// client/src/components/ErrorBoundary.tsx
import React from "react";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };

type State = { hasError: boolean; error?: any };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
            <div className="max-w-lg text-center">
              <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
              <p className="text-gray-300 mb-4">The UI crashed. Check the console for details.</p>
              <button
                className="px-4 py-2 rounded bg-blue-600"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
