import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Plus,
  Undo2,
  FileCode2,
  FileText,
  Globe2,
  Download,
  Save,
  Library,
  X,
  Menu,
  Crown,
  Bot as BotIcon,
  Sparkles,
  Search,
  Flag,
} from "lucide-react";
import { getEngine, BOT_PRESETS, type AnalysisResult, type BotPreset } from "@/lib/stockfish";
import {
  CLASS_META,
  classifyMove,
  cpToWinPct,
  lineScoreCp,
  moveAccuracy,
  type ClassifiedMove,
} from "@/lib/analysis";
import { findOpening, isBookMove } from "@/lib/openings";
import { EvalBar } from "./EvalBar";
import { EngineLines } from "./EngineLines";
import { MoveHistory } from "./MoveHistory";
import { EvalChart } from "./EvalChart";
import { deleteGame, listGames, saveGame, type SavedGame } from "@/lib/game-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OnlineImport } from "./OnlineImport";
import { ChessLensWordmark } from "./Logo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DEFAULT_DEPTH = 20;

type BoardTheme = {
  id: string;
  name: string;
  light: string;
  dark: string;
  swatch: string;
};

const BOARD_THEMES: BoardTheme[] = [
  { id: "emerald", name: "Emerald", light: "#eae2c9", dark: "#4a7c3f", swatch: "#4a7c3f" },
  { id: "walnut", name: "Walnut", light: "#f0d9b5", dark: "#8b5a2b", swatch: "#8b5a2b" },
  { id: "midnight", name: "Midnight", light: "#dee3e6", dark: "#39547a", swatch: "#39547a" },
  { id: "coral", name: "Coral", light: "#fbe9e0", dark: "#c46a5b", swatch: "#c46a5b" },
  { id: "slate", name: "Slate", light: "#e8ecef", dark: "#4b5563", swatch: "#4b5563" },
  { id: "ice", name: "Ice", light: "#f2f7fb", dark: "#7aa2c7", swatch: "#7aa2c7" },
];


