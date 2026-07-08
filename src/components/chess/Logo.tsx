import knightMark from "@/assets/knight-mark.png.asset.json";

/**
 * ChessLens brand mark — user-provided chess knight silhouette.
 */
export function KnightMonocleMark({
  size = 40,
  className,
  animateMonocle: _animateMonocle = false,
}: {
  size?: number;
  className?: string;
  animateMonocle?: boolean;
}) {
  return (
    <img
      src={knightMark.url}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: "drop-shadow(0 2px 8px color-mix(in oklab, var(--color-primary) 45%, transparent))",
      }}
      aria-hidden
    />
  );
}

export function ChessLensWordmark({
  size = 40,
  className,
  animateMonocle = false,
}: {
  size?: number;
  className?: string;
  animateMonocle?: boolean;
}) {
  return (
    <div className={"flex items-center gap-2 " + (className ?? "")}>
      <KnightMonocleMark size={size} animateMonocle={animateMonocle} />
      <span
        className="display font-bold tracking-tight text-foreground"
        style={{ fontSize: Math.round(size * 0.62) }}
      >
        Chess<span className="text-primary">Lens</span>
      </span>
    </div>
  );
}
