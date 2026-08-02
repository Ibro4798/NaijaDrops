"use client";

import { useEffect } from "react";

// error.jsx only catches errors inside the normal page tree - if the ROOT
// layout itself throws (rare, but possible: a bad env var, a provider
// crashing on mount), Next.js falls back to its own default error page
// unless a global-error.jsx exists. This has to render its own <html>/<body>
// since it replaces the root layout entirely when it triggers.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[APP_GLOBAL_ERROR]", error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, background: "#0a0a0b", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <p style={{ fontWeight: 900, fontSize: "20px", marginBottom: "8px" }}>Something went wrong</p>
          <p style={{ color: "#9ca3af", fontSize: "14px", maxWidth: "320px", marginBottom: "32px", lineHeight: 1.5 }}>
            That's on us, not you. Try again, or head back home.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => reset()}
              style={{ padding: "14px 24px", background: "#10b981", color: "#0a0a0b", border: "none", borderRadius: "16px", fontWeight: 900, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer" }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{ padding: "14px 24px", background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", fontWeight: 900, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", textDecoration: "none" }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
