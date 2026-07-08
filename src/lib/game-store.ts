// Persistent game library — localStorage backed.
export interface SavedGame {
  id: string;
  name: string;
  pgn: string;
  createdAt: number;
  result?: string;
  white?: string;
  black?: string;
}

const KEY = "chesslens_games_v1";

export function listGames(): SavedGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedGame[]) : [];
  } catch {
    return [];
  }
}

export function saveGame(g: Omit<SavedGame, "id" | "createdAt">): SavedGame {
  const games = listGames();
  const entry: SavedGame = {
    ...g,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  games.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(games.slice(0, 100)));
  return entry;
}

export function deleteGame(id: string) {
  const games = listGames().filter((g) => g.id !== id);
  localStorage.setItem(KEY, JSON.stringify(games));
}
