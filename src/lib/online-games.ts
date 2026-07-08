// Fetch recent games from Lichess and Chess.com public APIs.
// Both endpoints are CORS-enabled and require no API keys.

export interface OnlineGame {
  id: string;
  source: "lichess" | "chess.com";
  white: string;
  black: string;
  result: string;
  date: string;
  timeControl?: string;
  url?: string;
  pgn: string;
}

/** Split a text file that contains multiple PGN games into individual PGNs. */
function splitPgns(text: string): string[] {
  const games: string[] = [];
  let buf: string[] = [];
  let sawMoves = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("[Event ") && sawMoves) {
      games.push(buf.join("\n").trim());
      buf = [line];
      sawMoves = false;
    } else {
      buf.push(line);
      if (line.trim() && !line.startsWith("[")) sawMoves = true;
    }
  }
  if (buf.length) {
    const g = buf.join("\n").trim();
    if (g) games.push(g);
  }
  return games.filter(Boolean);
}

function tag(pgn: string, name: string): string {
  const m = pgn.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`));
  return m ? m[1]! : "";
}

export async function fetchLichessGames(username: string, max = 20): Promise<OnlineGame[]> {
  const u = encodeURIComponent(username.trim());
  const url = `https://lichess.org/api/games/user/${u}?max=${max}&clocks=false&evals=false&opening=false`;
  const res = await fetch(url, { headers: { Accept: "application/x-chess-pgn" } });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Lichess user "${username}" not found`);
    throw new Error(`Lichess request failed (${res.status})`);
  }
  const text = await res.text();
  return splitPgns(text).map((pgn) => ({
    id: tag(pgn, "Site") || crypto.randomUUID(),
    source: "lichess" as const,
    white: tag(pgn, "White"),
    black: tag(pgn, "Black"),
    result: tag(pgn, "Result"),
    date: tag(pgn, "UTCDate") || tag(pgn, "Date"),
    timeControl: tag(pgn, "TimeControl"),
    url: tag(pgn, "Site"),
    pgn,
  }));
}

export async function fetchChessComGames(username: string, max = 20): Promise<OnlineGame[]> {
  const u = encodeURIComponent(username.trim().toLowerCase());
  const archivesRes = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`);
  if (!archivesRes.ok) {
    if (archivesRes.status === 404) throw new Error(`Chess.com user "${username}" not found`);
    throw new Error(`Chess.com request failed (${archivesRes.status})`);
  }
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  if (!archives?.length) return [];

  const games: OnlineGame[] = [];
  // Walk backwards through months until we have enough games.
  for (let i = archives.length - 1; i >= 0 && games.length < max; i--) {
    const monthRes = await fetch(archives[i]!);
    if (!monthRes.ok) continue;
    const data = (await monthRes.json()) as {
      games: Array<{
        url: string;
        pgn?: string;
        time_control?: string;
        end_time?: number;
        white: { username: string };
        black: { username: string };
      }>;
    };
    // Newest first within a month.
    for (const g of [...data.games].reverse()) {
      if (!g.pgn) continue;
      games.push({
        id: g.url,
        source: "chess.com",
        white: g.white?.username ?? tag(g.pgn, "White"),
        black: g.black?.username ?? tag(g.pgn, "Black"),
        result: tag(g.pgn, "Result"),
        date: tag(g.pgn, "UTCDate") || tag(g.pgn, "Date"),
        timeControl: g.time_control,
        url: g.url,
        pgn: g.pgn,
      });
      if (games.length >= max) break;
    }
  }
  return games;
}
