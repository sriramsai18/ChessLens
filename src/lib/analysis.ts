// Move classification and accuracy helpers.
// Uses a win-percentage model similar to Lichess/chess.com heuristics.

import type { EngineLine } from "./stockfish";

export type MoveClass =
  | "best"
  | "great"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface ClassifiedMove {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeCp: number;   // from mover's POV
  evalAfterCp: number;    // from mover's POV (after their move, so we flip)
  bestMoveUci: string | null;
  bestLine: string[];
  classification: MoveClass;
  winPctBefore: number;
  winPctAfter: number;
  accuracy: number;       // 0-100
  wasBook: boolean;
}

/** Convert eval (centipawns, side-to-move POV) to expected win percentage. */
export function cpToWinPct(cp: number): number {
  // Lichess win% model
  const MULT = -0.00368208;
  return 50 + 50 * (2 / (1 + Math.exp(MULT * cp)) - 1);
}

/** Score from side-to-move POV. Mate scores get clamped to ±10000cp. */
export function lineScoreCp(line: EngineLine | undefined): number {
  if (!line) return 0;
  if (line.scoreMate !== null) {
    return line.scoreMate > 0 ? 10000 - line.scoreMate : -10000 - line.scoreMate;
  }
  return line.scoreCp ?? 0;
}

/** Accuracy per Lichess formula: 103.1668 * exp(-0.04354 * winDiff) - 3.1669 */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  const diff = Math.max(0, winPctBefore - winPctAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Classify a move given eval before (mover POV) and eval after mover's move
 * (already flipped to mover POV). If the move matches the engine's best,
 * we auto-tag "best".
 */
export function classifyMove(params: {
  evalBeforeCp: number;
  evalAfterCp: number;
  playedUci: string;
  bestUci: string | null;
  wasBook: boolean;
}): MoveClass {
  if (params.wasBook) return "book";
  if (params.bestUci && params.playedUci === params.bestUci) return "best";

  const winBefore = cpToWinPct(params.evalBeforeCp);
  const winAfter = cpToWinPct(params.evalAfterCp);
  const drop = winBefore - winAfter;

  if (drop < 2) return "great";
  if (drop < 5) return "good";
  if (drop < 10) return "inaccuracy";
  if (drop < 20) return "mistake";
  return "blunder";
}

export const CLASS_META: Record<
  MoveClass,
  { label: string; symbol: string; colorVar: string; description: string }
> = {
  best:       { label: "Best",       symbol: "★",  colorVar: "var(--color-eval-best)",       description: "Top engine choice" },
  great:      { label: "Great",      symbol: "!",  colorVar: "var(--color-eval-good)",       description: "Strong move" },
  good:       { label: "Good",       symbol: "✓",  colorVar: "var(--color-eval-good)",       description: "Solid move" },
  book:       { label: "Book",       symbol: "📖", colorVar: "var(--color-eval-book)",       description: "Known opening theory" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", colorVar: "var(--color-eval-inaccuracy)", description: "Better options were available" },
  mistake:    { label: "Mistake",    symbol: "?",  colorVar: "var(--color-eval-mistake)",    description: "Sizable loss of advantage" },
  blunder:    { label: "Blunder",    symbol: "??", colorVar: "var(--color-eval-blunder)",    description: "Critical error" },
};

/** Format eval for display: "+1.24" or "M4" or "-M2". */
export function formatEval(line: EngineLine | undefined, whiteToMove: boolean): string {
  if (!line) return "0.00";
  if (line.scoreMate !== null) {
    const m = line.scoreMate;
    const signed = whiteToMove ? m : -m;
    return (signed >= 0 ? "M" : "-M") + Math.abs(signed);
  }
  const cp = line.scoreCp ?? 0;
  const whitePov = whiteToMove ? cp : -cp;
  const val = whitePov / 100;
  return (val >= 0 ? "+" : "") + val.toFixed(2);
}

/** Convert eval to bar percentage (0 = full black, 100 = full white). */
export function evalToBarPct(line: EngineLine | undefined, whiteToMove: boolean): number {
  if (!line) return 50;
  if (line.scoreMate !== null) {
    const m = whiteToMove ? line.scoreMate : -line.scoreMate;
    return m > 0 ? 98 : 2;
  }
  const cp = line.scoreCp ?? 0;
  const whitePov = whiteToMove ? cp : -cp;
  // Sigmoid squash
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.004 * whitePov)) - 1);
  return Math.max(2, Math.min(98, pct));
}
