import { useEffect, useState } from "react";
import { ChessLensWordmark } from "./Logo";

/**
 * 5-second splash: the ChessLens logo + wordmark fade in, hold, then fade out.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("out"), 4500);
    const t2 = window.setTimeout(onDone, 5000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-label="ChessLens loading"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
      style={{
        transition: "opacity 480ms ease",
        opacity: phase === "out" ? 0 : 1,
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
    >
      {/* Subtle chess-grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      {/* Radial glow */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--color-primary) 18%, transparent), transparent 60%)",
        }}
      />

      <div
        className="flex flex-col items-center gap-5"
        style={{
          animation: "cl-logo-in 800ms cubic-bezier(.2,.7,.2,1) both",
        }}
      >
        <ChessLensWordmark size={84} animateMonocle />
        <p className="mono text-[11px] uppercase tracking-[0.35em] text-primary/80">
          Initializing engine
        </p>
      </div>
    </div>
  );
}
