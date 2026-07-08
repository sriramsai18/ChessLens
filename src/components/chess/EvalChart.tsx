import { useMemo } from "react";
import type { ClassifiedMove } from "@/lib/analysis";
import { cpToWinPct } from "@/lib/analysis";

/** Small SVG line chart of white-POV eval over the game. */
export function EvalChart({
  classified,
  currentPly,
  onJump,
}: {
  classified: ClassifiedMove[];
  currentPly: number;
  onJump: (ply: number) => void;
}) {
  const W = 560;
  const H = 120;

  const { points, areaPoints } = useMemo(() => {
    if (classified.length === 0) return { points: "", areaPoints: "" };
    const coords = classified.map((m, i) => {
      const isWhiteMove = i % 2 === 0;
      const cpWhite = isWhiteMove ? m.evalAfterCp : -m.evalAfterCp;
      const win = cpToWinPct(cpWhite);
      const x = (i / Math.max(1, classified.length - 1)) * W;
      const y = H - (win / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const first = coords[0].split(",")[0];
    const last = coords[coords.length - 1].split(",")[0];
    return {
      points: coords.join(" "),
      areaPoints: `${first},${H} ${coords.join(" ")} ${last},${H}`,
    };
  }, [classified]);

  const currentX =
    classified.length > 1
      ? ((currentPly - 1) / Math.max(1, classified.length - 1)) * W
      : 0;

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Evaluation</h3>
        <span className="text-[11px] text-muted-foreground">white advantage →</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        style={{ height: 120 }}
        onClick={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const ply = Math.round((x / W) * (classified.length - 1)) + 1;
          onJump(Math.max(1, Math.min(classified.length, ply)));
        }}
      >
        <rect x="0" y="0" width={W} height={H} fill="oklch(0.22 0.01 260)" />
        {areaPoints && (
          <polygon points={areaPoints} fill="oklch(0.96 0.01 250)" />
        )}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="oklch(0.5 0 0 / 0.5)" strokeDasharray="4 4" />
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="oklch(0.7 0.15 30)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
        {classified.length > 0 && (
          <line
            x1={currentX}
            y1="0"
            x2={currentX}
            y2={H}
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
        )}
      </svg>
    </div>
  );
}
