import React from "react";

/**
 * The app-root error boundary: a thrown render used to paint the whole window
 * BLACK (reported live from a notebook cell drag) — nothing to act on, nothing
 * to report. Now the error renders as a readable screen with the stack, a
 * copy button, and recovery actions, while the app underneath stays debuggable.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[studio] render crashed", error, info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    const detail = `${error.stack ?? error.message}\n\nComponent stack:${info}`;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-8 text-foreground">
        <p className="text-[15px] font-semibold">Something crashed while rendering</p>
        <p className="max-w-lg text-center text-[12px] leading-relaxed text-muted-foreground">
          The app caught it instead of going dark. Copy the details below when reporting; “Try to continue” re-renders
          in place, “Reload” restarts the window.
        </p>
        <pre className="max-h-64 w-full max-w-2xl overflow-auto rounded-lg border border-border bg-panel/60 p-3 text-[10.5px] leading-relaxed text-destructive [scrollbar-width:thin]">
          {detail}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={() => void navigator.clipboard?.writeText(detail)}
            className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Copy details
          </button>
          <button
            onClick={() => this.setState({ error: null, info: "" })}
            className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Try to continue
          </button>
          <button
            onClick={() => window.location.reload()}
            className="h-8 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
