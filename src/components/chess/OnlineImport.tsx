import { useState } from "react";
import { fetchLichessGames, fetchChessComGames, type OnlineGame } from "@/lib/online-games";

export function OnlineImport({ onLoad }: { onLoad: (pgn: string) => void }) {
  const [source, setSource] = useState<"lichess" | "chess.com">("lichess");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<OnlineGame[]>([]);

  const search = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      const list =
        source === "lichess" ? await fetchLichessGames(username, 50) : await fetchChessComGames(username, 50);
      setGames(list);
      if (list.length === 0) setError("No games found for that user.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-md bg-secondary/40 p-1">
        {(["lichess", "chess.com"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={
              "flex-1 rounded px-3 py-1.5 text-xs font-semibold transition " +
              (source === s
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {s === "lichess" ? "Lichess.org" : "Chess.com"}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex gap-2"
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={source === "lichess" ? "e.g. mikhail tal" : "e.g. Viswanathan Anand"}
          className="mono flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !username.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-40"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Fetches the 50 most recent public games. Click one to load it into the analyzer, then run{" "}
        <em>Analyze full game</em> for blunder detection.
      </p>

      {games.length > 0 && (
        <div className="flex max-h-[360px] flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => onLoad(g.pgn)}
              className="flex items-center justify-between gap-3 p-2 text-left text-xs transition hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  <span className="text-foreground">{g.white || "?"}</span>
                  <span className="mx-1 text-muted-foreground">vs</span>
                  <span className="text-foreground">{g.black || "?"}</span>
                </div>
                <div className="mono truncate text-[10px] text-muted-foreground">
                  {g.date} · {g.timeControl ?? "—"} · {g.source}
                </div>
              </div>
              <span className="mono rounded bg-secondary px-1.5 py-0.5 text-[10px] text-primary">
                {g.result || "*"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
