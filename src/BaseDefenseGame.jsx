import { useState, useEffect, useRef, useCallback } from "react";

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  COLORS,
  UPGRADE_COSTS,
  PLACEMENT_COSTS,
  STARTING_GOLD,
  TURRET_COOLDOWN_MS,
  getRowY,
} from "./game/constants";

import { createInitialState, stepGame } from "./game/loop";

import {
  drawStars,
  drawBase,
  drawDangerOverlay,
  drawRows,
  drawGun,
  drawBullet,
  drawAlien,
  drawExplosion,
  drawHUD,
} from "./game/draw";

import { hitTestSlot } from "./game/hitTest";

import {
  playAlienKilled,
  playBulletHit,
  playTurretPlaced,
  playTurretUpgraded,
  playGameOver,
  startMusic,
  stopMusic,
} from "./game/sounds";

import StartScreen   from "./components/StartScreen";
import GameOverScreen from "./components/GameOverScreen";

// ─── Component ────────────────────────────────────────────────────────────────

export default function BaseDefenseGame() {
  // ── Canvas & animation refs ──────────────────────────────────────────────
  const canvasRef    = useRef(null);
  const animFrameRef = useRef(null);

  // ── Mutable game state (not React state — avoids stale closures in the loop)
  const gameStateRef  = useRef(null);
  const scoreRef      = useRef(0);  // running score total
  const goldRef       = useRef(0);  // running gold total

  // ── Input refs (read each frame by the game loop without triggering re-renders)
  const hoveredRowRef    = useRef(-1); // row the cursor is currently over
  const cooldownEndRef   = useRef(0);  // Date.now() timestamp when placement cooldown expires
  const lastKillSoundRef = useRef(0);  // tick of last kill sound (rate-limits audio)
  const lastHitSoundRef  = useRef(0);  // tick of last bullet-hit sound

  // ── React state (drives overlay UI re-renders only) ──────────────────────
  const [score,       setScore]       = useState(0);
  const [gold,        setGold]        = useState(0);
  const [wave,        setWave]        = useState(1);
  const [gameOver,    setGameOver]    = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore,   setHighScore]   = useState(0);
  const [screenShake, setScreenShake] = useState(0);

  // ── Game init ─────────────────────────────────────────────────────────────

  const initGame = useCallback(() => {
    // Reset refs
    scoreRef.current      = 0;
    goldRef.current       = STARTING_GOLD;
    cooldownEndRef.current = 0;

    // Reset React state for overlays
    setScore(0);
    setGold(STARTING_GOLD);
    setWave(1);
    setGameOver(false);

    // Fresh game state object (see loop.js)
    gameStateRef.current = createInitialState();
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setGameStarted(true);
    startMusic();
  }, [initGame]);

  // ── Main game loop ────────────────────────────────────────────────────────
  //
  // Runs via requestAnimationFrame. On each frame:
  //   1. stepGame() updates gs in place and returns a delta object
  //   2. React setters sync score / gold / wave for the overlay UI
  //   3. Canvas drawing functions render the current frame
  //
  // This effect re-runs only when gameStarted / gameOver change (i.e. at
  // the very start and very end of a run). Everything else happens inside
  // the loop closure via refs.

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const loop = () => {
      const gs = gameStateRef.current;
      if (!gs || !gs.running) return;

      // Advance game logic by one tick
      const { hitBase, scoreGained, goldGained, newWave, baseDmgTaken, killCount, hitCount } = stepGame(gs);

      // Sync React state for any changes this tick
      if (scoreGained > 0) {
        scoreRef.current += scoreGained;
        setScore(scoreRef.current);
      }
      if (goldGained > 0) {
        goldRef.current += goldGained;
        // Floor so the React overlay and game-over screen never show decimals.
        // goldRef keeps the fractional accumulator for smooth passive income.
        const displayGold = Math.floor(goldRef.current);
        if (displayGold !== Math.floor(goldRef.current - goldGained)) {
          setGold(displayGold);
        }
      }
      if (newWave !== null) {
        setWave(newWave);
      }

      // ── Sound effects ─────────────────────────────────────────────────────
      if (killCount > 0 && gs.tick - lastKillSoundRef.current > 6) {
        playAlienKilled();
        lastKillSoundRef.current = gs.tick;
      }
      if (hitCount > 0 && gs.tick - lastHitSoundRef.current > 4) {
        playBulletHit();
        lastHitSoundRef.current = gs.tick;
      }

      // Small shake on each base hit; big shake + game over when HP reaches 0
      if (baseDmgTaken > 0) setScreenShake(4);
      if (hitBase) {
        gs.running = false;
        stopMusic();
        playGameOver();
        setGameOver(true);
        setHighScore((prev) => Math.max(prev, scoreRef.current));
        setScreenShake(10);
        return;
      }

      // ── Render ────────────────────────────────────────────────────────────

      // Clear and fill background
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      drawStars(ctx, gs.tick);

      // Red danger vignette when aliens are close to the base
      const nearestAlienX = gs.aliens.reduce((min, a) => Math.min(min, a.x), CANVAS_WIDTH);
      drawDangerOverlay(ctx, nearestAlienX);

      // Slots / upgrade buttons (drawn behind the base wall)
      const cooldownRemaining = Math.max(0, cooldownEndRef.current - Date.now());
      const displayGold = Math.floor(goldRef.current);
      drawRows(ctx, gs.turrets, gs.tick, cooldownRemaining, hoveredRowRef.current, displayGold);

      drawBase(ctx, gs.tick);
      gs.explosions.forEach((e) => drawExplosion(ctx, e));
      gs.bullets.forEach((b) => drawBullet(ctx, b));
      gs.aliens.forEach((a) => drawAlien(ctx, a, gs.tick));
      gs.turrets.forEach((t) => drawGun(ctx, t.y, t.muzzleFlash, t.level ?? 0));
      drawHUD(ctx, scoreRef.current, gs.wave, gs.turrets.length, displayGold, gs.baseHp);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameStarted, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas interaction ────────────────────────────────────────────────────

  /**
   * Handles clicks in the interactive slot area (x = 4..115).
   *   • Click on a row WITH a turret  → try to upgrade it
   *   • Click on a row WITHOUT a turret → try to place one (if not on cooldown)
   */
  const handleCanvasClick = useCallback((e) => {
    const gs = gameStateRef.current;
    if (!gs || !gs.running) return;

    const rect    = canvasRef.current.getBoundingClientRect();
    const row     = hitTestSlot(e.clientX - rect.left, e.clientY - rect.top);
    if (row === -1) return;

    const existing = gs.turrets.find((t) => t.rowIndex === row);

    if (existing) {
      // Upgrade path: deduct gold and increment level
      if (existing.level >= 5) return;
      const cost = UPGRADE_COSTS[existing.level];
      if (goldRef.current < cost) return;
      goldRef.current -= cost;
      setGold(goldRef.current);
      existing.level++;
      playTurretUpgraded(existing.level);
      return;
    }

    // Placement path: check cooldown and gold cost, then place
    if (cooldownEndRef.current > Date.now()) return;
    const placeCost = PLACEMENT_COSTS[gs.turrets.length];
    if (goldRef.current < placeCost) return;
    goldRef.current -= placeCost;
    setGold(goldRef.current);
    gs.turrets.push({
      rowIndex:   row,
      y:          getRowY(row),
      lastFire:   0,
      muzzleFlash: 0,
      level:      0,
    });
    cooldownEndRef.current = Date.now() + TURRET_COOLDOWN_MS;
    playTurretPlaced();
  }, []);

  /**
   * Tracks which row the cursor is over and updates the cursor style.
   * Uses refs so no re-render is needed — the game loop picks up hoveredRowRef.
   */
  const handleCanvasMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const gs     = gameStateRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const row  = hitTestSlot(e.clientX - rect.left, e.clientY - rect.top);
    hoveredRowRef.current = row;

    // Show pointer cursor when the action under the cursor is available
    const existing   = row !== -1 && gs && gs.turrets.find((t) => t.rowIndex === row);
    const canUpgrade  = existing && existing.level < 5 && goldRef.current >= UPGRADE_COSTS[existing.level];
    const onCooldown  = cooldownEndRef.current > Date.now();
    const nextCost    = PLACEMENT_COSTS[gs ? gs.turrets.length : 0];
    const canPlace    = row !== -1 && !existing && !onCooldown && goldRef.current >= nextCost;

    canvas.style.cursor = (canUpgrade || canPlace) ? "pointer" : "default";
  }, []);

  /** Clears hover state when the cursor leaves the canvas. */
  const handleCanvasMouseLeave = useCallback(() => {
    hoveredRowRef.current = -1;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  }, []);

  // ── Keyboard shortcut: SPACE to start / retry ─────────────────────────────

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === " " && (gameOver || !gameStarted)) {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameOver, gameStarted, startGame]);

  // ── Screen shake decay ────────────────────────────────────────────────────

  useEffect(() => {
    if (screenShake > 0) {
      const t = setTimeout(() => setScreenShake((s) => Math.max(0, s - 1)), 50);
      return () => clearTimeout(t);
    }
  }, [screenShake]);

  // Randomise shake offset each render while shake > 0
  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "100vh",
        background:     "#050810",
        fontFamily:     "'Courier New', monospace",
        userSelect:     "none",
      }}
    >
      {/* CSS animations used by the overlays and title */}
      <style>{`
        @keyframes pulse  { 0%,100%{text-shadow:0 0 8px #00e5ff} 50%{text-shadow:0 0 20px #00e5ff, 0 0 40px #00e5ff} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <h1
        style={{
          color:          COLORS.hud,
          fontSize:       28,
          letterSpacing:  8,
          marginBottom:   8,
          textTransform:  "uppercase",
          animation:      "pulse 3s infinite",
          fontWeight:     800,
        }}
      >
        ⟐ Base Defense ⟐
      </h1>

      {/* Canvas wrapper — position:relative lets overlays use position:absolute */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{
            border:      "2px solid rgba(0,229,255,0.3)",
            borderRadius: 6,
            display:     "block",
            background:  COLORS.bg,
            boxShadow:   "0 0 40px rgba(0,229,255,0.08), inset 0 0 60px rgba(0,0,0,0.5)",
            transform:   `translate(${shakeX}px, ${shakeY}px)`,
          }}
        />

        {!gameStarted && <StartScreen onStart={startGame} />}

        {gameOver && (
          <GameOverScreen
            score={score}
            gold={gold}
            wave={wave}
            highScore={highScore}
            onRetry={startGame}
          />
        )}
      </div>

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 4, letterSpacing: 2 }}>
        ELIMINATE ALL THREATS • PROTECT THE BASE
      </div>
    </div>
  );
}
