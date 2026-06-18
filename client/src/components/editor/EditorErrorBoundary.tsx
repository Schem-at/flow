/**
 * EditorErrorBoundary — top-level recovery boundary around the editor tree.
 *
 * The per-node boundaries (see NodeErrorBoundary) isolate node render crashes,
 * but a non-node crash (a bad store selector, a panel, a layout call, etc.) can
 * still unwind the whole React tree and leave a white page. This boundary
 * catches that class and renders a recoverable error screen with a reload
 * button instead of a blank screen.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[EditorErrorBoundary] The editor crashed:', error, info?.componentStack);
  }

  private handleReload = () => {
    // Full reload is the safest recovery — the store/React tree is in an
    // unknown state once an uncaught render error has propagated this far.
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-8 text-center text-neutral-200">
          <div className="text-4xl" aria-hidden>
            ⚠
          </div>
          <h1 className="text-lg font-semibold">The editor hit an unexpected error</h1>
          <p className="max-w-md text-sm text-neutral-400">
            Something went wrong while rendering the flow editor. Your last saved flow is
            unaffected — reloading should recover the editor.
          </p>
          <pre className="max-h-40 max-w-lg overflow-auto rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-left text-[11px] font-mono text-red-300">
            {error?.message || String(error)}
          </pre>
          <button
            onClick={this.handleReload}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Reload editor
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
