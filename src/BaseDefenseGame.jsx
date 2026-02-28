import { useState, useEffect, useRef, useCallback } from "react";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const GUN_WIDTH = 48;
const BULLET_SPEED = 8;
const BULLET_RADIUS = 4;
const ALIEN_SPEED_BASE = 0.5;
const ALIEN_SIZE = 28;
const ALIEN_TIER_SIZES = [0, 28, 34, 42, 54];
const BASE_X = 60;
const SPAWN_INTERVAL_BASE = 1100;
const FIRE_INTERVAL = 1680;
const NUM_ROWS = 8;
const ROW_HEIGHT = (CANVAS_HEIGHT - 60) / NUM_ROWS;
const getRowY = (i) => 30 + ROW_HEIGHT * (i + 0.5);
const TURRET_COOLDOWN_MS = 3000;
const ELITE_CHANCE_PER_WAVE = 0.05;
const ELITE_CHANCE_CAP = 0.65;

// Upgrade system: 5 levels, cost escalates by 10 each tier
const UPGRADE_COSTS = [10, 20, 30, 40, 50]; // cost to reach level 1,2,3,4,5
// fireRateMult < 1 = shoots faster; damage = hp removed per hit
const UPGRADE_STATS = [
  { fireRateMult: 1.00, damage: 1 }, // level 0 — base
  { fireRateMult: 0.80, damage: 1 }, // level 1 — slightly faster
  { fireRateMult: 0.62, damage: 1 }, // level 2 — noticeably faster
  { fireRateMult: 0.55, damage: 2 }, // level 3 — double damage
  { fireRateMult: 0.44, damage: 2 }, // level 4 — rapid double damage
  { fireRateMult: 0.36, damage: 3 }, // level 5 — elite rapid triple damage
];

// Slot hit-test constants (must match drawRows)
const SLOT_X = BASE_X + 5;
const SLOT_W = 50;
const SLOT_H = 36;

