import { useState, useEffect, useRef, useCallback } from "react";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const GUN_WIDTH = 48;
const GUN_HEIGHT = 20;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 4;
const ALIEN_SPEED_BASE = 1.2;
const ALIEN_SIZE = 28;
const BASE_X = 60;
const GUN_MOVE_SPEED = 6;
const SPAWN_INTERVAL_BASE = 1200;
const FIRE_INTERVAL = 280;

const COLORS = {
  bg: "#0a0e17",
  stars: "#ffffff",
  base: "#00e5ff",
  baseGlow: "rgba(0,229,255,0.15)",
  gun: "#e0e0e0",
  gunBarrel: "#ff6f00",
  bullet: "#ffab00",
  bulletGlow: "rgba(255,171,0,0.4)",
  alien1: "#76ff03",
  alien2: "#ff1744",
  alien3: "#d500f9",
  explosion: "#ffab00",
  hud: "#00e5ff",
  danger: "#ff1744",
  gridLine: "rgba(0,229,255,0.04)",
};

function generateStars(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
  }));
}

const STARS = generateStars(120);

export default function BaseDefenseGame() {
  const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const keysRef = useRef({ up: false, down: false });
  const animFrameRef = useRef(null);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [screenShake, setScreenShake] = useState(0);
  const scoreRef = useRef(0);

  const initGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setWave(1);
    setGameOver(false);
    gameStateRef.current = {
      gunY: CANVAS_HEIGHT / 2,
      bullets: [],
      aliens: [],
      explosions: [],
      lastFire: 0,
      lastSpawn: 0,
      tick: 0,
      wave: 1,
      aliensKilledInWave: 0,
      waveThreshold: 8,
      spawnInterval: SPAWN_INTERVAL_BASE,
      alienSpeed: ALIEN_SPEED_BASE,
      running: true,
      muzzleFlash: 0,
    };
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setGameStarted(true);
  }, [initGame]);

  // Drawing helpers
  const drawBase = (ctx, tick) => {
    const pulse = Math.sin(tick * 0.03) * 6;
    // Shield glow
    ctx.save();
    const grad = ctx.createRadialGradient(BASE_X, CANVAS_HEIGHT / 2, 20, BASE_X, CANVAS_HEIGHT / 2, 160 + pulse);
    grad.addColorStop(0, "rgba(0,229,255,0.07)");
    grad.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BASE_X + 160, CANVAS_HEIGHT);
    ctx.restore();

    // Base wall
    ctx.save();
    ctx.shadowColor = COLORS.base;
    ctx.shadowBlur = 18 + pulse;
    ctx.strokeStyle = COLORS.base;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BASE_X, 30);
    ctx.lineTo(BASE_X, CANVAS_HEIGHT - 30);
    ctx.stroke();

    // Base markers
    for (let i = 50; i < CANVAS_HEIGHT - 30; i += 40) {
      ctx.fillStyle = COLORS.base;
      ctx.globalAlpha = 0.5 + Math.sin(tick * 0.05 + i * 0.1) * 0.3;
      ctx.fillRect(BASE_X - 6, i, 4, 12);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const drawGun = (ctx, y, muzzleFlash) => {
    ctx.save();
    // Gun body
    ctx.fillStyle = "#263238";
    ctx.strokeStyle = COLORS.gun;
    ctx.lineWidth = 1.5;
    const bodyX = BASE_X + 10;
    const bodyW = 30;
    const bodyH = 32;
    ctx.beginPath();
    ctx.roundRect(bodyX, y - bodyH / 2, bodyW, bodyH, 4);
    ctx.fill();
    ctx.stroke();

    // Barrel
    ctx.fillStyle = COLORS.gunBarrel;
    ctx.shadowColor = COLORS.gunBarrel;
    ctx.shadowBlur = muzzleFlash > 0 ? 20 : 6;
    ctx.fillRect(bodyX + bodyW, y - 4, GUN_WIDTH - bodyW + 8, 8);

    // Muzzle flash
    if (muzzleFlash > 0) {
      const flashSize = muzzleFlash * 14;
      const flashGrad = ctx.createRadialGradient(bodyX + GUN_WIDTH + 10, y, 0, bodyX + GUN_WIDTH + 10, y, flashSize);
      flashGrad.addColorStop(0, "rgba(255,255,200,0.9)");
      flashGrad.addColorStop(0.4, "rgba(255,171,0,0.5)");
      flashGrad.addColorStop(1, "rgba(255,171,0,0)");
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(bodyX + GUN_WIDTH + 10, y, flashSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Indicator light
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#00e5ff";
    ctx.beginPath();
    ctx.arc(bodyX + 8, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawBullet = (ctx, b) => {
    ctx.save();
    ctx.shadowColor = COLORS.bullet;
    ctx.shadowBlur = 10;
    // Trail
    const trailGrad = ctx.createLinearGradient(b.x - 18, b.y, b.x, b.y);
    trailGrad.addColorStop(0, "rgba(255,171,0,0)");
    trailGrad.addColorStop(1, "rgba(255,171,0,0.6)");
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - 18, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // Bullet head
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const alienColors = [COLORS.alien1, COLORS.alien2, COLORS.alien3];

  const drawAlien = (ctx, a, tick) => {
    const color = alienColors[a.type % 3];
    const wobble = Math.sin(tick * 0.08 + a.id * 2) * 3;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    if (a.type === 0) {
      // Triangle alien
      ctx.moveTo(0, -ALIEN_SIZE / 2);
      ctx.lineTo(ALIEN_SIZE / 2, ALIEN_SIZE / 2);
      ctx.lineTo(-ALIEN_SIZE / 2, ALIEN_SIZE / 2);
      ctx.closePath();
    } else if (a.type === 1) {
      // Diamond alien
      ctx.moveTo(0, -ALIEN_SIZE / 2);
      ctx.lineTo(ALIEN_SIZE / 2, 0);
      ctx.lineTo(0, ALIEN_SIZE / 2);
      ctx.lineTo(-ALIEN_SIZE / 2, 0);
      ctx.closePath();
    } else {
      // Circle alien
      ctx.arc(0, 0, ALIEN_SIZE / 2, 0, Math.PI * 2);
    }
    ctx.fill();

    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-5, -2, 3, 0, Math.PI * 2);
    ctx.arc(5, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-4, -3, 1.2, 0, Math.PI * 2);
    ctx.arc(6, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawExplosion = (ctx, e) => {
    const progress = e.life / e.maxLife;
    const size = (1 - progress) * 30;
    ctx.save();
    ctx.globalAlpha = progress;
    for (let i = 0; i < e.particles.length; i++) {
      const p = e.particles[i];
      const px = e.x + p.vx * (1 - progress) * 30;
      const py = e.y + p.vy * (1 - progress) * 30;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, size * p.size * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawGrid = (ctx) => {
    ctx.save();
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawHUD = (ctx, score, wave) => {
    ctx.save();
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${score}`, 14, 24);
    ctx.fillText(`WAVE: ${wave}`, 14, 46);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(0,229,255,0.5)";
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText("↑↓ MOVE", CANVAS_WIDTH - 14, 24);
    ctx.restore();
  };

  // Main game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const loop = (timestamp) => {
      const gs = gameStateRef.current;
      if (!gs || !gs.running) return;
      gs.tick++;

      // Move gun
      if (keysRef.current.up) gs.gunY = Math.max(30, gs.gunY - GUN_MOVE_SPEED);
      if (keysRef.current.down) gs.gunY = Math.min(CANVAS_HEIGHT - 30, gs.gunY + GUN_MOVE_SPEED);

      // Auto-fire
      if (gs.tick - gs.lastFire > FIRE_INTERVAL / 16) {
        gs.bullets.push({ x: BASE_X + GUN_WIDTH + 18, y: gs.gunY, id: gs.tick });
        gs.lastFire = gs.tick;
        gs.muzzleFlash = 1;
      }

      // Muzzle flash decay
      if (gs.muzzleFlash > 0) gs.muzzleFlash -= 0.12;
      if (gs.muzzleFlash < 0) gs.muzzleFlash = 0;

      // Move bullets
      gs.bullets = gs.bullets.filter((b) => {
        b.x += BULLET_SPEED;
        return b.x < CANVAS_WIDTH + 10;
      });

      // Spawn aliens
      if (gs.tick - gs.lastSpawn > gs.spawnInterval / 16) {
        const type = Math.floor(Math.random() * 3);
        const y = Math.random() * (CANVAS_HEIGHT - 80) + 40;
        const speed = gs.alienSpeed + Math.random() * 0.6;
        gs.aliens.push({ x: CANVAS_WIDTH + ALIEN_SIZE, y, type, speed, id: gs.tick + Math.random(), hp: 1 });
        gs.lastSpawn = gs.tick;
      }

      // Move aliens
      let hitBase = false;
      gs.aliens = gs.aliens.filter((a) => {
        a.x -= a.speed;
        if (a.x - ALIEN_SIZE / 2 <= BASE_X) {
          hitBase = true;
          return false;
        }
        return true;
      });

      // Collision detection
      const newExplosions = [];
      gs.aliens = gs.aliens.filter((a) => {
        for (let i = gs.bullets.length - 1; i >= 0; i--) {
          const b = gs.bullets[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (Math.sqrt(dx * dx + dy * dy) < ALIEN_SIZE / 2 + BULLET_RADIUS) {
            gs.bullets.splice(i, 1);
            const particles = Array.from({ length: 8 }, () => ({
              vx: (Math.random() - 0.5) * 2,
              vy: (Math.random() - 0.5) * 2,
              size: Math.random() * 3 + 1,
              color: alienColors[a.type % 3],
            }));
            newExplosions.push({ x: a.x, y: a.y, life: 1, maxLife: 1, particles });
            scoreRef.current += 10;
            setScore(scoreRef.current);
            gs.aliensKilledInWave++;
            if (gs.aliensKilledInWave >= gs.waveThreshold) {
              gs.wave++;
              gs.aliensKilledInWave = 0;
              gs.waveThreshold = Math.floor(gs.waveThreshold * 1.4);
              gs.spawnInterval = Math.max(300, gs.spawnInterval - 80);
              gs.alienSpeed = Math.min(4.5, gs.alienSpeed + 0.2);
              setWave(gs.wave);
            }
            return false;
          }
        }
        return true;
      });

      gs.explosions.push(...newExplosions);
      gs.explosions = gs.explosions.filter((e) => {
        e.life -= 0.035;
        return e.life > 0;
      });

      if (hitBase) {
        gs.running = false;
        setGameOver(true);
        setHighScore((prev) => Math.max(prev, scoreRef.current));
        setScreenShake(10);
        return;
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Background
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      drawGrid(ctx);

      // Stars
      STARS.forEach((s) => {
        ctx.save();
        ctx.globalAlpha = s.alpha + Math.sin(gs.tick * s.twinkleSpeed) * 0.2;
        ctx.fillStyle = COLORS.stars;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Danger zone
      const nearestAlien = gs.aliens.reduce((min, a) => Math.min(min, a.x), CANVAS_WIDTH);
      if (nearestAlien < 200) {
        ctx.save();
        ctx.globalAlpha = (1 - nearestAlien / 200) * 0.15;
        ctx.fillStyle = COLORS.danger;
        ctx.fillRect(0, 0, BASE_X, CANVAS_HEIGHT);
        ctx.restore();
      }

      drawBase(ctx, gs.tick);
      gs.explosions.forEach((e) => drawExplosion(ctx, e));
      gs.bullets.forEach((b) => drawBullet(ctx, b));
      gs.aliens.forEach((a) => drawAlien(ctx, a, gs.tick));
      drawGun(ctx, gs.gunY, gs.muzzleFlash);
      drawHUD(ctx, scoreRef.current, gs.wave);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameStarted, gameOver]);

  // Keyboard controls
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); keysRef.current.up = true; }
      if (e.key === "ArrowDown") { e.preventDefault(); keysRef.current.down = true; }
      if (e.key === " " && (gameOver || !gameStarted)) { e.preventDefault(); startGame(); }
    };
    const onUp = (e) => {
      if (e.key === "ArrowUp") keysRef.current.up = false;
      if (e.key === "ArrowDown") keysRef.current.down = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [gameOver, gameStarted, startGame]);

  // Screen shake decay
  useEffect(() => {
    if (screenShake > 0) {
      const t = setTimeout(() => setScreenShake((s) => Math.max(0, s - 1)), 50);
      return () => clearTimeout(t);
    }
  }, [screenShake]);

  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "#050810", fontFamily: "'Courier New', monospace",
      userSelect: "none",
    }}>
      <style>{`
        @keyframes flicker { 0%,100%{opacity:1} 50%{opacity:0.85} }
        @keyframes pulse { 0%,100%{text-shadow:0 0 8px #00e5ff} 50%{text-shadow:0 0 20px #00e5ff, 0 0 40px #00e5ff} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <h1 style={{
        color: COLORS.hud, fontSize: 28, letterSpacing: 8, marginBottom: 8,
        textTransform: "uppercase", animation: "pulse 3s infinite",
        fontWeight: 800,
      }}>
        ⟐ Base Defense ⟐
      </h1>

      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            border: `2px solid rgba(0,229,255,0.3)`, borderRadius: 6,
            display: "block", background: COLORS.bg,
            boxShadow: "0 0 40px rgba(0,229,255,0.08), inset 0 0 60px rgba(0,0,0,0.5)",
            transform: `translate(${shakeX}px, ${shakeY}px)`,
          }}
        />

        {/* Start screen */}
        {!gameStarted && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(5,8,16,0.88)", borderRadius: 6, animation: "fadeIn 0.5s ease",
          }}>
            <div style={{ color: COLORS.hud, fontSize: 42, fontWeight: 900, letterSpacing: 6, marginBottom: 16 }}>
              BASE DEFENSE
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8 }}>
              Defend your base from alien invaders
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
              ↑↓ Arrow Keys to move &nbsp;|&nbsp; Auto-fire enabled
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent", border: `2px solid ${COLORS.hud}`, color: COLORS.hud,
                padding: "14px 48px", fontSize: 18, fontFamily: "'Courier New', monospace",
                cursor: "pointer", letterSpacing: 4, fontWeight: 700, borderRadius: 4,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(0,229,255,0.15)"; e.target.style.boxShadow = "0 0 20px rgba(0,229,255,0.3)"; }}
              onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
            >
              START MISSION
            </button>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 16 }}>
              or press SPACE
            </div>
          </div>
        )}

        {/* Game over */}
        {gameOver && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(5,8,16,0.9)", borderRadius: 6, animation: "fadeIn 0.4s ease",
          }}>
            <div style={{ color: COLORS.danger, fontSize: 40, fontWeight: 900, letterSpacing: 6, marginBottom: 12 }}>
              BASE DESTROYED
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, marginBottom: 6 }}>
              Score: <span style={{ color: COLORS.hud, fontWeight: 700 }}>{score}</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 6 }}>
              Wave Reached: {wave}
            </div>
            <div style={{ color: "rgba(255,171,0,0.7)", fontSize: 14, marginBottom: 28 }}>
              High Score: {highScore}
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent", border: `2px solid ${COLORS.danger}`, color: COLORS.danger,
                padding: "14px 48px", fontSize: 18, fontFamily: "'Courier New', monospace",
                cursor: "pointer", letterSpacing: 4, fontWeight: 700, borderRadius: 4,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(255,23,68,0.15)"; e.target.style.boxShadow = "0 0 20px rgba(255,23,68,0.3)"; }}
              onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
            >
              RETRY
            </button>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 12 }}>
              or press SPACE
            </div>
          </div>
        )}
      </div>

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 14, letterSpacing: 2 }}>
        ELIMINATE ALL THREATS • PROTECT THE BASE
      </div>
    </div>
  );
}
