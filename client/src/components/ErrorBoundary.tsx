import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });

    // Best-effort: report the crash to the server so we can debug what's
    // actually failing on user devices (mobile users can't easily share
    // console output). Fire-and-forget; never throw or block the fallback UI.
    try {
      const payload = {
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        message: `${error.name}: ${error.message}`,
        stack: error.stack ?? "",
        componentStack: errorInfo.componentStack ?? "",
        timestamp: new Date().toISOString(),
      };
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        keepalive: true,
      }).catch(() => {
        // Swallow — we already logged to console; don't risk re-triggering.
      });
    } catch {
      // Ignore reporting failures.
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "24px",
            backgroundColor: "#0a0a0a",
            color: "#f5f5f5",
            fontFamily: "system-ui, -apple-system, sans-serif",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
          }}
          data-testid="error-boundary"
        >
          <div style={{ maxWidth: "720px", width: "100%", marginTop: "48px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "12px" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "14px", color: "#a1a1a1", marginBottom: "24px" }}>
              The page hit an unexpected error and couldn't render. You can try reloading the
              page, or head back to the home screen.
            </p>
            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #404040",
                  background: "#1f1f1f",
                  color: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
                data-testid="button-reload"
              >
                Reload page
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #404040",
                  background: "transparent",
                  color: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
                data-testid="button-go-home"
              >
                Go to home
              </button>
            </div>
            {error && (
              <details
                style={{
                  background: "#171717",
                  border: "1px solid #2a2a2a",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  fontSize: "12px",
                  color: "#d4d4d4",
                }}
                data-testid="error-details"
              >
                <summary style={{ cursor: "pointer", userSelect: "none" }}>
                  Technical details (share this with support)
                </summary>
                <div style={{ marginTop: "12px" }}>
                  <strong>Error:</strong>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "4px" }}>
                    {error.name}: {error.message}
                  </pre>
                  {error.stack && (
                    <>
                      <strong style={{ display: "block", marginTop: "12px" }}>Stack:</strong>
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "4px", fontSize: "11px" }}>
                        {error.stack}
                      </pre>
                    </>
                  )}
                  {errorInfo?.componentStack && (
                    <>
                      <strong style={{ display: "block", marginTop: "12px" }}>Component stack:</strong>
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "4px", fontSize: "11px" }}>
                        {errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