const COLORS = {
  bg: "#0a0e17",
  stars: "#ffffff",
  base: "#00e5ff",
  gun: "#e0e0e0",
  gunBarrel: "#ff6f00",
  bullet: "#ffab00",
  alien1: "#76ff03",
  alien2: "#ff1744",
  alien3: "#d500f9",
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

// Upgrade button lives at x=4..58 (left of base wall at x=60)
const UPGRADE_BTN_X = 4;
const UPGRADE_BTN_W = 54; // right edge = 58

// Returns which row index (0-7) a canvas-space point falls on, covering both
// the upgrade button zone (x=4..58) and the placement slot zone (x=65..115).
function hitTestSlot(canvasX, canvasY) {
  if (canvasX < UPGRADE_BTN_X || canvasX > SLOT_X + SLOT_W) return -1;
  for (let i = 0; i < NUM_ROWS; i++) {
    const slotY = getRowY(i) - SLOT_H / 2;
    if (canvasY >= slotY && canvasY <= slotY + SLOT_H) return i;
  }
  return -1;
}

export default function BaseDefenseGame() {
  const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const animFrameRef = useRef(null);
  const hoveredRowRef = useRef(-1);   // read by game loop
  const cooldownEndRef = useRef(0);   // read by game loop
  const scoreRef = useRef(0);
  const goldRef = useRef(0);

  const [score, setScore] = useState(0);
  const [gold, setGold] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [screenShake, setScreenShake] = useState(0);

  const initGame = useCallback(() => {
    scoreRef.current = 0;
    goldRef.current = 0;
    cooldownEndRef.current = 0;
    setScore(0);
    setGold(0);
    setWave(1);
    setGameOver(false);
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

  // ─── Drawing helpers ────────────────────────────────────────────────────────

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

  const drawGun = (ctx, y, muzzleFlash, level = 0) => {
    // Barrel color shifts from orange → gold → white-hot at max level
    const barrelColors = ["#ff6f00", "#ff8f00", "#ffb300", "#ffd600", "#ffe57f", "#ffffff"];
    const barrelColor = barrelColors[Math.min(level, 5)];

    ctx.save();
    ctx.fillStyle = level >= 3 ? "#1a2a1a" : "#263238";
    ctx.strokeStyle = level >= 5 ? "#ffd600" : level >= 3 ? "#76ff03" : COLORS.gun;
    ctx.lineWidth = 1.5;
    const bodyX = BASE_X + 10;
    const bodyW = 30;
    const bodyH = 32;
    ctx.beginPath();
    ctx.roundRect(bodyX, y - bodyH / 2, bodyW, bodyH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = barrelColor;
    ctx.shadowColor = barrelColor;
    ctx.shadowBlur = muzzleFlash > 0 ? 20 : level >= 4 ? 10 : 6;
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

  const drawTier2Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[2] / 2;
    const wobble = Math.sin(tick * 0.07 + a.id * 2) * 2;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);
    ctx.fillStyle = COLORS.tier2Body;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 8;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.fill();
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
    ctx.fillStyle = COLORS.tier2Armor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.5, 0);
    ctx.lineTo(0, s * 0.5); ctx.lineTo(-s * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.tier2Glow;
    ctx.beginPath();
    ctx.arc(-s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
    ctx.arc( s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
    ctx.fill();
    drawHpBar(ctx, a, s);
    ctx.restore();
  };

  const drawTier3Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[3] / 2;
    const wobble = Math.sin(tick * 0.04 + a.id * 2) * 1.5;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);
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
    ctx.fillStyle = COLORS.eliteBody;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(ang) * s, Math.sin(ang) * s)
              : ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    }
    ctx.closePath();
    ctx.fill();
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
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0);
    ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, s * 0.55);
    ctx.stroke();
    ctx.fillStyle = "#ff1744";
    ctx.save(); ctx.translate(-s * 0.28, -s * 0.18); ctx.rotate(-0.45);
    ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
    ctx.save(); ctx.translate( s * 0.28, -s * 0.18); ctx.rotate( 0.45);
    ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
    drawHpBar(ctx, a, s);
    ctx.restore();
  };

  const drawTier4Alien = (ctx, a, tick) => {
    const s = ALIEN_TIER_SIZES[4] / 2;
    const wobble = Math.sin(tick * 0.03 + a.id * 2) * 1;
    ctx.save();
    ctx.translate(a.x, a.y + wobble);
    const pulse = Math.sin(tick * 0.06) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.12;
    ctx.fillStyle = "#b71c1c";
    ctx.beginPath();
    ctx.arc(0, 0, s + 14 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
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
    ctx.fillStyle = COLORS.tier4Armor;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff8a65";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff8a65";
    ctx.save(); ctx.translate(-s * 0.3, -s * 0.18); ctx.rotate(-0.5);
    ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();
    ctx.save(); ctx.translate( s * 0.3, -s * 0.18); ctx.rotate( 0.5);
    ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();
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

  // Draw all 8 row slots as clickable placeholders
  const drawRows = (ctx, turrets, tick, cooldownRemaining, hoveredSlot, gold) => {
    const onCooldown = cooldownRemaining > 0;
    const cooldownFrac = cooldownRemaining / TURRET_COOLDOWN_MS;

    for (let i = 0; i < NUM_ROWS; i++) {
      const y = getRowY(i);
      const turret = turrets.find((t) => t.rowIndex === i);
      const hasTurret = !!turret;
      const isHovered = !hasTurret && !onCooldown && hoveredSlot === i;

      ctx.save();

      // Dashed lane line
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = isHovered
        ? "rgba(0,229,255,0.5)"
        : hasTurret
        ? "rgba(0,229,255,0.13)"
        : "rgba(0,229,255,0.06)";
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(SLOT_X + SLOT_W + 5, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hasTurret) {
        // ── Upgrade button — left of base wall (x=4..58) ────────────────────
        const level = turret.level ?? 0;
        const isMaxed = level >= 5;
        const cost = isMaxed ? 0 : UPGRADE_COSTS[level];
        const canAfford = !isMaxed && gold >= cost;
        const slotY = y - SLOT_H / 2;
        const cx = UPGRADE_BTN_X + UPGRADE_BTN_W / 2;  // center x = 31
        const isUpgradeHovered = hoveredSlot === i;

        // Background
        ctx.fillStyle = isUpgradeHovered
          ? canAfford ? "rgba(255,214,0,0.18)" : isMaxed ? "rgba(80,255,130,0.10)" : "rgba(255,60,60,0.12)"
          : "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(UPGRADE_BTN_X, slotY, UPGRADE_BTN_W, SLOT_H, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = isMaxed
          ? "rgba(80,255,130,0.7)"
          : isUpgradeHovered
            ? canAfford ? "rgba(255,214,0,1)" : "rgba(255,80,80,0.85)"
            : "rgba(255,214,0,0.35)";
        ctx.lineWidth = isUpgradeHovered ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(UPGRADE_BTN_X, slotY, UPGRADE_BTN_W, SLOT_H, 4);
        ctx.stroke();

        // Top label: "▲ Xg" or "★ MAX"
        ctx.font = "bold 10px 'Courier New', monospace";
        ctx.textAlign = "center";
        if (isMaxed) {
          ctx.shadowColor = "rgba(80,255,130,0.8)";
          ctx.shadowBlur = isUpgradeHovered ? 8 : 4;
          ctx.fillStyle = isUpgradeHovered ? "rgba(80,255,130,1)" : "rgba(80,255,130,0.8)";
          ctx.fillText("★ MAX", cx, slotY + 14);
        } else {
          ctx.shadowColor = canAfford ? "#ffd600" : "transparent";
          ctx.shadowBlur = isUpgradeHovered && canAfford ? 8 : 0;
          ctx.fillStyle = isUpgradeHovered
            ? canAfford ? "#ffd600" : "#ff6060"
            : canAfford ? "rgba(255,214,0,0.8)" : "rgba(160,160,160,0.45)";
          ctx.fillText(`▲ ${cost}g`, cx, slotY + 14);
        }
        ctx.shadowBlur = 0;

        // Level pips (5 dots)
        const dotR = 3.5;
        const dotGap = 9;
        const dotsStartX = cx - 2 * dotGap;
        const dotsY = slotY + SLOT_H - 9;
        for (let d = 0; d < 5; d++) {
          if (d < level) {
            ctx.shadowColor = "#ffd600";
            ctx.shadowBlur = 5;
            ctx.fillStyle = "#ffd600";
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(255,214,0,0.15)";
          }
          ctx.beginPath();
          ctx.arc(dotsStartX + d * dotGap, dotsY, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      } else {
        const slotY = y - SLOT_H / 2;
        const cx = SLOT_X + SLOT_W / 2;
        const cy = slotY + SLOT_H / 2;

        if (onCooldown) {
          // Dimmed slot with countdown
          ctx.fillStyle = "rgba(0,229,255,0.03)";
          ctx.beginPath();
          ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,229,255,0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
          ctx.stroke();

          // Circular progress arc draining as cooldown passes
          const arcR = 11;
          ctx.strokeStyle = "rgba(0,229,255,0.1)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(0,229,255,0.45)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cooldownFrac));
          ctx.stroke();

        } else {
          // Ready — pulsing slot
          const pulse = Math.sin(tick * 0.07) * 0.5 + 0.5;

          if (isHovered) {
            ctx.fillStyle = "rgba(0,229,255,0.16)";
          } else {
            ctx.fillStyle = `rgba(0,229,255,${0.04 + pulse * 0.04})`;
          }
          ctx.beginPath();
          ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
          ctx.fill();

          ctx.strokeStyle = isHovered
            ? "rgba(0,229,255,1)"
            : `rgba(0,229,255,${0.35 + pulse * 0.35})`;
          ctx.lineWidth = isHovered ? 2 : 1.5;
          ctx.beginPath();
          ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
          ctx.stroke();

          // "+" icon
          const iconSize = isHovered ? 8 : 6;
          ctx.strokeStyle = isHovered
            ? "rgba(0,229,255,1)"
            : `rgba(0,229,255,${0.55 + pulse * 0.3})`;
          ctx.lineWidth = isHovered ? 2.5 : 2;
          ctx.beginPath();
          ctx.moveTo(cx - iconSize, cy); ctx.lineTo(cx + iconSize, cy);
          ctx.moveTo(cx, cy - iconSize); ctx.lineTo(cx, cy + iconSize);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  };

  const drawHUD = (ctx, score, wave, turretCount, gold) => {
    ctx.save();

    // ── Wave label (top-left) ────────────────────────────────────────────────
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillStyle = COLORS.hud;
    ctx.textAlign = "left";
    ctx.fillText(`WAVE ${wave}`, 14, 20);

    // ── Gold display ─────────────────────────────────────────────────────────
    // Coin circle
    const coinX = 22;
    const coinY = 44;
    const coinR = 12;
    ctx.shadowColor = "#ffd600";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffd600";
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner ring
    ctx.strokeStyle = "#ff8f00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR - 3, 0, Math.PI * 2);
    ctx.stroke();
    // "G" glyph
    ctx.fillStyle = "#7a4000";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("G", coinX, coinY + 4);

    // Gold amount
    ctx.shadowColor = "#ffd600";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffd600";
    ctx.font = "bold 22px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${gold}`, coinX + coinR + 8, coinY + 8);
    ctx.shadowBlur = 0;

    // ── Right side ───────────────────────────────────────────────────────────
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(0,229,255,0.45)";
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText(`SCORE: ${score}`, CANVAS_WIDTH - 14, 20);
    ctx.fillText(`TURRETS: ${turretCount}`, CANVAS_WIDTH - 14, 38);

    ctx.restore();
  };

  // ─── Main game loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const loop = () => {
      const gs = gameStateRef.current;
      if (!gs || !gs.running) return;
      gs.tick++;

      gs.turrets.forEach((turret) => {
        const stats = UPGRADE_STATS[turret.level ?? 0];
        if (gs.tick - turret.lastFire > (FIRE_INTERVAL * stats.fireRateMult) / 16) {
          gs.bullets.push({
            x: BASE_X + GUN_WIDTH + 18,
            y: turret.y,
            id: gs.tick + turret.rowIndex * 0.001,
            damage: stats.damage,
          });
          turret.lastFire = gs.tick;
          turret.muzzleFlash = 1;
        }
        if (turret.muzzleFlash > 0) {
          turret.muzzleFlash = Math.max(0, turret.muzzleFlash - 0.12);
        }
      });

      gs.bullets = gs.bullets.filter((b) => {
        b.x += BULLET_SPEED;
        return b.x < CANVAS_WIDTH + 10;
      });

      if (gs.tick - gs.lastSpawn > gs.spawnInterval / 16) {
        const rowIndex = Math.floor(Math.random() * NUM_ROWS);
        const y = getRowY(rowIndex);
        const eliteChance = Math.min(ELITE_CHANCE_CAP, Math.max(0, (gs.wave - 1) * ELITE_CHANCE_PER_WAVE));
        const isEliteRoll = Math.random() < eliteChance;
        const maxHp = isEliteRoll ? Math.min(12, 1 + Math.floor(gs.wave * 0.5)) : 1;
        const tier = maxHp <= 1 ? 1 : maxHp <= 3 ? 2 : maxHp <= 6 ? 3 : 4;
        const size = ALIEN_TIER_SIZES[tier];
        const speedMults = [1, 1, 0.85, 0.72, 0.6];
        const speed = (gs.alienSpeed + Math.random() * 0.5) * speedMults[tier];
        gs.aliens.push({
          x: CANVAS_WIDTH + size, y, rowIndex,
          type: Math.floor(Math.random() * 3),
          speed, id: gs.tick + Math.random(),
          hp: maxHp, maxHp, tier, size,
        });
        gs.lastSpawn = gs.tick;
      }

      let hitBase = false;
      gs.aliens = gs.aliens.filter((a) => {
        a.x -= a.speed;
        if (a.x - a.size / 2 <= BASE_X) { hitBase = true; return false; }
        return true;
      });

      const newExplosions = [];
      gs.aliens = gs.aliens.filter((a) => {
        for (let i = gs.bullets.length - 1; i >= 0; i--) {
          const b = gs.bullets[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.sqrt(dx * dx + dy * dy) < a.size / 2 + BULLET_RADIUS) {
            gs.bullets.splice(i, 1);
            a.hp -= (b.damage ?? 1);
            const tierFx = [
              null,
              { glow: alienColors[a.type % 3], deathCount: 8,  spread: 2,   maxPx: 3 },
              { glow: COLORS.tier2Glow,         deathCount: 12, spread: 2.5, maxPx: 4 },
              { glow: COLORS.eliteGlow,          deathCount: 18, spread: 3,   maxPx: 5 },
              { glow: COLORS.tier4Glow,          deathCount: 26, spread: 4,   maxPx: 7 },
            ][a.tier];
            if (a.hp > 0) {
              newExplosions.push({
                x: b.x, y: b.y, life: 0.5, maxLife: 0.5,
                particles: Array.from({ length: 5 }, () => ({
                  vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 2.5,
                  size: Math.random() * 2 + 0.5, color: tierFx.glow,
                })),
              });
              break;
            }
            newExplosions.push({
              x: a.x, y: a.y, life: 1, maxLife: 1,
              particles: Array.from({ length: tierFx.deathCount }, () => ({
                vx: (Math.random() - 0.5) * tierFx.spread,
                vy: (Math.random() - 0.5) * tierFx.spread,
                size: Math.random() * tierFx.maxPx + 1, color: tierFx.glow,
              })),
            });
            scoreRef.current += a.maxHp * 10;
            setScore(scoreRef.current);
            goldRef.current += a.maxHp;
            setGold(goldRef.current);
            gs.aliensKilledInWave++;
            if (gs.aliensKilledInWave >= gs.waveThreshold) {
              gs.wave++;
              gs.aliensKilledInWave = 0;
              gs.waveThreshold = Math.floor(gs.waveThreshold * 1.2);
              gs.spawnInterval = Math.max(150, gs.spawnInterval - 250);
              gs.alienSpeed += 0.2;
              setWave(gs.wave);
            }
            return false;
          }
        }
        return true;
      });

      gs.explosions.push(...newExplosions);
      gs.explosions = gs.explosions.filter((e) => { e.life -= 0.035; return e.life > 0; });

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

      const nearestAlien = gs.aliens.reduce((min, a) => Math.min(min, a.x), CANVAS_WIDTH);
      if (nearestAlien < 200) {
        ctx.save();
        ctx.globalAlpha = (1 - nearestAlien / 200) * 0.15;
        ctx.fillStyle = COLORS.danger;
        ctx.fillRect(0, 0, BASE_X, CANVAS_HEIGHT);
        ctx.restore();
      }

      const cooldownRemaining = Math.max(0, cooldownEndRef.current - Date.now());
      drawRows(ctx, gs.turrets, gs.tick, cooldownRemaining, hoveredRowRef.current, goldRef.current);
      drawBase(ctx, gs.tick);
      gs.explosions.forEach((e) => drawExplosion(ctx, e));
      gs.bullets.forEach((b) => drawBullet(ctx, b));
      gs.aliens.forEach((a) => drawAlien(ctx, a, gs.tick));
      gs.turrets.forEach((turret) => drawGun(ctx, turret.y, turret.muzzleFlash, turret.level ?? 0));
      drawHUD(ctx, scoreRef.current, gs.wave, gs.turrets.length, goldRef.current);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameStarted, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Canvas interaction ──────────────────────────────────────────────────────

  const handleCanvasClick = useCallback((e) => {
    const gs = gameStateRef.current;
    if (!gs || !gs.running) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const row = hitTestSlot(e.clientX - rect.left, e.clientY - rect.top);
    if (row === -1) return;

    const existing = gs.turrets.find((t) => t.rowIndex === row);
    if (existing) {
      // Upgrade the turret
      if (existing.level >= 5) return;
      const cost = UPGRADE_COSTS[existing.level];
      if (goldRef.current < cost) return;
      goldRef.current -= cost;
      setGold(goldRef.current);
      existing.level++;
      return;
    }

    // Place new turret
    if (cooldownEndRef.current > Date.now()) return;
    gs.turrets.push({ rowIndex: row, y: getRowY(row), lastFire: 0, muzzleFlash: 0, level: 0 });
    const end = Date.now() + TURRET_COOLDOWN_MS;
    cooldownEndRef.current = end;
  }, []);

  const handleCanvasMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const gs = gameStateRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const row = hitTestSlot(e.clientX - rect.left, e.clientY - rect.top);
    hoveredRowRef.current = row;

    const existing = row !== -1 && gs && gs.turrets.find((t) => t.rowIndex === row);
    const canUpgrade = existing && existing.level < 5 && goldRef.current >= UPGRADE_COSTS[existing.level];
    const onCooldown = cooldownEndRef.current > Date.now();
    const isEmpty = row !== -1 && !existing;
    canvas.style.cursor = (canUpgrade || (isEmpty && !onCooldown)) ? "pointer" : "default";
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    hoveredRowRef.current = -1;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  }, []);

  // ─── Keyboard ────────────────────────────────────────────────────────────────

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

  // ─── Cooldown countdown ──────────────────────────────────────────────────────

  // ─── Screen shake ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (screenShake > 0) {
      const t = setTimeout(() => setScreenShake((s) => Math.max(0, s - 1)), 50);
      return () => clearTimeout(t);
    }
  }, [screenShake]);

  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;


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
        @keyframes pulse { 0%,100%{text-shadow:0 0 8px #00e5ff} 50%{text-shadow:0 0 20px #00e5ff, 0 0 40px #00e5ff} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
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
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{
            border: "2px solid rgba(0,229,255,0.3)",
            borderRadius: 6,
            display: "block",
            background: COLORS.bg,
            boxShadow: "0 0 40px rgba(0,229,255,0.08), inset 0 0 60px rgba(0,0,0,0.5)",
            transform: `translate(${shakeX}px, ${shakeY}px)`,
          }}
        />

        {/* Start screen */}
        {!gameStarted && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(5,8,16,0.88)", borderRadius: 6, animation: "fadeIn 0.5s ease",
            }}
          >
            <div style={{ color: COLORS.hud, fontSize: 42, fontWeight: 900, letterSpacing: 6, marginBottom: 16 }}>
              BASE DEFENSE
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8 }}>
              Defend your base from alien invaders
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
              Click a row slot on the left to place a turret
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent", border: `2px solid ${COLORS.hud}`,
                color: COLORS.hud, padding: "14px 48px", fontSize: 18,
                fontFamily: "'Courier New', monospace", cursor: "pointer",
                letterSpacing: 4, fontWeight: 700, borderRadius: 4, transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(0,229,255,0.15)"; e.target.style.boxShadow = "0 0 20px rgba(0,229,255,0.3)"; }}
              onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
            >
              START MISSION
            </button>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 16 }}>or press SPACE</div>
          </div>
        )}

        {/* Game over */}
        {gameOver && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "rgba(5,8,16,0.9)", borderRadius: 6, animation: "fadeIn 0.4s ease",
            }}
          >
            <div style={{ color: COLORS.danger, fontSize: 40, fontWeight: 900, letterSpacing: 6, marginBottom: 12 }}>
              BASE DESTROYED
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, marginBottom: 6 }}>
              Score: <span style={{ color: COLORS.hud, fontWeight: 700 }}>{score}</span>
            </div>
            <div style={{ color: "#ffd600", fontSize: 16, marginBottom: 6, textShadow: "0 0 10px #ffd600" }}>
              Gold: <span style={{ fontWeight: 700 }}>{gold}</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 6 }}>Wave Reached: {wave}</div>
            <div style={{ color: "rgba(255,171,0,0.7)", fontSize: 14, marginBottom: 28 }}>High Score: {highScore}</div>
            <button
              onClick={startGame}
              style={{
                background: "transparent", border: `2px solid ${COLORS.danger}`,
                color: COLORS.danger, padding: "14px 48px", fontSize: 18,
                fontFamily: "'Courier New', monospace", cursor: "pointer",
                letterSpacing: 4, fontWeight: 700, borderRadius: 4, transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(255,23,68,0.15)"; e.target.style.boxShadow = "0 0 20px rgba(255,23,68,0.3)"; }}
              onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
            >
              RETRY
            </button>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 12 }}>or press SPACE</div>
          </div>
        )}
      </div>

<div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 4, letterSpacing: 2 }}>
        ELIMINATE ALL THREATS • PROTECT THE BASE
      </div>
    </div>
  );
}
