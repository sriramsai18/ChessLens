import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Analyzer } from "@/components/chess/Analyzer";
import { SplashScreen } from "@/components/chess/SplashScreen";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChessLens" },
      {
        name: "description",
        content:
          "Analyze positions and full games with Stockfish 18: multi-line evaluation, opening book, blunder detection, accuracy scores, PGN/FEN import & export.",
      },
      { property: "og:title", content: "ChessLens — Real-time Chess Analyzer" },
      {
        property: "og:description",
        content:
          "Stockfish-powered chess analysis with multi-PV lines, opening detection, full-game review and blunder classification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const mounted = useMounted();
  const [splashDone, setSplashDone] = useState(false);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mono text-sm text-muted-foreground">Loading ChessLens…</div>
      </div>
    );
  }
  return (
    <>
      <h1 className="sr-only">ChessLens — Real-time Chess Analyzer with Stockfish</h1>
      <Analyzer />
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
    </>
  );

}
