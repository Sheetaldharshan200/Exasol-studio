import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleSlash2, Copy, X } from "lucide-react";

type Props = { tabId: string; title: string; onClose: () => void; children: ReactNode };
type State = { error: Error | null };

/**
 * One tab, one blast radius. A render error inside a tab used to unmount the
 * whole workbench (the only boundary was the app's); now the tab shows what
 * broke and offers to close itself while every other tab keeps working.
 */
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[tab ${this.props.tabId}] ${this.props.title}:`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // A different tab mounted under the same boundary: forget the old error.
    if (prev.tabId !== this.props.tabId && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${error.stack ?? ""}`;
    return (
      <div className="flex h-full items-center justify-center bg-editor p-8">
        <div className="w-full max-w-lg rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
            <CircleSlash2 className="h-4 w-4 text-destructive" /> This tab hit an error
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Only <span className="font-medium text-foreground">{this.props.title}</span> is affected — the rest of Studio keeps working. Closing the tab and opening it again usually clears it.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-editor p-2 font-mono text-[11px] whitespace-pre-wrap text-foreground/80">{error.message}</pre>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void navigator.clipboard?.writeText(details)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary"
            >
              <Copy className="h-3.5 w-3.5" /> Copy details
            </button>
            <button
              onClick={this.props.onClose}
              className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              <X className="h-3.5 w-3.5" /> Close tab
            </button>
            <button onClick={() => this.setState({ error: null })} className="ml-auto h-7 px-2 text-[12px] text-muted-foreground hover:text-foreground">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
