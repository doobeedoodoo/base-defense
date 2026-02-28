import { useState, useEffect, useRef, useCallback } from "react";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const GUN_WIDTH = 48;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 4;
const ALIEN_SPEED_BASE = 0.5; // how fast enemies cross the screen
const ALIEN_SIZE = 28;
// Sizes indexed by tier 1-4
const ALIEN_TIER_SIZES = [0, 28, 34, 42, 54];
const BASE_X = 60;
const SPAWN_INTERVAL_BASE = 1100; //how many enemies spaw per second in ms
const FIRE_INTERVAL = 1680;
const NUM_ROWS = 8;
const ROW_HEIGHT = (CANVAS_HEIGHT - 60) / NUM_ROWS;
const getRowY = (i) => 30 + ROW_HEIGHT * (i + 0.5);
const TURRET_COOLDOWN_MS = 3000;
const ELITE_CHANCE_PER_WAVE = 0.05; // ~9% more brutes per wave
const ELITE_CHANCE_CAP = 0.65; // late game cap: ~65% brutes max

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
  eliteBody: "#7f2600",
  eliteArmor: "#ff6d00",
  eliteGlow: "#ff9800",
  tier2Body: "#0d1f2d",
  tier2Armor: "#00b0ff",
  tier2Glow: "#40c4ff",
  tier4Body: "#2a0000",
  tier4Armor: "#b71c1c",
  tier4Glow: "#ff5252",
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
  const animFrameRef = useRef(null);
  const isDraggingRef = useRef(false);
  const hoveredRowRef = useRef(-1);
  const scoreRef = useRef(0);

  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [screenShake, setScreenShake] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownDisplay, setCooldownDisplay] = useState(0);

  const initGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setWave(1);
    setGameOver(false);
    setCooldownEnd(0);
    setCooldownDisplay(0);
    gameStateRef.current = {
      turrets: [],
      bullets: [],
      aliens: [],
      explosions: [],
      lastSpawn: 0,
      tick: 0,
      wave: 1,
      aliensKilledInWave: 0,
      waveThreshold: 8,
      spawnInterval: SPAWN_INTERVAL_BASE,
      alienSpeed: ALIEN_SPEED_BASE,
      running: true,
    };
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setGameStarted(true);
  }, [initGame]);

  // Drawing helpers
  const drawBase = (ctx, tick) => {
    const pulse = Math.sin(tick * 0.03) * 6;
    ctx.save();
    const grad = ctx.createRadialGradient(BASE_X, CANVAS_HEIGHT / 2, 20, BASE_X, CANVAS_HEIGHT / 2, 160 + pulse);
    grad.addColorStop(0, "rgba(0,229,255,0.07)");
    grad.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BASE_X + 160, CANVAS_HEIGHT);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = COLORS.base;
    ctx.shadowBlur = 18 + pulse;
    ctx.strokeStyle = COLORS.base;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BASE_X, 30);
    ctx.lineTo(BASE_X, CANVAS_HEIGHT - 30);
    ctx.stroke();

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

    ctx.fillStyle = COLORS.gunBarrel;
    ctx.shadowColor = COLORS.gunBarrel;
    ctx.shadowBlur = muzzleFlash > 0 ? 20 : 6;
    ctx.fillRect(bodyX + bodyW, y - 4, GUN_WIDTH - bodyW + 8, 8);

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
    const trailGrad = ctx.createLinearGradient(b.x - 18, b.y, b.x, b.y);
    trailGrad.addColorStop(0, "rgba(255,171,0,0)");
    trailGrad.addColorStop(1, "rgba(255,171,0,0.6)");
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - 18, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const alienColors = [COLORS.alien1, COLORS.alien2, COLORS.alien3];

  // Shared HP bar helper — always resets shadow first
  const drawHpBar = (ctx, a, radius) => {
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    const hpFrac = a.hp / a.maxHp;
    const barW = radius * 2.6;
    const barH = a.tier >= 4 ? 7 : 5;
    const barX = -barW / 2;
    const barY = -radius - 13;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = hpFrac > 0.6 ? "#00e676" : hpFrac > 0.3 ? "#ffab00" : "#ff1744";
    ctx.fillRect(barX, barY, barW * hpFrac, barH);
  };

  // Tier 1 — small colourful scout (HP 1)
  const drawTier1Alien = (ctx, a, tick) => {
    const color = alienColors[a.type % 3];
    const wobble = Math.sin(tick * 0.08 + a.id * 2) * 2;
    const r = ALIEN_SIZE / 2;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (a.type === 0) {
      ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath();
    } else if (a.type === 1) {
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-5, -2, 3, 0, Math.PI * 2); ctx.arc(5, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-4, -3, 1.2, 0, Math.PI * 2); ctx.arc(6, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Tier 2 — armoured scout, electric blue octagon (HP 2-3)
  const drawTier2Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[2] / 2;
    const wobble = Math.sin(tick * 0.07 + a.id * 2) * 2;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);

    // Octagonal body
    ctx.fillStyle = COLORS.tier2Body;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 8;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.fill();

    // Bright outer stroke (replaces shadowBlur)
    ctx.strokeStyle = COLORS.tier2Armor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 8;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner ring
    ctx.strokeStyle = COLORS.tier2Glow;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const r2 = s * 0.87;
      i === 0 ? ctx.moveTo(Math.cos(ang) * r2, Math.sin(ang) * r2)
              : ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Inner faint diamond
    ctx.fillStyle = COLORS.tier2Armor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.5, 0);
    ctx.lineTo(0, s * 0.5); ctx.lineTo(-s * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bright cyan eyes (no shadow)
    ctx.fillStyle = COLORS.tier2Glow;
    ctx.beginPath();
    ctx.arc(-s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
    ctx.arc( s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
    ctx.fill();

    drawHpBar(ctx, a, s);
    ctx.restore();
  };

  // Tier 3 — elite brute, orange hexagon (HP 4-6)
  const drawTier3Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[3] / 2;
    const wobble = Math.sin(tick * 0.04 + a.id * 2) * 1.5;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);

    // Rotating spike ring — all 8 spikes in one batched path
    ctx.save();
    ctx.rotate(tick * 0.018);
    ctx.strokeStyle = "rgba(255,152,0,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.moveTo(Math.cos(ang) * (s + 1), Math.sin(ang) * (s + 1));
      ctx.lineTo(Math.cos(ang) * (s + 9), Math.sin(ang) * (s + 9));
    }
    ctx.stroke();
    ctx.restore();

    // Hexagonal outer body (no shadowBlur)
    ctx.fillStyle = COLORS.eliteBody;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.fill();

    // Bright outer stroke (replaces shadowBlur)
    ctx.strokeStyle = COLORS.eliteGlow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner bright armour hex
    ctx.fillStyle = COLORS.eliteArmor;
    ctx.strokeStyle = "#ffab40";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s * 0.7, Math.sin(ang) * s * 0.7)
              : ctx.lineTo(Math.cos(ang) * s * 0.7, Math.sin(ang) * s * 0.7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Armour dividing lines
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0);
    ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, s * 0.55);
    ctx.stroke();

    // Angular red eyes (no shadow)
    ctx.fillStyle = "#ff1744";
    ctx.save(); ctx.translate(-s * 0.28, -s * 0.18); ctx.rotate(-0.45);
    ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
    ctx.save(); ctx.translate( s * 0.28, -s * 0.18); ctx.rotate( 0.45);
    ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();

    drawHpBar(ctx, a, s);
    ctx.restore();
  };

  // Tier 4 — dreadnought, crimson 8-point star (HP 7+)
  const drawTier4Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[4] / 2;
    const wobble = Math.sin(tick * 0.03 + a.id * 2) * 1;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);

    // Pulsing aura — simple arc fill (no createRadialGradient per frame)
    const pulse = Math.sin(tick * 0.06) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.12;
    ctx.fillStyle = "#b71c1c";
    ctx.beginPath();
    ctx.arc(0, 0, s + 14 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Outer counter-rotating spikes — all 6 batched into one path
    ctx.save();
    ctx.rotate(-tick * 0.011);
    ctx.strokeStyle = "rgba(255,82,82,0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      ctx.moveTo(Math.cos(ang) * (s + 1), Math.sin(ang) * (s + 1));
      ctx.lineTo(Math.cos(ang) * (s + 11), Math.sin(ang) * (s + 11));
    }
    ctx.stroke();
    ctx.restore();

    // Inner co-rotating spikes — all 9 batched into one path
    ctx.save();
    ctx.rotate(tick * 0.019);
    ctx.strokeStyle = "rgba(255,160,0,0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      ctx.moveTo(Math.cos(ang) * (s - 3), Math.sin(ang) * (s - 3));
      ctx.lineTo(Math.cos(ang) * (s + 5), Math.sin(ang) * (s + 5));
    }
    ctx.stroke();
    ctx.restore();

    // 8-point star body (no shadowBlur)
    ctx.fillStyle = COLORS.tier4Body;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? s : s * 0.58;
      i === 0 ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
              : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();

    // Bright outer stroke (replaces shadowBlur)
    ctx.strokeStyle = COLORS.tier4Glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? s : s * 0.58;
      i === 0 ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
              : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.stroke();

    // Crimson core
    ctx.fillStyle = COLORS.tier4Armor;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Hot centre
    ctx.fillStyle = "#ff8a65";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Large menacing slash eyes (no shadow)
    ctx.fillStyle = "#ff8a65";
    ctx.save(); ctx.translate(-s * 0.3, -s * 0.18); ctx.rotate(-0.5);
    ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();
    ctx.save(); ctx.translate( s * 0.3, -s * 0.18); ctx.rotate( 0.5);
    ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();

    // Snarling jagged mouth (no shadow)
    ctx.strokeStyle = "rgba(255,138,101,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, s * 0.28);
    for (let i = 0; i <= 5; i++) {
      const mx = -s * 0.38 + (i * s * 0.76) / 5;
      ctx.lineTo(mx, s * 0.28 + (i % 2 === 0 ? 5 : -3));
    }
    ctx.stroke();

    drawHpBar(ctx, a, s);
    ctx.restore();
  };

  const drawAlien = (ctx, a, tick) => {
    if (a.tier === 4) drawTier4Alien(ctx, a, tick);
    else if (a.tier === 3) drawTier3Alien(ctx, a, tick);
    else if (a.tier === 2) drawTier2Alien(ctx, a, tick);
    else drawTier1Alien(ctx, a, tick);
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

  const drawRows = (ctx, turrets, dragging, hoveredRow) => {
    for (let i = 0; i < NUM_ROWS; i++) {
      const y = getRowY(i);
      const isHovered = dragging && hoveredRow === i;
      const hasTurret = turrets.some((t) => t.rowIndex === i);

      ctx.save();

      // Row lane line (dashed, runs across the whole field)
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = isHovered
        ? "rgba(0,229,255,0.55)"
        : hasTurret
        ? "rgba(0,229,255,0.13)"
        : "rgba(0,229,255,0.06)";
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(BASE_X + 55, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Turret slot box near the base
      const slotX = BASE_X + 5;
      const slotY = y - 18;
      const slotW = 50;
      const slotH = 36;
      if (isHovered) {
        ctx.fillStyle = "rgba(0,229,255,0.12)";
        ctx.beginPath();
        ctx.roundRect(slotX, slotY, slotW, slotH, 4);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,229,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(slotX, slotY, slotW, slotH, 4);
        ctx.stroke();
      } else if (!hasTurret) {
        ctx.strokeStyle = "rgba(0,229,255,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.roundRect(slotX, slotY, slotW, slotH, 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  };

  const drawHUD = (ctx, score, wave, turretCount) => {
    ctx.save();
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${score}`, 14, 24);
    ctx.fillText(`WAVE: ${wave}`, 14, 46);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(0,229,255,0.5)";
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText(`TURRETS: ${turretCount}`, CANVAS_WIDTH - 14, 24);
    ctx.restore();
  };

  // Main game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const loop = () => {
      const gs = gameStateRef.current;
      if (!gs || !gs.running) return;
      gs.tick++;

      // Per-turret auto-fire
      gs.turrets.forEach((turret) => {
        if (gs.tick - turret.lastFire > FIRE_INTERVAL / 16) {
          gs.bullets.push({
            x: BASE_X + GUN_WIDTH + 18,
            y: turret.y,
            id: gs.tick + turret.rowIndex * 0.001,
          });
          turret.lastFire = gs.tick;
          turret.muzzleFlash = 1;
        }
        if (turret.muzzleFlash > 0) {
          turret.muzzleFlash = Math.max(0, turret.muzzleFlash - 0.12);
        }
      });

      // Move bullets
      gs.bullets = gs.bullets.filter((b) => {
        b.x += BULLET_SPEED;
        return b.x < CANVAS_WIDTH + 10;
      });

      // Spawn aliens on a random row
      if (gs.tick - gs.lastSpawn > gs.spawnInterval / 16) {
        const rowIndex = Math.floor(Math.random() * NUM_ROWS);
        const y = getRowY(rowIndex);
        // Chance of rolling a high-tier alien grows each wave (no effective ceiling)
        const eliteChance = Math.min(ELITE_CHANCE_CAP, Math.max(0, (gs.wave - 1) * ELITE_CHANCE_PER_WAVE));
        const isEliteRoll = Math.random() < eliteChance;
        // HP increases aggressively — drives the visual tier
        const maxHp = isEliteRoll ? Math.min(12, 2 + Math.floor(gs.wave * 0.9)) : 1;
        const tier = maxHp <= 1 ? 1 : maxHp <= 3 ? 2 : maxHp <= 6 ? 3 : 4;
        const size = ALIEN_TIER_SIZES[tier];
        // Tankier tiers move slower
        const speedMults = [1, 1, 0.85, 0.72, 0.6];
        const baseSpeed = gs.alienSpeed + Math.random() * 0.5;
        const speed = baseSpeed * speedMults[tier];
        gs.aliens.push({
          x: CANVAS_WIDTH + size,
          y,
          rowIndex,
          type: Math.floor(Math.random() * 3),
          speed,
          id: gs.tick + Math.random(),
          hp: maxHp,
          maxHp,
          tier,
          size,
        });
        gs.lastSpawn = gs.tick;
      }

      // Move aliens
      let hitBase = false;
      gs.aliens = gs.aliens.filter((a) => {
        a.x -= a.speed;
        if (a.x - a.size / 2 <= BASE_X) {
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
          if (Math.sqrt(dx * dx + dy * dy) < a.size / 2 + BULLET_RADIUS) {
            gs.bullets.splice(i, 1);
            a.hp--;
            // Per-tier glow colour for sparks / explosions
            const tierFx = [
              null,
              { glow: alienColors[a.type % 3], deathCount: 8,  spread: 2,   maxPx: 3 },
              { glow: COLORS.tier2Glow,         deathCount: 12, spread: 2.5, maxPx: 4 },
              { glow: COLORS.eliteGlow,          deathCount: 18, spread: 3,   maxPx: 5 },
              { glow: COLORS.tier4Glow,          deathCount: 26, spread: 4,   maxPx: 7 },
            ][a.tier];
            if (a.hp > 0) {
              // Hit spark — small burst, enemy survives
              newExplosions.push({
                x: b.x, y: b.y, life: 0.5, maxLife: 0.5,
                particles: Array.from({ length: 5 }, () => ({
                  vx: (Math.random() - 0.5) * 2.5,
                  vy: (Math.random() - 0.5) * 2.5,
                  size: Math.random() * 2 + 0.5,
                  color: tierFx.glow,
                })),
              });
              break; // one bullet per tick per alien
            }
            // Enemy dies — bigger boom for higher tiers
            newExplosions.push({
              x: a.x, y: a.y, life: 1, maxLife: 1,
              particles: Array.from({ length: tierFx.deathCount }, () => ({
                vx: (Math.random() - 0.5) * tierFx.spread,
                vy: (Math.random() - 0.5) * tierFx.spread,
                size: Math.random() * tierFx.maxPx + 1,
                color: tierFx.glow,
              })),
            });
            scoreRef.current += a.maxHp * 10;
            setScore(scoreRef.current);
            gs.aliensKilledInWave++;
            if (gs.aliensKilledInWave >= gs.waveThreshold) {
              gs.wave++;
              gs.aliensKilledInWave = 0;
              gs.waveThreshold = Math.floor(gs.waveThreshold * 1.2);
              gs.spawnInterval = Math.max(150, gs.spawnInterval - 250);
              gs.alienSpeed = gs.alienSpeed + 0.2; // uncapped — infinite escalation
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
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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

      drawRows(ctx, gs.turrets, isDraggingRef.current, hoveredRowRef.current);
      drawBase(ctx, gs.tick);
      gs.explosions.forEach((e) => drawExplosion(ctx, e));
      gs.bullets.forEach((b) => drawBullet(ctx, b));
      gs.aliens.forEach((a) => drawAlien(ctx, a, gs.tick));
      gs.turrets.forEach((turret) => drawGun(ctx, turret.y, turret.muzzleFlash));
      drawHUD(ctx, scoreRef.current, gs.wave, gs.turrets.length);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameStarted, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: only SPACE to start/restart
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === " " && (gameOver || !gameStarted)) {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [gameOver, gameStarted, startGame]);

  // Drag handling
  const handleButtonMouseDown = useCallback(
    (e) => {
      if (cooldownDisplay > 0) return;
      e.preventDefault();
      setIsDragging(true);
      isDraggingRef.current = true;
      setDragPos({ x: e.clientX, y: e.clientY });
    },
    [cooldownDisplay]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const canvasY = e.clientY - rect.top;
      const canvasX = e.clientX - rect.left;
      if (canvasX >= 0 && canvasX <= CANVAS_WIDTH && canvasY >= 0 && canvasY <= CANVAS_HEIGHT) {
        let closestRow = 0;
        let closestDist = Infinity;
        for (let i = 0; i < NUM_ROWS; i++) {
          const dist = Math.abs(canvasY - getRowY(i));
          if (dist < closestDist) {
            closestDist = dist;
            closestRow = i;
          }
        }
        hoveredRowRef.current = closestRow;
      } else {
        hoveredRowRef.current = -1;
      }
    };

    const handleMouseUp = (e) => {
      setIsDragging(false);
      isDraggingRef.current = false;

      const canvas = canvasRef.current;
      if (!canvas) {
        hoveredRowRef.current = -1;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      if (canvasX >= 0 && canvasX <= CANVAS_WIDTH && canvasY >= 30 && canvasY <= CANVAS_HEIGHT - 30) {
        let closestRow = 0;
        let closestDist = Infinity;
        for (let i = 0; i < NUM_ROWS; i++) {
          const dist = Math.abs(canvasY - getRowY(i));
          if (dist < closestDist) {
            closestDist = dist;
            closestRow = i;
          }
        }

        const gs = gameStateRef.current;
        if (gs && gs.running) {
          gs.turrets.push({
            rowIndex: closestRow,
            y: getRowY(closestRow),
            lastFire: 0,
            muzzleFlash: 0,
          });
          const end = Date.now() + TURRET_COOLDOWN_MS;
          setCooldownEnd(end);
          setCooldownDisplay(TURRET_COOLDOWN_MS);
        }
      }

      hoveredRowRef.current = -1;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownEnd <= 0) return;
    const interval = setInterval(() => {
      const remaining = cooldownEnd - Date.now();
      if (remaining <= 0) {
        setCooldownDisplay(0);
        clearInterval(interval);
      } else {
        setCooldownDisplay(remaining);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  // Screen shake decay
  useEffect(() => {
    if (screenShake > 0) {
      const t = setTimeout(() => setScreenShake((s) => Math.max(0, s - 1)), 50);
      return () => clearTimeout(t);
    }
  }, [screenShake]);

  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;

  const isOnCooldown = cooldownDisplay > 0;
  const cooldownFraction = isOnCooldown ? cooldownDisplay / TURRET_COOLDOWN_MS : 0;
  const circleR = 34;
  const circleCircumference = 2 * Math.PI * circleR;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#050810",
        fontFamily: "'Courier New', monospace",
        userSelect: "none",
      }}
    >
      <style>{`
        @keyframes flicker { 0%,100%{opacity:1} 50%{opacity:0.85} }
        @keyframes pulse { 0%,100%{text-shadow:0 0 8px #00e5ff} 50%{text-shadow:0 0 20px #00e5ff, 0 0 40px #00e5ff} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes deployPulse { 0%,100%{box-shadow:0 0 12px rgba(0,229,255,0.25)} 50%{box-shadow:0 0 24px rgba(0,229,255,0.5)} }
      `}</style>

      <h1
        style={{
          color: COLORS.hud,
          fontSize: 28,
          letterSpacing: 8,
          marginBottom: 8,
          textTransform: "uppercase",
          animation: "pulse 3s infinite",
          fontWeight: 800,
        }}
      >
        ⟐ Base Defense ⟐
      </h1>

      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            border: `2px solid rgba(0,229,255,0.3)`,
            borderRadius: 6,
            display: "block",
            background: COLORS.bg,
            boxShadow: "0 0 40px rgba(0,229,255,0.08), inset 0 0 60px rgba(0,0,0,0.5)",
            transform: `translate(${shakeX}px, ${shakeY}px)`,
            cursor: isDragging ? "none" : "default",
          }}
        />

        {/* Start screen */}
        {!gameStarted && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(5,8,16,0.88)",
              borderRadius: 6,
              animation: "fadeIn 0.5s ease",
            }}
          >
            <div style={{ color: COLORS.hud, fontSize: 42, fontWeight: 900, letterSpacing: 6, marginBottom: 16 }}>
              BASE DEFENSE
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8 }}>
              Defend your base from alien invaders
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
              Drag turrets onto rows to defend each lane
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent",
                border: `2px solid ${COLORS.hud}`,
                color: COLORS.hud,
                padding: "14px 48px",
                fontSize: 18,
                fontFamily: "'Courier New', monospace",
                cursor: "pointer",
                letterSpacing: 4,
                fontWeight: 700,
                borderRadius: 4,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(0,229,255,0.15)";
                e.target.style.boxShadow = "0 0 20px rgba(0,229,255,0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.boxShadow = "none";
              }}
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
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(5,8,16,0.9)",
              borderRadius: 6,
              animation: "fadeIn 0.4s ease",
            }}
          >
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
                background: "transparent",
                border: `2px solid ${COLORS.danger}`,
                color: COLORS.danger,
                padding: "14px 48px",
                fontSize: 18,
                fontFamily: "'Courier New', monospace",
                cursor: "pointer",
                letterSpacing: 4,
                fontWeight: 700,
                borderRadius: 4,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,23,68,0.15)";
                e.target.style.boxShadow = "0 0 20px rgba(255,23,68,0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.boxShadow = "none";
              }}
            >
              RETRY
            </button>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 12 }}>
              or press SPACE
            </div>
          </div>
        )}
      </div>

      {/* Deploy turret button */}
      {gameStarted && !gameOver && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div style={{ color: "rgba(0,229,255,0.35)", fontSize: 10, letterSpacing: 2 }}>
            DRAG TO PLACE TURRET
          </div>
          <div
            onMouseDown={handleButtonMouseDown}
            style={{
              position: "relative",
              width: 80,
              height: 80,
              cursor: isOnCooldown ? "not-allowed" : "grab",
              animation: !isOnCooldown ? "deployPulse 2s infinite" : "none",
            }}
          >
            {/* SVG circular progress ring */}
            <svg
              width="80"
              height="80"
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            >
              {/* Background ring */}
              <circle
                cx="40"
                cy="40"
                r={circleR}
                fill="rgba(10,14,23,0.95)"
                stroke={isOnCooldown ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.35)"}
                strokeWidth="2.5"
              />
              {/* Cooldown progress ring (drains as cooldown passes) */}
              {isOnCooldown && (
                <circle
                  cx="40"
                  cy="40"
                  r={circleR}
                  fill="none"
                  stroke={COLORS.hud}
                  strokeWidth="3"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={circleCircumference * (1 - cooldownFraction)}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                  style={{ transition: "stroke-dashoffset 0.05s linear" }}
                />
              )}
            </svg>

            {/* Inner content */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                pointerEvents: "none",
              }}
            >
              {isOnCooldown ? (
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "rgba(0,229,255,0.6)",
                    fontFamily: "'Courier New', monospace",
                    lineHeight: 1,
                  }}
                >
                  {(cooldownDisplay / 1000).toFixed(1)}
                  <span style={{ fontSize: 10 }}>s</span>
                </div>
              ) : (
                <>
                  {/* Turret icon: body + barrel */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        width: 14,
                        height: 18,
                        background: "#263238",
                        border: "1.5px solid rgba(0,229,255,0.85)",
                        borderRadius: 2,
                      }}
                    />
                    <div
                      style={{
                        width: 12,
                        height: 6,
                        background: "#ff6f00",
                        borderRadius: "0 2px 2px 0",
                        boxShadow: "0 0 6px rgba(255,111,0,0.5)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      color: COLORS.hud,
                      fontFamily: "'Courier New', monospace",
                      letterSpacing: 1.5,
                    }}
                  >
                    DEPLOY
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ghost turret following cursor during drag */}
      {isDragging && (
        <div
          style={{
            position: "fixed",
            left: dragPos.x - 18,
            top: dragPos.y - 12,
            pointerEvents: "none",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            background: "rgba(10,14,23,0.92)",
            border: `1.5px solid ${COLORS.hud}`,
            borderRadius: 3,
            padding: "3px 5px",
            filter: "drop-shadow(0 0 8px rgba(0,229,255,0.6))",
          }}
        >
          <div
            style={{
              width: 11,
              height: 15,
              background: "#263238",
              border: "1px solid rgba(0,229,255,0.8)",
              borderRadius: 2,
            }}
          />
          <div
            style={{
              width: 9,
              height: 5,
              background: "#ff6f00",
              borderRadius: "0 1px 1px 0",
            }}
          />
        </div>
      )}

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 10, letterSpacing: 2 }}>
        ELIMINATE ALL THREATS • PROTECT THE BASE
      </div>
    </div>
  );
}
