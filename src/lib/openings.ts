// Compact opening book keyed by move sequence prefix (SAN, space-joined).
// Not exhaustive — covers common openings so the UI can name them.
export interface OpeningEntry {
  eco: string;
  name: string;
}

const BOOK: Record<string, OpeningEntry> = {
  "e4": { eco: "B00", name: "King's Pawn Opening" },
  "e4 e5": { eco: "C20", name: "Open Game" },
  "e4 e5 Nf3": { eco: "C40", name: "King's Knight Opening" },
  "e4 e5 Nf3 Nc6": { eco: "C44", name: "King's Knight, Normal Variation" },
  "e4 e5 Nf3 Nc6 Bb5": { eco: "C60", name: "Ruy López (Spanish)" },
  "e4 e5 Nf3 Nc6 Bb5 a6": { eco: "C68", name: "Ruy López, Morphy Defense" },
  "e4 e5 Nf3 Nc6 Bc4": { eco: "C50", name: "Italian Game" },
  "e4 e5 Nf3 Nc6 Bc4 Bc5": { eco: "C50", name: "Italian Game, Giuoco Piano" },
  "e4 e5 Nf3 Nc6 Bc4 Nf6": { eco: "C55", name: "Italian, Two Knights Defense" },
  "e4 e5 Nf3 Nc6 Nc3": { eco: "C46", name: "Three Knights Opening" },
  "e4 e5 Nf3 Nf6": { eco: "C42", name: "Petrov's Defense" },
  "e4 e5 Nf3 d6": { eco: "C41", name: "Philidor Defense" },
  "e4 e5 Nc3": { eco: "C25", name: "Vienna Game" },
  "e4 e5 f4": { eco: "C30", name: "King's Gambit" },
  "e4 c5": { eco: "B20", name: "Sicilian Defense" },
  "e4 c5 Nf3": { eco: "B27", name: "Sicilian Defense" },
  "e4 c5 Nf3 d6": { eco: "B50", name: "Sicilian, Old Sicilian" },
  "e4 c5 Nf3 d6 d4": { eco: "B52", name: "Sicilian, Open" },
  "e4 c5 Nf3 Nc6": { eco: "B30", name: "Sicilian, Old Sicilian" },
  "e4 c5 Nf3 e6": { eco: "B40", name: "Sicilian Defense, French Variation" },
  "e4 c5 Nc3": { eco: "B23", name: "Sicilian, Closed" },
  "e4 e6": { eco: "C00", name: "French Defense" },
  "e4 e6 d4 d5": { eco: "C01", name: "French Defense" },
  "e4 e6 d4 d5 Nc3": { eco: "C10", name: "French, Paulsen Variation" },
  "e4 e6 d4 d5 e5": { eco: "C02", name: "French, Advance Variation" },
  "e4 e6 d4 d5 exd5": { eco: "C01", name: "French, Exchange Variation" },
  "e4 c6": { eco: "B10", name: "Caro-Kann Defense" },
  "e4 c6 d4 d5": { eco: "B12", name: "Caro-Kann Defense" },
  "e4 d5": { eco: "B01", name: "Scandinavian Defense" },
  "e4 d6": { eco: "B07", name: "Pirc Defense" },
  "e4 g6": { eco: "B06", name: "Modern Defense" },
  "e4 Nf6": { eco: "B02", name: "Alekhine's Defense" },
  "d4": { eco: "A40", name: "Queen's Pawn Opening" },
  "d4 d5": { eco: "D00", name: "Closed Game" },
  "d4 d5 c4": { eco: "D06", name: "Queen's Gambit" },
  "d4 d5 c4 e6": { eco: "D30", name: "Queen's Gambit Declined" },
  "d4 d5 c4 c6": { eco: "D10", name: "Slav Defense" },
  "d4 d5 c4 dxc4": { eco: "D20", name: "Queen's Gambit Accepted" },
  "d4 Nf6": { eco: "A45", name: "Indian Game" },
  "d4 Nf6 c4": { eco: "E00", name: "Indian Game" },
  "d4 Nf6 c4 e6": { eco: "E00", name: "Indian, Catalan/Nimzo Setup" },
  "d4 Nf6 c4 e6 Nc3 Bb4": { eco: "E20", name: "Nimzo-Indian Defense" },
  "d4 Nf6 c4 g6": { eco: "E60", name: "King's Indian Defense" },
  "d4 Nf6 c4 g6 Nc3 Bg7": { eco: "E61", name: "King's Indian Defense" },
  "d4 Nf6 c4 c5": { eco: "A56", name: "Benoni Defense" },
  "d4 f5": { eco: "A80", name: "Dutch Defense" },
  "c4": { eco: "A10", name: "English Opening" },
  "Nf3": { eco: "A04", name: "Réti Opening" },
  "b3": { eco: "A01", name: "Nimzo-Larsen Attack" },
  "g3": { eco: "A00", name: "Benko Opening" },
  "f4": { eco: "A02", name: "Bird's Opening" },
};

export function findOpening(moves: string[]): OpeningEntry | null {
  let best: OpeningEntry | null = null;
  for (let i = Math.min(moves.length, 20); i > 0; i--) {
    const key = moves.slice(0, i).join(" ");
    if (BOOK[key]) { best = BOOK[key]; break; }
  }
  return best;
}

export function isBookMove(moves: string[]): boolean {
  const key = moves.join(" ");
  return key in BOOK;
}
