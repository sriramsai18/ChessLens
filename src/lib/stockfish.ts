// Stockfish engine wrapper. Runs the WASM engine in a Web Worker and
// exposes a promise-based API for position analysis with MultiPV support.
// Commands are serialized so we never send `position` / `go` while a
// previous search is still running (that race is what caused WASM
// `unreachable` / `table index out of bounds` crashes mid-game).

export interface EngineLine {
  multipv: number;
  depth: number;
  scoreCp: number | null; // centipawns from side-to-move POV
  scoreMate: number | null; // mate in N (positive = side to move mates)
  pv: string[]; // UCI moves
  nps?: number;
}

export interface AnalysisResult {
  fen: string;
  depth: number;
  lines: EngineLine[];
  bestMove: string | null;
}

export interface AnalysisProgress {
  depth: number;
  lines: EngineLine[];
}

type Listener = (line: string) => void;

export interface StrengthOptions {
  /** UCI_LimitStrength + UCI_Elo (Stockfish 17 supports ~1320–3190). */
  elo?: number | null;
  /** Skill Level 0–20 (used when elo is null). */
  skill?: number | null;
}

class StockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private queue: Listener[] = [];
  /** Serializes searches: every new go() awaits the previous one. */
  private pending: Promise<void> = Promise.resolve();
  private currentMultiPV = 1;
  private currentStrength: StrengthOptions = {};
  private restarting: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.ready) return;
    if (typeof window === "undefined") throw new Error("Engine requires browser");
    this.worker = new Worker("/engine/stockfish.js");
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : (e.data?.data ?? "");
      // Copy so listeners removing themselves during iteration is safe
      for (const l of [...this.queue]) l(line);
    };
    this.worker.onerror = () => {
      // WASM crashed — schedule a restart so future analyze() calls recover.
      this.scheduleRestart();
    };
    await this.rawSend("uci", (l) => l === "uciok");
    await this.rawSend("isready", (l) => l === "readyok");
    this.ready = true;
    // Re-apply persisted options after (re)start.
    if (this.currentMultiPV !== 1) {
      this.post(`setoption name MultiPV value ${this.currentMultiPV}`);
    }
    await this.applyStrength(this.currentStrength);
  }

  private scheduleRestart() {
    if (this.restarting) return;
    this.ready = false;
    this.queue = [];
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this.restarting = this.init().finally(() => {
      this.restarting = null;
    });
  }

  private post(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  /** Raw send used during init only. */
  private rawSend(cmd: string, until: (l: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const listener: Listener = (line) => {
        if (until(line)) {
          this.queue = this.queue.filter((x) => x !== listener);
          resolve();
        }
      };
      this.queue.push(listener);
      this.post(cmd);
    });
  }

  private async applyStrength(opts: StrengthOptions) {
    if (opts.elo && opts.elo > 0) {
      this.post(`setoption name UCI_LimitStrength value true`);
      this.post(`setoption name UCI_Elo value ${Math.round(opts.elo)}`);
    } else {
      this.post(`setoption name UCI_LimitStrength value false`);
      if (opts.skill != null) {
        this.post(`setoption name Skill Level value ${Math.max(0, Math.min(20, opts.skill))}`);
      } else {
        this.post(`setoption name Skill Level value 20`);
      }
    }
    await this.rawSend("isready", (l) => l === "readyok");
  }

  async setOptions(opts: { multiPV?: number; threads?: number; hash?: number }) {
    if (!this.ready) await this.init();
    if (opts.multiPV) {
      this.currentMultiPV = opts.multiPV;
      this.post(`setoption name MultiPV value ${opts.multiPV}`);
    }
    if (opts.threads) this.post(`setoption name Threads value ${opts.threads}`);
    if (opts.hash) this.post(`setoption name Hash value ${opts.hash}`);
    await this.rawSend("isready", (l) => l === "readyok");
  }

  async setStrength(opts: StrengthOptions) {
    this.currentStrength = opts;
    if (!this.ready) await this.init();
    await this.applyStrength(opts);
  }

  /**
   * Stop the current search (if any) and wait for its bestmove before returning.
   * Callers should invoke this before issuing a new position/go.
   */
  async stop(): Promise<void> {
    if (!this.ready) return;
    this.post("stop");
    try {
      await this.pending;
    } catch {
      /* ignore */
    }
  }

  async analyze(
    fen: string,
    opts: { depth?: number; movetime?: number; multiPV?: number },
    onProgress?: (p: AnalysisProgress) => void,
  ): Promise<AnalysisResult> {
    // Wait for any previous search to end first (serialize commands).
    await this.stop();
    if (!this.ready) await this.init();

    const multiPV = opts.multiPV ?? 1;
    if (multiPV !== this.currentMultiPV) {
      this.currentMultiPV = multiPV;
      this.post(`setoption name MultiPV value ${multiPV}`);
      await this.rawSend("isready", (l) => l === "readyok");
    }

    const search = this.runSearch(fen, opts, onProgress);
    this.pending = search.then(
      () => {},
      () => {},
    );
    return search;
  }

  private runSearch(
    fen: string,
    opts: { depth?: number; movetime?: number },
    onProgress?: (p: AnalysisProgress) => void,
  ): Promise<AnalysisResult> {
    return new Promise((resolve) => {
      const linesByPv = new Map<number, EngineLine>();
      let latestDepth = 0;
      let bestMove: string | null = null;

      const listener: Listener = (line) => {
        if (typeof line !== "string") return;
        if (line.startsWith("info") && line.includes(" pv ")) {
          const parsed = parseInfoLine(line);
          if (parsed) {
            linesByPv.set(parsed.multipv, parsed);
            latestDepth = Math.max(latestDepth, parsed.depth);
            if (onProgress) {
              const lines = [...linesByPv.values()].sort((a, b) => a.multipv - b.multipv);
              onProgress({ depth: latestDepth, lines });
            }
          }
        } else if (line.startsWith("bestmove")) {
          const parts = line.split(/\s+/);
          bestMove = parts[1] === "(none)" ? null : (parts[1] ?? null);
          this.queue = this.queue.filter((x) => x !== listener);
          const lines = [...linesByPv.values()].sort((a, b) => a.multipv - b.multipv);
          resolve({ fen, depth: latestDepth, lines, bestMove });
        }
      };
      this.queue.push(listener);

      this.post(`position fen ${fen}`);
      const goCmd = opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 18}`;
      this.post(goCmd);
    });
  }

  quit() {
    if (this.worker) {
      this.post("quit");
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }
}

function parseInfoLine(line: string): EngineLine | null {
  const tokens = line.split(/\s+/);
  const idx = (k: string) => tokens.indexOf(k);
  const num = (k: string) => {
    const i = idx(k);
    return i >= 0 ? parseInt(tokens[i + 1]!, 10) : NaN;
  };
  const depth = num("depth");
  if (isNaN(depth)) return null;
  const multipv = idx("multipv") >= 0 ? num("multipv") : 1;
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;
  const sIdx = idx("score");
  if (sIdx >= 0) {
    const type = tokens[sIdx + 1];
    const val = parseInt(tokens[sIdx + 2]!, 10);
    if (type === "cp") scoreCp = val;
    else if (type === "mate") scoreMate = val;
  }
  const nps = idx("nps") >= 0 ? num("nps") : undefined;
  const pvIdx = idx("pv");
  const pv = pvIdx >= 0 ? tokens.slice(pvIdx + 1) : [];
  return { multipv, depth, scoreCp, scoreMate, pv, nps };
}

// Singleton per tab
let _engine: StockfishEngine | null = null;
export function getEngine(): StockfishEngine {
  if (!_engine) _engine = new StockfishEngine();
  return _engine;
}

/** Preset bot personalities backed by Stockfish strength options. */
export interface BotPreset {
  id: string;
  name: string;
  elo: number;
  emoji?: string;
  avatar?: string;
  blurb: string;
}

export const BOT_PRESETS: BotPreset[] = [
  {
    id: "Boogey Man",
    name: "Boogey Man",
    elo: 241,
    avatar: "/bots/image-3.png",
    blurb: "Beginner: Hangs their Queen on move 4, but plays with maximum chaos.",
  },
  {
    id: "Kiran Chaitu",
    name: "Kiran Chaitu",
    elo: 773,
    avatar: "/bots/image-2.png",
    blurb: "Casual: Plays purely for fun. Opening theory is completely non-existent.",
  },
  {
    id: "Abhi",
    name: "Abhi",
    elo: 931,
    avatar: "/bots/image-5.png",
    blurb: "Intermediate: Understands basic development but consistently misses tactical forks.",
  },
  {
    id: "Ayaz",
    name: "Ayaz",
    elo: 1312,
    avatar: "/bots/image-4.png",
    blurb: "Club Player: Deploys solid strategy, right up until a sudden tactical blindness strikes.",
  },
  {
    id: "Jinna",
    name: "Jinna",
    elo: 1354,
    avatar: "/bots/image-6.png",
    blurb: "Club Expert: Thrives in razor-sharp tactical lines and grinding out complex endgames.",
  },
  {
    id: "Akhil",
    name: "Akhil",
    elo: 1521,
    avatar: "/bots/image-7.png",
    blurb: "Middlegame Maestro: Navigates wild piece complications smoothly. Keep your king safe.",
  },
  {
    id: "Nani",
    name: "Nani",
    elo: 1600,
    avatar: "/bots/image-8.png",
    blurb: "Tactical Genius: Constantly hunts for brilliant sacrifices. Thinks they are Mikhail Tal.",
  },
  { 
    id: "Titan", 
    name: "TItan", 
    elo: 1900, 
    emoji: "🛡️", 
    blurb: "Expert: Immovable positional defense backed by sudden, lethal breakthroughs." 
  },
  { 
    id: "Nova", 
    name: "Nova", 
    elo: 2200, 
    emoji: "🌌", 
    blurb: "Candidate Master: A punishing machine. One tiny positional slip and the game is over." 
  },
  { 
    id: "Atlas", 
    name: "Atlaa", 
    elo: 2400, 
    emoji: "🌌", 
    blurb: "FIDE Master: Suffocating strategic pressure. Holds the weight of the entire board." 
  },
  { 
    id: "Pragg", 
    name: "Pragg", 
    elo: 2780, 
    emoji: "🌌", 
    blurb: "Super GM: Unbelievable defensive resilience. Even elite grandmasters fail to break through." 
  },
  { 
    id: "Gukesh", 
    name: "Gukesh", 
    elo: 2900, 
    emoji: "🌌", 
    blurb: "World Champion Class: Flawless, cold, and calculated execution from move one." 
  },
  { 
    id: "Abyass", 
    name: "Abyss", 
    elo: 3190, 
    emoji: "🌌", 
    blurb: "Maximum Stockfish: Pure silicon despair. Does not show human mercy." 
  },
];