export function Analyzer() {
  // --- Game state ---
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [ply, setPly] = useState(0); // 0 = start
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [themeId, setThemeId] = useState<string>("emerald");
  const theme = useMemo(() => BOARD_THEMES.find((t) => t.id === themeId) ?? BOARD_THEMES[0]!, [themeId]);
  useEffect(() => {
    const saved = localStorage.getItem("board-theme");
    if (saved) setThemeId(saved);
  }, []);
  useEffect(() => { localStorage.setItem("board-theme", themeId); }, [themeId]);



  // --- Engine state ---
  const [engineReady, setEngineReady] = useState(false);
  const [engineStatus, setEngineStatus] = useState("Initializing…");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [multiPV, setMultiPV] = useState(3);
  const [depthTarget, setDepthTarget] = useState(DEFAULT_DEPTH);
  const analyzeToken = useRef(0);

  // --- Full-game analysis ---
  const [classified, setClassified] = useState<ClassifiedMove[]>([]);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null);

  // --- Play vs bot ---
  const [mode, setMode] = useState<"analyze" | "play">("analyze");
  const [botId, setBotId] = useState<string>(BOT_PRESETS[2]!.id);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [botThinking, setBotThinking] = useState(false);
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const bot: BotPreset = useMemo(
    () => BOT_PRESETS.find((b) => b.id === botId) ?? BOT_PRESETS[2]!,
    [botId],
  );

  // --- Library ---
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [modal, setModal] = useState<null | "load" | "pgn" | "fen" | "save" | "online">(null);

  // --- Click-to-move ---
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalTargets([]);
  }, []);

  // --- Promotion picker ---
  const [pendingPromotion, setPendingPromotion] = useState<
    { from: string; to: string; color: "w" | "b" } | null
  >(null);

  // --- Game over dismissal ---
  const [dismissedGameOverPly, setDismissedGameOverPly] = useState<number | null>(null);

  // Init engine
  useEffect(() => {
    const eng = getEngine();
    eng.init()
      .then(() => eng.setOptions({ multiPV: 3, hash: 32 }))
      .then(() => { setEngineReady(true); setEngineStatus("Stockfish 18 ready"); })
      .catch((e) => setEngineStatus(`Engine error: ${e.message}`));
    return () => { /* keep singleton alive across route re-renders */ };
  }, []);

  useEffect(() => { setSaved(listGames()); }, []);

  // Derived: current position (respects navigation)
  const currentFen = useMemo(() => {
    const c = new Chess();
    for (let i = 0; i < ply; i++) c.move(history[i]!);
    return c.fen();
  }, [history, ply]);

  const whiteToMove = currentFen.split(" ")[1] === "w";
  const opening = useMemo(() => findOpening(history.slice(0, ply)), [history, ply]);

  // Run engine when position changes
  const runAnalysis = useCallback(async () => {
    if (!engineReady) return;
    const eng = getEngine();
    eng.stop();
    const token = ++analyzeToken.current;
    setAnalysis({ fen: currentFen, depth: 0, lines: [], bestMove: null });
    try {
      const result = await eng.analyze(
        currentFen,
        { depth: depthTarget, multiPV },
        (p) => {
          if (token !== analyzeToken.current) return;
          setAnalysis({ fen: currentFen, depth: p.depth, lines: p.lines, bestMove: null });
        },
      );
      if (token === analyzeToken.current) setAnalysis(result);
    } catch (e) {
      // stopped or superseded
    }
  }, [currentFen, engineReady, depthTarget, multiPV]);

  useEffect(() => {
    if (mode === "analyze" && autoAnalyze) runAnalysis();
    else getEngine().stop();
  }, [autoAnalyze, runAnalysis, mode]);

  // --- Move handling ---
  const doMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    // Rebuild game at current ply then push new move
    const c = new Chess();
    try {
      for (let i = 0; i < ply; i++) c.move(history[i]!);
      const move = c.move({ from, to, promotion: promotion ?? "q" });
      if (!move) return false;
      const newHistory = [...history.slice(0, ply), move.san];
      setHistory(newHistory);
      setPly(newHistory.length);
      setFen(c.fen());
      chessRef.current = c;
      setClassified([]); // invalidate review
      setSelectedSquare(null);
      setLegalTargets([]);
      return true;
    } catch {
      // Illegal drag/drop — chess.js throws in v1.x. Just reject silently.
      return false;
    }
  }, [history, ply]);

  // Detect a pawn promotion move without applying it.
  const isPromotionMove = useCallback(
    (from: string, to: string): "w" | "b" | null => {
      const c = new Chess();
      try { for (let i = 0; i < ply; i++) c.move(history[i]!); } catch { return null; }
      const file = from.charCodeAt(0) - 97;
      const rank = 8 - parseInt(from[1]!, 10);
      const sq = c.board()[rank]?.[file];
      if (!sq || sq.type !== "p") return null;
      const targetRank = parseInt(to[1]!, 10);
      if (sq.color === "w" && targetRank === 8) return "w";
      if (sq.color === "b" && targetRank === 1) return "b";
      return null;
    },
    [history, ply],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare) return false;
      // In play mode, only allow moves for the player's color when it's their turn.
      if (mode === "play") {
        const sideToMove = currentFen.split(" ")[1] === "w" ? "white" : "black";
        if (sideToMove !== playerColor || botThinking) return false;
      }
      const promoColor = isPromotionMove(sourceSquare, targetSquare);
      if (promoColor) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare, color: promoColor });
        return false;
      }
      return doMove(sourceSquare, targetSquare);
    },
    [doMove, mode, currentFen, playerColor, botThinking, isPromotionMove],
  );

  // Click-to-move handler — works alongside drag-and-drop.
  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      // Build game at current ply to inspect turn and legal moves.
      const c = new Chess();
      try { for (let i = 0; i < ply; i++) c.move(history[i]!); } catch { return; }
      const turn = c.turn(); // "w" | "b"

      // In play mode, only allow selecting the player's own pieces when it's their turn.
      if (mode === "play") {
        const sideToMove = turn === "w" ? "white" : "black";
        if (sideToMove !== playerColor || botThinking) {
          clearSelection();
          return;
        }
      }

      // If a piece is already selected and target is a legal destination, move.
      if (selectedSquare && legalTargets.includes(square)) {
        const promoColor = isPromotionMove(selectedSquare, square);
        if (promoColor) {
          setPendingPromotion({ from: selectedSquare, to: square, color: promoColor });
          clearSelection();
          return;
        }
        doMove(selectedSquare, square);
        return;
      }

      // Clicking the same square deselects.
      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      // Selecting one of the side-to-move's own pieces.
      const pieceColor = piece ? (piece.pieceType[0] === "w" ? "w" : "b") : null;
      if (piece && pieceColor === turn) {
        try {
          const moves = c.moves({ square: square as never, verbose: true }) as Array<{ to: string }>;
          setSelectedSquare(square);
          setLegalTargets(moves.map((m) => m.to));
        } catch {
          clearSelection();
        }
        return;
      }

      // Empty / invalid square — clear.
      clearSelection();
    },
    [ply, history, mode, playerColor, botThinking, selectedSquare, legalTargets, doMove, clearSelection, isPromotionMove],
  );

  // Reset selection when position context changes.
  useEffect(() => { clearSelection(); }, [ply, mode, orientation, clearSelection]);

  // Navigation
  const jump = useCallback((newPly: number) => {
    const target = Math.max(0, Math.min(history.length, newPly));
    setPly(target);
  }, [history.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") jump(ply - 1);
      else if (e.key === "ArrowRight") jump(ply + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") jump(0);
      else if (e.key === "ArrowDown" || e.key === "End") jump(history.length);
      else if (e.key === " ") { e.preventDefault(); setAutoAnalyze((v) => !v); }
      else if (e.key === "f" || e.key === "F") setOrientation((o) => o === "white" ? "black" : "white");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, history.length, jump]);

  // --- Bot move (Play mode) ---
  useEffect(() => {
    if (mode !== "play" || !engineReady) return;
    // Only respond when we're on the latest ply and it's the bot's turn.
    if (ply !== history.length) return;
    const c = new Chess();
    try { for (const m of history) c.move(m); } catch { return; }
    if (c.isGameOver()) return;
    const sideToMove = c.turn() === "w" ? "white" : "black";
    if (sideToMove === playerColor) return;

    let cancelled = false;
    setBotThinking(true);
    (async () => {
      const eng = getEngine();
      try {
        await eng.setStrength({ elo: bot.elo });
        // Add small thinking delay for realism; stronger bots think longer.
        const movetime = Math.round(200 + (bot.elo - 1300) * 0.5);
        const res = await eng.analyze(c.fen(), { movetime });
        if (cancelled || !res.bestMove) return;
        doMove(res.bestMove.slice(0, 2), res.bestMove.slice(2, 4), res.bestMove[4]);
      } catch {
        /* engine restart etc. */
      } finally {
        if (!cancelled) setBotThinking(false);
        // Restore full strength for analysis mode.
        try { await getEngine().setStrength({ elo: null }); } catch { /* noop */ }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, engineReady, ply, history, playerColor, bot, doMove]);

  // --- Actions ---
  const newGame = () => {
    getEngine().stop();
    chessRef.current = new Chess();
    setHistory([]); setPly(0); setFen(chessRef.current.fen()); setClassified([]);
  };

  const undo = () => {
    if (ply === 0) return;
    const newHistory = history.slice(0, ply - 1);
    setHistory(newHistory);
    setPly(newHistory.length);
    setClassified([]);
  };

  const loadFen = (input: string) => {
    try {
      const c = new Chess(input.trim());
      chessRef.current = c;
      setHistory([]); setPly(0); setFen(c.fen()); setClassified([]);
      setModal(null);
    } catch (e) {
      alert("Invalid FEN");
    }
  };

  const loadPgn = (pgn: string) => {
    try {
      const c = new Chess();
      c.loadPgn(pgn.trim());
      const moves = c.history();
      chessRef.current = c;
      setHistory(moves); setPly(moves.length); setFen(c.fen()); setClassified([]);
      setModal(null);
    } catch (e) {
      alert("Could not parse PGN");
    }
  };

  const exportPgn = () => {
    const c = new Chess();
    for (const m of history) c.move(m);
    const pgn = c.pgn();
    navigator.clipboard.writeText(pgn).catch(() => {});
    downloadText(`chesslens-${Date.now()}.pgn`, pgn);
  };

  const persist = (name: string) => {
    const c = new Chess();
    for (const m of history) c.move(m);
    saveGame({ name, pgn: c.pgn() });
    setSaved(listGames());
    setModal(null);
  };

  const loadSaved = (g: SavedGame) => {
    loadPgn(g.pgn);
  };

  // --- Full-game review ---
  const reviewGame = async () => {
    if (history.length === 0) return;
    const eng = getEngine();
    eng.stop();
    await eng.setOptions({ multiPV: 1 });
    setReviewProgress({ done: 0, total: history.length });

    // Replay to collect positions
    const positions: { fenBefore: string; san: string; uci: string; fenAfter: string; ply: number }[] = [];
    const c = new Chess();
    for (let i = 0; i < history.length; i++) {
      const fenBefore = c.fen();
      const m = c.move(history[i]!);
      if (!m) break;
      const uci = m.from + m.to + (m.promotion ?? "");
      positions.push({ fenBefore, san: m.san, uci, fenAfter: c.fen(), ply: i + 1 });
    }

    // For each position: evaluate BEFORE (find best move & eval), evaluate AFTER (opp POV, flip).
    const results: ClassifiedMove[] = [];
    const REVIEW_DEPTH = 14; // faster, still ~2000 elo
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      const before = await eng.analyze(p.fenBefore, { depth: REVIEW_DEPTH, multiPV: 1 });
      const beforeCp = lineScoreCp(before.lines[0]);
      const bestUci = before.bestMove;

      const after = await eng.analyze(p.fenAfter, { depth: REVIEW_DEPTH, multiPV: 1 });
      const afterCpOppPov = lineScoreCp(after.lines[0]);
      const afterCpMoverPov = -afterCpOppPov;

      const wasBook = isBookMove(history.slice(0, i + 1));
      const classification = classifyMove({
        evalBeforeCp: beforeCp,
        evalAfterCp: afterCpMoverPov,
        playedUci: p.uci,
        bestUci,
        wasBook,
      });

      const winBefore = cpToWinPct(beforeCp);
      const winAfter = cpToWinPct(afterCpMoverPov);

      results.push({
        ply: p.ply,
        san: p.san,
        uci: p.uci,
        fenBefore: p.fenBefore,
        fenAfter: p.fenAfter,
        evalBeforeCp: beforeCp,
        evalAfterCp: afterCpMoverPov,
        bestMoveUci: bestUci,
        bestLine: before.lines[0]?.pv ?? [],
        classification,
        winPctBefore: winBefore,
        winPctAfter: winAfter,
        accuracy: moveAccuracy(winBefore, winAfter),
        wasBook,
      });
      setReviewProgress({ done: i + 1, total: positions.length });
      setClassified([...results]);
    }
    setReviewProgress(null);
    await eng.setOptions({ multiPV });
    if (autoAnalyze) runAnalysis();
  };

  const accuracy = useMemo(() => {
    if (classified.length === 0) return null;
    const white: number[] = [], black: number[] = [];
    classified.forEach((m, i) => (i % 2 === 0 ? white : black).push(m.accuracy));
    const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return { white: avg(white), black: avg(black) };
  }, [classified]);

  const counts = useMemo(() => {
    const c: Record<string, { white: number; black: number }> = {};
    for (const k of Object.keys(CLASS_META)) c[k] = { white: 0, black: 0 };
    classified.forEach((m, i) => {
      const side = i % 2 === 0 ? "white" : "black";
      c[m.classification]![side]++;
    });
    return c;
  }, [classified]);

  // Game over detection at current ply.
  const gameOver = useMemo(() => {
    const c = new Chess();
    try { for (let i = 0; i < ply; i++) c.move(history[i]!); } catch { return null; }
    if (!c.isGameOver()) return null;
    const turn = c.turn(); // side to move — the one that has no move
    if (c.isCheckmate()) {
      const winner: "white" | "black" = turn === "w" ? "black" : "white";

      return {
        kind: "checkmate" as const,
        winner,
        title: winner === "white" ? "White wins" : "Black wins",
        subtitle: "Checkmate",
      };
    }
    if (c.isStalemate()) return { kind: "stalemate" as const, winner: null, title: "Draw", subtitle: "Stalemate" };
    if (c.isThreefoldRepetition()) return { kind: "repetition" as const, winner: null, title: "Draw", subtitle: "Threefold repetition" };
    if (c.isInsufficientMaterial()) return { kind: "material" as const, winner: null, title: "Draw", subtitle: "Insufficient material" };
    if (c.isDraw()) return { kind: "50move" as const, winner: null, title: "Draw", subtitle: "Fifty-move rule" };
    return { kind: "draw" as const, winner: null, title: "Draw", subtitle: "Game over" };
  }, [history, ply]);

  const showGameOver = gameOver !== null && ply === history.length && dismissedGameOverPly !== ply;

  // Board decorations
  const bestArrow = useMemo(() => {
    const l = analysis?.lines[0];
    if (!l || !l.pv[0]) return [];
    const u = l.pv[0];
    return [{ startSquare: u.slice(0, 2), endSquare: u.slice(2, 4), color: "rgba(120,215,140,0.85)" }];
  }, [analysis]);

  const currentMoveHighlight = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Last-move highlight
    if (ply > 0 && history[ply - 1]) {
      const c = new Chess();
      for (let i = 0; i < ply - 1; i++) c.move(history[i]!);
      const m = c.move(history[ply - 1]!);
      if (m) {
        styles[m.from] = { background: "color-mix(in oklab, var(--color-primary) 25%, transparent)" };
        styles[m.to] = { background: "color-mix(in oklab, var(--color-primary) 35%, transparent)" };
      }
    }

    // Click-to-move: selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        background: "color-mix(in oklab, var(--color-primary) 55%, transparent)",
        boxShadow: "inset 0 0 0 3px var(--color-primary)",
      };
    }

    // Click-to-move: legal destinations (dots for empty, ring for captures)
    for (const t of legalTargets) {
      const board = chessRef.current.board?.();
      // Fall back to a fresh game at ply for occupancy check
      const c = new Chess();
      try { for (let i = 0; i < ply; i++) c.move(history[i]!); } catch { /* noop */ }
      const file = t.charCodeAt(0) - 97; // a=0
      const rank = 8 - parseInt(t[1]!, 10);
      const occupied = c.board()[rank]?.[file] != null;
      const prev = styles[t] ?? {};
      if (occupied) {
        styles[t] = {
          ...prev,
          boxShadow:
            "inset 0 0 0 4px rgba(30, 30, 30, 0.8)",
          borderRadius: "50%",
        };
      } else {
        styles[t] = {
          ...prev,
          backgroundImage:
            "radial-gradient(circle, rgba(30, 30, 30, 0.8) 22%, transparent 24%)",
        };
      }

      // Suppress unused var warning
      void board;
    }

    return styles;
  }, [history, ply, selectedSquare, legalTargets]);

  const leftPanel = (
    <div className="flex flex-col gap-4">
      <div className="glass p-3">
        <div
          role="tablist"
          aria-label="Analyzer mode"
          className="grid grid-cols-2 gap-1 rounded-md bg-secondary/40 p-1"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setMode((m) => (m === "analyze" ? "play" : "analyze"));
            }
          }}
        >
          <ModeTab active={mode === "analyze"} onClick={() => setMode("analyze")} controls="analyzer-side-panel">Analyze</ModeTab>
          <ModeTab active={mode === "play"} onClick={() => setMode("play")} controls="analyzer-side-panel">Play Bot</ModeTab>
        </div>
      </div>




      {mode === "play" ? (
        <div className="glass p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Opponent</div>
          <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {BOT_PRESETS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBotId(b.id)}
                aria-pressed={b.id === botId}
                className={
                  "flex min-h-11 items-center gap-3 rounded-lg border p-2.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 " +
                  (b.id === botId
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/30 hover:border-primary/40")
                }
              >
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background/70 text-primary"
                >
                  {b.avatar ? (
                    <img src={b.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base leading-none">{b.emoji}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{b.name}</span>
                    <span className="mono text-[10px] text-primary">{b.elo}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{b.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Play as</div>
          <div className="grid grid-cols-2 gap-2">
            <Btn
              onClick={() => { setPlayerColor("white"); setOrientation("white"); newGame(); }}
              className={"justify-center " + (playerColor === "white" ? "border-primary/60 bg-primary/10" : "")}
              aria-pressed={playerColor === "white"}
            >
              <Crown className="h-4 w-4" aria-hidden />
              White
            </Btn>
            <Btn
              onClick={() => { setPlayerColor("black"); setOrientation("black"); newGame(); }}
              className={"justify-center " + (playerColor === "black" ? "border-primary/60 bg-primary/10" : "")}
              aria-pressed={playerColor === "black"}
            >
              <Crown className="h-4 w-4 text-foreground/60" aria-hidden />
              Black
            </Btn>
          </div>
          <Btn
            onClick={() => { newGame(); setLeftSheetOpen(false); }}
            className="mt-3 w-full justify-center border-primary/60 bg-primary/15 hover:bg-primary/25"
          >
            <BotIcon className="h-4 w-4 text-primary" aria-hidden />
            Play {bot.name}
          </Btn>



        </div>
      ) : (
        <div className="glass p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Opening</div>
              <div className="text-sm font-semibold">
                {opening ? (
                  <>
                    <span className="mono mr-2 text-primary">{opening.eco}</span>
                    {opening.name}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">To move</div>
              <div className="text-sm font-semibold">{whiteToMove ? "White" : "Black"}</div>
            </div>
          </div>
          <div style={{ minHeight: `${multiPV * 52 + 30}px` }}>
            <EngineLines
              lines={analysis?.lines ?? []}
              fen={currentFen}
              depth={analysis?.depth ?? 0}
              onPlay={(uci) => doMove(uci.slice(0, 2), uci.slice(2, 4), uci[4])}
            />
          </div>
        </div>
      )}

      {classified.length > 0 && (
        <div className="glass p-4">
          <EvalChart classified={classified} currentPly={ply} onJump={jump} />
          {accuracy && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <AccuracyCard label="White accuracy" value={accuracy.white} />
              <AccuracyCard label="Black accuracy" value={accuracy.black} />
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["best", "great", "good", "inaccuracy", "mistake", "blunder"] as const).map((k) => (
              <div key={k} className="rounded-md border border-border bg-secondary/30 p-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{CLASS_META[k].label}</div>
                <div className="mono text-sm" style={{ color: CLASS_META[k].colorVar }}>
                  {counts[k]!.white} / {counts[k]!.black}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass p-4 text-xs text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Shortcuts</div>
        <div className="mono grid grid-cols-2 gap-y-1">
          <span>← / →</span><span>prev / next</span>
          <span>↑ ↓ / Home End</span><span>first / last</span>
          <span>F</span><span>flip board</span>
          <span>Space</span><span>toggle auto</span>
          <span>Tab</span><span>focus controls</span>
        </div>
      </div>

    </div>
  );

  const rightPanel = (
    <div className="flex flex-col gap-4">
      <div className="glass p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Moves</h3>
          <span className="mono text-xs text-muted-foreground">
            {history.length} plies
          </span>
        </div>
        <MoveHistory
          moves={history}
          currentPly={ply}
          onJump={jump}
          classified={classified.length ? classified : undefined}
        />
      </div>

      <div className="glass p-4">
        <h3 className="mb-2 text-sm font-semibold">Game Review</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Analyze every move and classify blunders, mistakes, and inaccuracies.
        </p>
        <button
          onClick={reviewGame}
          disabled={history.length === 0 || reviewProgress !== null || !engineReady}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {reviewProgress ? (
            <><Search className="h-4 w-4 animate-pulse" aria-hidden /> Analyzing {reviewProgress.done} / {reviewProgress.total}…</>
          ) : (
            <><Sparkles className="h-4 w-4" aria-hidden /> {classified.length ? "Re-run review" : "Analyze full game"}</>
          )}
        </button>
        {reviewProgress && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(reviewProgress.done / reviewProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="glass p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground">Board theme</div>
        <div
          role="radiogroup"
          aria-label="Board theme"
          className="grid grid-cols-3 gap-2"
        >
          {BOARD_THEMES.map((t) => {
            const active = t.id === themeId;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={active}
                aria-label={`${t.name} board theme`}
                onClick={() => setThemeId(t.id)}
                className={
                  "group flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 " +
                  (active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40")
                }
              >
                <span
                  aria-hidden
                  className="grid h-8 w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-sm ring-1 ring-black/20"
                >
                  <span style={{ background: t.light }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.light }} />
                </span>
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 p-4 md:p-6">
      <Header status={engineStatus} ready={engineReady} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* Left panel — desktop only */}
        <aside className="hidden xl:flex xl:flex-col xl:order-1">{leftPanel}</aside>

        {/* Center: Board + eval bar */}
        <section
          id="analyzer-side-panel"
          aria-label={mode === "play" ? "Play vs bot board" : "Analysis board"}
          className="glass flex flex-col gap-3 p-3 sm:p-4 xl:order-2"
        >
          {/* Mobile/tablet drawer triggers */}
          <div
            role="toolbar"
            aria-label="Board panels"
            className="flex items-center justify-between gap-2 xl:hidden"
          >
            <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
              <SheetTrigger asChild>
                <Btn
                  aria-label={`Open ${mode === "play" ? "Play vs Bot" : "Analyze"} panel`}
                  aria-haspopup="dialog"
                >
                  <Menu className="h-4 w-4" aria-hidden />
                  {mode === "play" ? "Play" : "Analyze"}
                </Btn>
              </SheetTrigger>
              <SheetContent
                side="left"
                aria-label="Analyze and play panel"
                className="w-[88vw] max-w-sm overflow-y-auto p-4"
              >
                <SheetHeader className="mb-3">
                  <SheetTitle>Analyze &amp; Play</SheetTitle>
                </SheetHeader>
                {leftPanel}
              </SheetContent>
            </Sheet>
            <span className="mono hidden truncate px-2 text-[11px] text-muted-foreground sm:inline" aria-live="polite">
              {opening ? `${opening.eco} · ${opening.name}` : (whiteToMove ? "White to move" : "Black to move")}
            </span>
            <Sheet>
              <SheetTrigger asChild>
                <Btn aria-label="Open moves and game review panel" aria-haspopup="dialog">
                  Moves
                  <Menu className="h-4 w-4" aria-hidden />
                </Btn>
              </SheetTrigger>
              <SheetContent
                side="right"
                aria-label="Moves and review panel"
                className="w-[88vw] max-w-sm overflow-y-auto p-4"
              >
                <SheetHeader className="mb-3">
                  <SheetTitle>Moves &amp; Review</SheetTitle>
                </SheetHeader>
                {rightPanel}
              </SheetContent>
            </Sheet>
          </div>


          {mode === "play" && (
            <div className="mx-auto mb-2 flex w-full max-w-[min(70vh,100%,640px)] items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <span
                aria-hidden
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background/70 text-primary"
              >
                {bot.avatar ? (
                  <img src={bot.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg leading-none">{bot.emoji}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{bot.name}</span>
                  <span className="mono rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{bot.elo}</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{bot.blurb}</div>
              </div>
              <span className={"mono shrink-0 text-[11px] " + (botThinking ? "text-primary" : "text-muted-foreground")}>
                {botThinking ? "thinking…" : "your move"}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Resign game"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden />
                    Resign
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to resign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will end your game against {bot.name} and return you to the home page.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        newGame();
                        setMode("analyze");
                        setLeftSheetOpen(false);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
                    >
                      Resign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          <div className="flex items-stretch justify-center gap-2 sm:gap-3">

            <EvalBar
              line={analysis?.lines[0]}
              whiteToMove={whiteToMove}
              orientation={orientation}
            />
            <div
              className="w-full max-w-[min(70vh,100%,640px)] aspect-square"
              role="application"
              aria-label={`Chessboard, ${whiteToMove ? "white" : "black"} to move`}
            >
              <Chessboard
                options={{
                  position: currentFen,
                  onPieceDrop,
                  onSquareClick,
                  boardOrientation: orientation,
                  darkSquareStyle: { backgroundColor: theme.dark },
                  lightSquareStyle: { backgroundColor: theme.light },
                  boardStyle: {
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 1fr)",
                    overflow: "hidden",
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    backgroundColor: theme.dark,
                    borderRadius: "6px",
                  },
                  squareStyles: currentMoveHighlight,
                  arrows: mode === "analyze" ? bestArrow : [],
                  animationDurationInMs: 180,
                  id: "analyzer-board",
                }}
              />
            </div>
          </div>


          <NavBar
            ply={ply}
            total={history.length}
            onJump={jump}
            onFlip={() => setOrientation((o) => o === "white" ? "black" : "white")}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={newGame}><Plus className="h-4 w-4" aria-hidden /> New</Btn>
            <Btn onClick={undo} disabled={ply === 0}><Undo2 className="h-4 w-4" aria-hidden /> Undo</Btn>
            <Btn onClick={() => setModal("fen")}><FileCode2 className="h-4 w-4" aria-hidden /> Load FEN</Btn>
            <Btn onClick={() => setModal("pgn")}><FileText className="h-4 w-4" aria-hidden /> Load PGN</Btn>
            <Btn onClick={() => setModal("online")}><Globe2 className="h-4 w-4" aria-hidden /> Import Online</Btn>
            <Btn onClick={exportPgn} disabled={history.length === 0}><Download className="h-4 w-4" aria-hidden /> Export PGN</Btn>
            <Btn onClick={() => setModal("save")} disabled={history.length === 0}><Save className="h-4 w-4" aria-hidden /> Save</Btn>
            <Btn onClick={() => setModal("load")}><Library className="h-4 w-4" aria-hidden /> Library ({saved.length})</Btn>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1 mono">
                <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
                auto
              </label>
              <label className="flex items-center gap-1 mono">
                depth
                <input
                  type="number" min={8} max={30} value={depthTarget}
                  onChange={(e) => setDepthTarget(parseInt(e.target.value) || DEFAULT_DEPTH)}
                  className="w-14 rounded border border-border bg-background px-1 py-0.5"
                />
              </label>
              <label className="flex items-center gap-1 mono">
                lines
                <input
                  type="number" min={1} max={5} value={multiPV}
                  onChange={(e) => setMultiPV(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                  className="w-12 rounded border border-border bg-background px-1 py-0.5"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Right panel — desktop only */}
        <aside className="hidden xl:flex xl:flex-col xl:order-3">{rightPanel}</aside>
      </div>




      {/* Modals */}
      {modal === "fen" && (
        <Modal title="Load position from FEN" onClose={() => setModal(null)}>
          <FenLoader onLoad={loadFen} />
        </Modal>
      )}
      {modal === "pgn" && (
        <Modal title="Load game from PGN" onClose={() => setModal(null)}>
          <PgnLoader onLoad={loadPgn} />
        </Modal>
      )}
      {modal === "save" && (
        <Modal title="Save game to library" onClose={() => setModal(null)}>
          <SavePrompt onSave={persist} />
        </Modal>
      )}
      {modal === "load" && (
        <Modal title="Your saved games" onClose={() => setModal(null)}>
          <SavedList
            saved={saved}
            onLoad={loadSaved}
            onDelete={(id) => { deleteGame(id); setSaved(listGames()); }}
          />
        </Modal>
      )}
      {modal === "online" && (
        <Modal title="Import games from Lichess or Chess.com" onClose={() => setModal(null)}>
          <OnlineImport onLoad={loadPgn} />
        </Modal>
      )}

      {/* Promotion picker */}
      {pendingPromotion && (
        <PromotionPicker
          color={pendingPromotion.color}
          onPick={(piece) => {
            const p = pendingPromotion;
            setPendingPromotion(null);
            doMove(p.from, p.to, piece);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}

      {/* Game over dialog */}
      {showGameOver && gameOver && (
        <GameOverDialog
          title={gameOver.title}
          subtitle={gameOver.subtitle}
          winner={gameOver.winner}
          canReview={history.length > 0 && reviewProgress === null && engineReady}
          reviewing={reviewProgress !== null}
          alreadyReviewed={classified.length > 0}
          onReview={() => { setDismissedGameOverPly(ply); reviewGame(); }}
          onClose={() => setDismissedGameOverPly(ply)}
          onNewGame={() => { setDismissedGameOverPly(null); newGame(); }}
        />
      )}
    </div>
  );
}

/* ---------- small subcomponents ---------- */

function Header({ status, ready }: { status: string; ready: boolean }) {
  return (
    <header className="glass flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <ChessLensWordmark size={32} />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          real-time chess analyzer
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1.5 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: ready ? "var(--color-primary)" : "var(--color-eval-inaccuracy)",
            boxShadow: ready ? "0 0 8px var(--color-primary)" : undefined,
          }}
          aria-hidden
        />
        <span className="mono truncate text-muted-foreground">{status}</span>
      </div>
    </header>
  );
}

function NavBar({
  ply, total, onJump, onFlip,
}: {
  ply: number; total: number; onJump: (p: number) => void; onFlip: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Move navigation"
      className="flex items-center justify-center gap-1 rounded-2xl border border-border bg-card/40 p-1.5"
    >
      <NavBtn onClick={() => onJump(0)} disabled={ply === 0} aria-label="Jump to first move">
        <ChevronFirst className="h-5 w-5" aria-hidden />
      </NavBtn>
      <NavBtn onClick={() => onJump(ply - 1)} disabled={ply === 0} aria-label="Previous move">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </NavBtn>
      <span
        className="mono min-w-[68px] px-2 text-center text-xs text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {ply} / {total}
      </span>
      <NavBtn onClick={() => onJump(ply + 1)} disabled={ply >= total} aria-label="Next move">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </NavBtn>
      <NavBtn onClick={() => onJump(total)} disabled={ply >= total} aria-label="Jump to last move">
        <ChevronLast className="h-5 w-5" aria-hidden />
      </NavBtn>
      <span aria-hidden className="mx-1 h-6 w-px bg-border" />
      <NavBtn onClick={onFlip} title="Flip board (F)" aria-label="Flip board">
        <FlipVertical2 className="h-5 w-5" aria-hidden />
      </NavBtn>
    </div>
  );
}


function ModeTab({ active, onClick, children, controls }: { active: boolean; onClick: () => void; children: React.ReactNode; controls?: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={
        "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 " +
        (active
          ? "bg-primary text-primary-foreground shadow-[0_0_16px_-4px_var(--color-primary)]"
          : "text-muted-foreground hover:text-foreground")
      }
    >{children}</button>
  );
}


const NavBtn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function NavBtn(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={"inline-flex h-11 w-11 items-center justify-center rounded-xl text-foreground/80 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-95 disabled:pointer-events-none disabled:opacity-30 " + (props.className ?? "")}
      />
    );
  },
);

const Btn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function Btn(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={"inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-sm font-medium text-foreground/90 transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[.98] disabled:pointer-events-none disabled:opacity-40 " + (props.className ?? "")}
      />
    );
  },
);


function AccuracyCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-2xl font-bold text-primary">{value.toFixed(1)}%</div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FenLoader({ onLoad }: { onLoad: (fen: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        rows={3}
        className="mono w-full rounded-md border border-border bg-background p-2 text-xs"
      />
      <button
        onClick={() => onLoad(v)}
        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
      >Load</button>
    </div>
  );
}

function PgnLoader({ onLoad }: { onLoad: (pgn: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="[Event &quot;Casual&quot;]&#10;1. e4 e5 2. Nf3 Nc6 3. Bb5 …"
        rows={8}
        className="mono w-full rounded-md border border-border bg-background p-2 text-xs"
      />
      <button
        onClick={() => onLoad(v)}
        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
      >Load</button>
    </div>
  );
}

function SavePrompt({ onSave }: { onSave: (name: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Game name"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoFocus
      />
      <button
        onClick={() => onSave(v || `Game ${new Date().toLocaleString()}`)}
        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
      >Save</button>
    </div>
  );
}

function SavedList({
  saved, onLoad, onDelete,
}: {
  saved: SavedGame[]; onLoad: (g: SavedGame) => void; onDelete: (id: string) => void;
}) {
  if (saved.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved games yet.</p>;
  }
  return (
    <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
      {saved.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{g.name}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(g.createdAt).toLocaleString()}
            </div>
          </div>
          <button
            onClick={() => onLoad(g)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
          >Load</button>
          <button
            onClick={() => onDelete(g.id)}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
          >Delete</button>
        </li>
      ))}
    </ul>
  );
}

function downloadText(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PromotionPicker({
  color, onPick, onCancel,
}: {
  color: "w" | "b";
  onPick: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}) {
  const pieces: Array<{ id: "q" | "r" | "b" | "n"; label: string; glyph: string }> = [
    { id: "q", label: "Queen", glyph: color === "w" ? "♕" : "♛" },
    { id: "r", label: "Rook", glyph: color === "w" ? "♖" : "♜" },
    { id: "b", label: "Bishop", glyph: color === "w" ? "♗" : "♝" },
    { id: "n", label: "Knight", glyph: color === "w" ? "♘" : "♞" },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      onClick={onCancel}
    >
      <div
        className="glass w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pawn promotion</div>
          <div className="text-base font-semibold">Choose a piece</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {pieces.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              aria-label={`Promote to ${p.label}`}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-secondary/40 p-2 text-foreground transition hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[.98]"
            >
              <span className="text-3xl leading-none" aria-hidden>{p.glyph}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GameOverDialog({
  title, subtitle, winner, canReview, reviewing, alreadyReviewed, onReview, onClose, onNewGame,
}: {
  title: string;
  subtitle: string;
  winner: "white" | "black" | null;
  canReview: boolean;
  reviewing: boolean;
  alreadyReviewed: boolean;
  onReview: () => void;
  onClose: () => void;
  onNewGame: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
    >
      <div className="glass w-full max-w-md p-6 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          {winner ? (
            <Crown
              className={"h-6 w-6 " + (winner === "white" ? "text-foreground" : "text-foreground/70")}
              aria-hidden
            />
          ) : (
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          )}
        </div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Game over</div>
        <h2 className="mt-1 text-2xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onReview}
            disabled={!canReview}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {reviewing ? "Analyzing…" : alreadyReviewed ? "Re-run game review" : "Game review"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onNewGame}
              className="min-h-11 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              New game
            </button>
            <button
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


