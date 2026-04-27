// Catches render errors anywhere in the tree so a single bad component
// (e.g. a malformed AI-generated CV snapshot) can't blank out the entire app.
import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in console so dev tools / log capture pick it up.
    console.error("[ErrorBoundary] render crash:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <h1 className="font-semibold">Noe gikk galt</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              En del av siden klarte ikke å vises. Prøv å laste på nytt — om det skjer igjen, gå
              tilbake og prøv en annen handling.
            </p>
            {this.state.error.message && (
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-32 text-muted-foreground">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> Last på nytt
              </Button>
              <Button size="sm" variant="outline" onClick={this.reset}>
                Prøv igjen
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
