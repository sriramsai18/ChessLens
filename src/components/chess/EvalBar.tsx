import { useMemo } from "react";
import type { EngineLine } from "@/lib/stockfish";
import { evalToBarPct, formatEval } from "@/lib/analysis";

export function EvalBar({
  line,
  whiteToMove,
  orientation,
}: {
  line: EngineLine | undefined;
  whiteToMove: boolean;
  orientation: "white" | "black";
}) {
  const pct = useMemo(() => evalToBarPct(line, whiteToMove), [line, whiteToMove]);
  const label = formatEval(line, whiteToMove);
  const flipped = orientation === "black";
  const whiteHeight = flipped ? 100 - pct : pct;

  return (
    <div className="flex flex-col items-center gap-1 self-stretch select-none">
      <div className="relative w-3 flex-1 min-h-[180px] overflow-hidden rounded-md border border-border bg-neutral-900 sm:w-5">
        <div
          className="absolute bottom-0 left-0 w-full bg-neutral-100 transition-all duration-300 ease-out"
          style={{ height: `${whiteHeight}%` }}
        />
        <div className="absolute left-0 top-1/2 h-px w-full bg-neutral-500/60" />
      </div>
      <span className="mono text-[10px] text-muted-foreground sm:text-xs">{label}</span>
    </div>
  );
}
