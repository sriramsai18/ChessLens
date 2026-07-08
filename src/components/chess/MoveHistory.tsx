import { CLASS_META, type ClassifiedMove } from "@/lib/analysis";

export function MoveHistory({
  moves,
  currentPly,
  onJump,
  classified,
}: {
  moves: string[];
  currentPly: number;
  onJump: (ply: number) => void;
  classified?: ClassifiedMove[];
}) {
  const rows: { num: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      white: { san: moves[i]!, ply: i + 1 },
      black: moves[i + 1] ? { san: moves[i + 1]!, ply: i + 2 } : undefined,
    });
  }

  return (
    <div className="chesslens-scroll flex max-h-[360px] flex-col overflow-y-auto rounded-md border border-border bg-secondary/30">
      {rows.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Play a move to begin
        </div>
      )}
      {rows.map((r) => (
        <div key={r.num} className="grid grid-cols-[36px_1fr_1fr] items-center border-b border-border/50 text-sm last:border-b-0">
          <span className="mono px-2 py-1 text-xs text-muted-foreground">{r.num}.</span>
          {r.white && <MoveCell {...r.white} active={currentPly === r.white.ply} classified={classified?.[r.white.ply - 1]} onJump={onJump} />}
          {r.black
            ? <MoveCell {...r.black} active={currentPly === r.black.ply} classified={classified?.[r.black.ply - 1]} onJump={onJump} />
            : <span />}
        </div>
      ))}
    </div>
  );
}

function MoveCell({
  san,
  ply,
  active,
  classified,
  onJump,
}: {
  san: string;
  ply: number;
  active: boolean;
  classified?: ClassifiedMove;
  onJump: (ply: number) => void;
}) {
  const meta = classified ? CLASS_META[classified.classification] : null;
  return (
    <button
      onClick={() => onJump(ply)}
      className={
        "mono flex items-center gap-1 px-2 py-1 text-left text-sm transition hover:bg-accent " +
        (active ? "bg-primary/15 text-primary" : "text-foreground/90")
      }
    >
      <span>{san}</span>
      {meta && (
        <span
          className="mono text-[10px] font-bold"
          style={{ color: meta.colorVar }}
          title={`${meta.label}: ${meta.description}`}
        >
          {meta.symbol}
        </span>
      )}
    </button>
  );
}
