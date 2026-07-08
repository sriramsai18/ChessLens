import type { EngineLine } from "@/lib/stockfish";
import { formatEval } from "@/lib/analysis";
import { Chess } from "chess.js";

export function EngineLines({
  lines,
  fen,
  depth,
  onPlay,
}: {
  lines: EngineLine[];
  fen: string;
  depth: number;
  onPlay?: (uci: string) => void;
}) {
  const whiteToMove = fen.split(" ")[1] === "w";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
          Engine Lines
        </h3>
        <span className="mono text-xs text-muted-foreground">depth {depth}</span>
      </div>
      {lines.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Waiting for engine…
        </div>
      )}
      {lines.map((line) => {
        const san = pvToSan(fen, line.pv, 8);
        return (
          <div
            key={line.multipv}
            className="group rounded-md border border-border bg-secondary/40 p-2.5 transition hover:border-primary/40"
          >
            <div className="flex items-center gap-2">
              <span
                className="mono min-w-[54px] rounded px-2 py-0.5 text-xs font-bold"
                style={{
                  background: "color-mix(in oklab, var(--color-primary) 18%, transparent)",
                  color: "var(--color-primary)",
                }}
              >
                {formatEval(line, whiteToMove)}
              </span>
              <span className="mono flex-1 truncate text-sm text-foreground/90">
                {san.join(" ")}
              </span>
              {onPlay && line.pv[0] && (
                <button
                  onClick={() => onPlay(line.pv[0]!)}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:border-primary hover:text-primary"
                >
                  play
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function pvToSan(fen: string, uciList: string[], max: number): string[] {
  try {
    const chess = new Chess(fen);
    const out: string[] = [];
    for (const uci of uciList.slice(0, max)) {
      const m = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
      });
      if (!m) break;
      out.push(m.san);
    }
    return out;
  } catch {
    return uciList.slice(0, max);
  }
}
