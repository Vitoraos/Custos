import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";

type BoundaryState = { error: Error | null };

class RenderErrorBoundary extends React.Component<
  React.PropsWithChildren,
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Custos showcase render failure]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            maxWidth: 760,
            margin: "64px auto",
            padding: 24,
            color: "#111827",
            background: "#ffffff",
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1.5,
          }}
          role="alert"
        >
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>
            CUSTOS · RENDER ERROR
          </p>
          <h1 style={{ fontSize: 28 }}>The comparison could not be displayed.</h1>
          <p>The run may have completed, but the interface crashed while rendering its result.</p>
          <pre
            style={{
              padding: 16,
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: 8,
            }}
          >
            {this.state.error.message}
          </pre>
          <p>Open the browser console for the component stack. This error is shown instead of a blank page.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reset showcase
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RenderErrorBoundary>
      <App />
    </RenderErrorBoundary>
  </React.StrictMode>,
);
