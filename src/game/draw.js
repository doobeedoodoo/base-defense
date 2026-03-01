/**
 * Canvas drawing module.
 *
 * All functions here are pure: they receive a CanvasRenderingContext2D and
 * data, draw to the canvas, and return nothing. No React, no side-effects.
 */

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BASE_X,
  GUN_WIDTH,
  BULLET_RADIUS,
  ALIEN_SIZE,
  ALIEN_TIER_SIZES,
  NUM_ROWS,
  SLOT_X,
  SLOT_W,
  SLOT_H,
  UPGRADE_BTN_X,
  UPGRADE_BTN_W,
  UPGRADE_COSTS,
  PLACEMENT_COSTS,
  TURRET_COOLDOWN_MS,
  BASE_HP,
  getRowY,
  COLORS,
} from "./constants";

// ─── Stars ───────────────────────────────────────────────────────────────────

/**
 * Generates an array of star descriptors for the background.
 * Called once at module load so the star field is stable across renders.
 */
export function generateStars(count) {
  return Array.from({ length: count }, () => ({
    x:           Math.random() * CANVAS_WIDTH,
    y:           Math.random() * CANVAS_HEIGHT,
    r:           Math.random() * 1.5 + 0.3,
    alpha:       Math.random() * 0.6 + 0.2,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
  }));
}

// Stable star field — generated once, shared for the lifetime of the app.
export const STARS = generateStars(120);

// ─── Environment ─────────────────────────────────────────────────────────────

/** Draws the twinkling star field. */
export function drawStars(ctx, tick) {
  STARS.forEach((s) => {
    ctx.save();
    ctx.globalAlpha = s.alpha + Math.sin(tick * s.twinkleSpeed) * 0.2;
    ctx.fillStyle   = COLORS.stars;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/**
 * Draws the base wall: a glowing vertical line with pulsing tick marks and a
 * radial aura that extends slightly into the play field.
 */
export function drawBase(ctx, tick) {
  const pulse = Math.sin(tick * 0.03) * 6;

  // Soft radial aura behind the wall
  ctx.save();
  const grad = ctx.createRadialGradient(
    BASE_X, CANVAS_HEIGHT / 2, 20,
    BASE_X, CANVAS_HEIGHT / 2, 160 + pulse
  );
  grad.addColorStop(0, "rgba(0,229,255,0.07)");
  grad.addColorStop(1, "rgba(0,229,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BASE_X + 160, CANVAS_HEIGHT);
  ctx.restore();

  // Glowing wall line + animated tick marks
  ctx.save();
  ctx.shadowColor = COLORS.base;
  ctx.shadowBlur  = 18 + pulse;
  ctx.strokeStyle = COLORS.base;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(BASE_X, 30);
  ctx.lineTo(BASE_X, CANVAS_HEIGHT - 30);
  ctx.stroke();

  for (let i = 50; i < CANVAS_HEIGHT - 30; i += 40) {
    ctx.fillStyle   = COLORS.base;
    ctx.globalAlpha = 0.5 + Math.sin(tick * 0.05 + i * 0.1) * 0.3;
    ctx.fillRect(BASE_X - 6, i, 4, 12);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draws a red danger-zone overlay on the base column when aliens are close.
 * Opacity ramps up as the nearest alien approaches x=0.
 */
export function drawDangerOverlay(ctx, nearestAlienX) {
  if (nearestAlienX >= 200) return;
  ctx.save();
  ctx.globalAlpha = (1 - nearestAlienX / 200) * 0.15;
  ctx.fillStyle   = COLORS.danger;
  ctx.fillRect(0, 0, BASE_X, CANVAS_HEIGHT);
  ctx.restore();
}

// ─── Turret ──────────────────────────────────────────────────────────────────

/**
 * Draws a single turret gun at vertical position `y`.
 *
 * Visual feedback by upgrade level:
 *   Level 0–2: grey body, orange barrel
 *   Level 3–4: dark-green body, yellow/gold barrel with stronger idle glow
 *   Level 5:   gold-framed body, white-hot barrel
 */
export function drawGun(ctx, y, muzzleFlash, level = 0) {
  // Barrel tint escalates from orange → gold → white as the turret is upgraded
  const barrelColors = ["#ff6f00", "#ff8f00", "#ffb300", "#ffd600", "#ffe57f", "#ffffff"];
  const barrelColor  = barrelColors[Math.min(level, 5)];

  const bodyX = BASE_X + 10;
  const bodyW = 30;
  const bodyH = 32;

  ctx.save();

  // Gun body
  ctx.fillStyle   = level >= 3 ? "#1a2a1a" : "#263238";
  ctx.strokeStyle = level >= 5 ? "#ffd600" : level >= 3 ? "#76ff03" : COLORS.gun;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.roundRect(bodyX, y - bodyH / 2, bodyW, bodyH, 4);
  ctx.fill();
  ctx.stroke();

  // Barrel — glows more at higher levels / during muzzle flash
  ctx.fillStyle   = barrelColor;
  ctx.shadowColor = barrelColor;
  ctx.shadowBlur  = muzzleFlash > 0 ? 20 : level >= 4 ? 10 : 6;
  ctx.fillRect(bodyX + bodyW, y - 4, GUN_WIDTH - bodyW + 8, 8);

  // Muzzle flash bloom
  if (muzzleFlash > 0) {
    const flashX    = bodyX + GUN_WIDTH + 10;
    const flashSize = muzzleFlash * 14;
    const flashGrad = ctx.createRadialGradient(flashX, y, 0, flashX, y, flashSize);
    flashGrad.addColorStop(0, "rgba(255,255,200,0.9)");
    flashGrad.addColorStop(0.4, "rgba(255,171,0,0.5)");
    flashGrad.addColorStop(1, "rgba(255,171,0,0)");
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(flashX, y, flashSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Status indicator dot (cyan = active/linked)
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#00e5ff";
  ctx.beginPath();
  ctx.arc(bodyX + 8, y, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── Bullets ─────────────────────────────────────────────────────────────────

/** Draws a bullet with a fading trail behind it. */
export function drawBullet(ctx, b) {
  ctx.save();

  // Trail
  ctx.shadowColor = COLORS.bullet;
  ctx.shadowBlur  = 10;
  const trailGrad = ctx.createLinearGradient(b.x - 18, b.y, b.x, b.y);
  trailGrad.addColorStop(0, "rgba(255,171,0,0)");
  trailGrad.addColorStop(1, "rgba(255,171,0,0.6)");
  ctx.strokeStyle = trailGrad;
  ctx.lineWidth   = 3;
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
}

// ─── Aliens ──────────────────────────────────────────────────────────────────

/** Three color variants cycled for tier-1 aliens. */
const ALIEN_COLORS = [COLORS.alien1, COLORS.alien2, COLORS.alien3];

/**
 * Draws a health bar above an alien.
 * Color shifts green → amber → red as HP drops.
 * Called from within a translated ctx (origin at alien center).
 */
function drawHpBar(ctx, a, radius) {
  ctx.shadowBlur  = 0;
  ctx.shadowColor = "transparent";

  const hpFrac = a.hp / a.maxHp;
  const barW   = radius * 2.6;
  const barH   = a.tier >= 4 ? 7 : 5;
  const barX   = -barW / 2;
  const barY   = -radius - 13;

  // Background track
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

  // Fill
  ctx.fillStyle = hpFrac > 0.6 ? "#00e676" : hpFrac > 0.3 ? "#ffab00" : "#ff1744";
  ctx.fillRect(barX, barY, barW * hpFrac, barH);
}

/** Tier 1 — basic alien (triangle, diamond, or circle). */
function drawTier1Alien(ctx, a, tick) {
  const color  = ALIEN_COLORS[a.type % 3];
  const wobble = Math.sin(tick * 0.08 + a.id * 2) * 2;
  const r      = ALIEN_SIZE / 2;

  ctx.save();
  ctx.translate(a.x, a.y + wobble);
  ctx.shadowColor = color;
  ctx.shadowBlur  = 12;
  ctx.fillStyle   = color;

  ctx.beginPath();
  if (a.type === 0) {
    // Triangle
    ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath();
  } else if (a.type === 1) {
    // Diamond
    ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
  } else {
    // Circle
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.fill();

  // Eyes
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#000";
  ctx.beginPath();
  ctx.arc(-5, -2, 3, 0, Math.PI * 2);
  ctx.arc( 5, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-4, -3, 1.2, 0, Math.PI * 2);
  ctx.arc( 6, -3, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Tier 2 — armored alien (octagon with armor plating). */
function drawTier2Alien(ctx, a, tick) {
  const s      = ALIEN_TIER_SIZES[2] / 2;
  const wobble = Math.sin(tick * 0.07 + a.id * 2) * 2;

  ctx.save();
  ctx.translate(a.x, a.y + wobble);

  // Helper: trace an octagon path of radius r
  const octPath = (r) => {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 8;
      i === 0
        ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
        : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
  };

  // Dark body fill
  ctx.fillStyle = COLORS.tier2Body;
  ctx.beginPath(); octPath(s); ctx.fill();

  // Armor outline
  ctx.strokeStyle = COLORS.tier2Armor;
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); octPath(s); ctx.stroke();

  // Inner glow ring
  ctx.strokeStyle  = COLORS.tier2Glow;
  ctx.lineWidth    = 1.5;
  ctx.globalAlpha  = 0.5;
  ctx.beginPath(); octPath(s * 0.87); ctx.stroke();
  ctx.globalAlpha  = 1;

  // Armor diamond accent
  ctx.fillStyle   = COLORS.tier2Armor;
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.5, 0);
  ctx.lineTo(0,  s * 0.5); ctx.lineTo(-s * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Eye dots
  ctx.fillStyle = COLORS.tier2Glow;
  ctx.beginPath();
  ctx.arc(-s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
  ctx.arc( s * 0.3, -s * 0.15, 4, 0, Math.PI * 2);
  ctx.fill();

  drawHpBar(ctx, a, s);
  ctx.restore();
}

/** Tier 3 — elite alien (hexagon with rotating spike ring). */
function drawTier3Alien(ctx, a, tick) {
  const s      = ALIEN_TIER_SIZES[3] / 2;
  const wobble = Math.sin(tick * 0.04 + a.id * 2) * 1.5;

  ctx.save();
  ctx.translate(a.x, a.y + wobble);

  // Rotating spike ring
  ctx.save();
  ctx.rotate(tick * 0.018);
  ctx.strokeStyle = "rgba(255,152,0,0.75)";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    ctx.moveTo(Math.cos(ang) * (s + 1),  Math.sin(ang) * (s + 1));
    ctx.lineTo(Math.cos(ang) * (s + 9),  Math.sin(ang) * (s + 9));
  }
  ctx.stroke();
  ctx.restore();

  // Helper: trace a hexagon path of radius r
  const hexPath = (r) => {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0
        ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
        : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
  };

  // Dark body
  ctx.fillStyle = COLORS.eliteBody;
  ctx.beginPath(); hexPath(s); ctx.fill();

  // Glowing hex outline
  ctx.strokeStyle = COLORS.eliteGlow;
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); hexPath(s); ctx.stroke();

  // Inner armor plate
  ctx.fillStyle   = COLORS.eliteArmor;
  ctx.strokeStyle = "#ffab40";
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); hexPath(s * 0.7); ctx.fill(); ctx.stroke();

  // Cross-hair etching
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0);
  ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, s * 0.55);
  ctx.stroke();

  // Red eye bars
  ctx.fillStyle = "#ff1744";
  ctx.save(); ctx.translate(-s * 0.28, -s * 0.18); ctx.rotate(-0.45);
  ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
  ctx.save(); ctx.translate( s * 0.28, -s * 0.18); ctx.rotate( 0.45);
  ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();

  drawHpBar(ctx, a, s);
  ctx.restore();
}

/** Tier 4 — brute alien (star-polygon with dual counter-rotating spike rings). */
function drawTier4Alien(ctx, a, tick) {
  const s      = ALIEN_TIER_SIZES[4] / 2;
  const wobble = Math.sin(tick * 0.03 + a.id * 2) * 1;

  ctx.save();
  ctx.translate(a.x, a.y + wobble);

  // Pulsing red aura
  const pulse = Math.sin(tick * 0.06) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.12;
  ctx.fillStyle   = "#b71c1c";
  ctx.beginPath();
  ctx.arc(0, 0, s + 14 + pulse * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Outer spike ring — counter-clockwise
  ctx.save();
  ctx.rotate(-tick * 0.011);
  ctx.strokeStyle = "rgba(255,82,82,0.85)";
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.moveTo(Math.cos(ang) * (s + 1),  Math.sin(ang) * (s + 1));
    ctx.lineTo(Math.cos(ang) * (s + 11), Math.sin(ang) * (s + 11));
  }
  ctx.stroke();
  ctx.restore();

  // Inner spike ring — clockwise
  ctx.save();
  ctx.rotate(tick * 0.019);
  ctx.strokeStyle = "rgba(255,160,0,0.65)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    ctx.moveTo(Math.cos(ang) * (s - 3), Math.sin(ang) * (s - 3));
    ctx.lineTo(Math.cos(ang) * (s + 5), Math.sin(ang) * (s + 5));
  }
  ctx.stroke();
  ctx.restore();

  // 16-point star body
  const starPath = (outer, inner, points) => {
    for (let i = 0; i < points * 2; i++) {
      const ang = (i / (points * 2)) * Math.PI * 2;
      const r   = i % 2 === 0 ? outer : inner;
      i === 0
        ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
        : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
  };

  ctx.fillStyle = COLORS.tier4Body;
  ctx.beginPath(); starPath(s, s * 0.58, 8); ctx.fill();
  ctx.strokeStyle = COLORS.tier4Glow;
  ctx.lineWidth   = 2;
  ctx.beginPath(); starPath(s, s * 0.58, 8); ctx.stroke();

  // Core armor circles
  ctx.fillStyle = COLORS.tier4Armor;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff8a65";
  ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.fill();

  // Eye bars
  ctx.fillStyle = "#ff8a65";
  ctx.save(); ctx.translate(-s * 0.3, -s * 0.18); ctx.rotate(-0.5);
  ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();
  ctx.save(); ctx.translate( s * 0.3, -s * 0.18); ctx.rotate( 0.5);
  ctx.fillRect(-8, -3.5, 16, 7); ctx.restore();

  // Mouth / grimace
  ctx.strokeStyle = "rgba(255,138,101,0.9)";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.38, s * 0.28);
  for (let i = 0; i <= 5; i++) {
    const mx = -s * 0.38 + (i * s * 0.76) / 5;
    ctx.lineTo(mx, s * 0.28 + (i % 2 === 0 ? 5 : -3));
  }
  ctx.stroke();

  drawHpBar(ctx, a, s);
  ctx.restore();
}

/** Dispatches to the correct tier draw function. */
export function drawAlien(ctx, a, tick) {
  if      (a.tier === 4) drawTier4Alien(ctx, a, tick);
  else if (a.tier === 3) drawTier3Alien(ctx, a, tick);
  else if (a.tier === 2) drawTier2Alien(ctx, a, tick);
  else                   drawTier1Alien(ctx, a, tick);
}

// ─── Explosions ──────────────────────────────────────────────────────────────

/** Draws a particle explosion. `e.life` is expected to be 0..maxLife. */
export function drawExplosion(ctx, e) {
  const progress = e.life / e.maxLife; // 1 = fresh, 0 = expired
  const size     = (1 - progress) * 30;

  ctx.save();
  ctx.globalAlpha = progress;

  for (const p of e.particles) {
    const px = e.x + p.vx * (1 - progress) * 30;
    const py = e.y + p.vy * (1 - progress) * 30;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(px, py, size * p.size * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Rows / slots ─────────────────────────────────────────────────────────────

/**
 * Draws all 8 lane lines plus the interactive UI element for each row:
 *   • Occupied row  → upgrade button (left of base wall, x=4..58)
 *   • Empty row     → placement slot (right of base wall); shows cooldown arc
 *                     if the player cannot yet place another turret.
 *
 * @param {number}   cooldownRemaining  ms until next placement is allowed (0 = ready)
 * @param {number}   hoveredSlot        row index the mouse is over, or -1
 * @param {number}   gold               current player gold (used to grey out unaffordable upgrades)
 */
export function drawRows(ctx, turrets, tick, cooldownRemaining, hoveredSlot, gold) {
  const onCooldown   = cooldownRemaining > 0;
  const cooldownFrac = cooldownRemaining / TURRET_COOLDOWN_MS;

  // Placement cost and affordability are the same for all empty slots
  // (cost depends on how many turrets are placed, not which row is clicked).
  const nextCost    = PLACEMENT_COSTS[Math.min(turrets.length, PLACEMENT_COSTS.length - 1)];
  const canAffordPlace = gold >= nextCost;

  for (let i = 0; i < NUM_ROWS; i++) {
    const y      = getRowY(i);
    const turret = turrets.find((t) => t.rowIndex === i);
    const hasTurret = !!turret;
    const isHovered = !hasTurret && hoveredSlot === i;

    ctx.save();

    // Lane dashed guide line
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
      drawUpgradeButton(ctx, turret, y, hoveredSlot === i, gold);
    } else {
      drawPlacementSlot(ctx, y, tick, onCooldown, cooldownFrac, isHovered, nextCost, canAffordPlace);
    }

    ctx.restore();
  }
}

// ─── Row sub-draws ────────────────────────────────────────────────────────────

/** Draws the upgrade button for a row that already contains a turret. */
function drawUpgradeButton(ctx, turret, rowY, isHovered, gold) {
  const level    = turret.level ?? 0;
  const isMaxed  = level >= 5;
  const cost     = isMaxed ? 0 : UPGRADE_COSTS[level];
  const canAfford = !isMaxed && gold >= cost;
  const slotY    = rowY - SLOT_H / 2;
  const cx       = UPGRADE_BTN_X + UPGRADE_BTN_W / 2; // center x ≈ 31

  // Background
  ctx.fillStyle = isHovered
    ? canAfford ? "rgba(255,214,0,0.18)" : isMaxed ? "rgba(80,255,130,0.10)" : "rgba(255,60,60,0.12)"
    : "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(UPGRADE_BTN_X, slotY, UPGRADE_BTN_W, SLOT_H, 4);
  ctx.fill();

  // Border — gold when affordable, red when not, green when maxed
  ctx.strokeStyle = isMaxed
    ? "rgba(80,255,130,0.7)"
    : isHovered
      ? canAfford ? "rgba(255,214,0,1)" : "rgba(255,80,80,0.85)"
      : "rgba(255,214,0,0.35)";
  ctx.lineWidth = isHovered ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(UPGRADE_BTN_X, slotY, UPGRADE_BTN_W, SLOT_H, 4);
  ctx.stroke();

  // Label: "▲ Xg" or "★ MAX"
  ctx.font      = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "center";
  if (isMaxed) {
    ctx.shadowColor = "rgba(80,255,130,0.8)";
    ctx.shadowBlur  = isHovered ? 8 : 4;
    ctx.fillStyle   = isHovered ? "rgba(80,255,130,1)" : "rgba(80,255,130,0.8)";
    ctx.fillText("★ MAX", cx, slotY + 14);
  } else {
    ctx.shadowColor = canAfford ? "#ffd600" : "transparent";
    ctx.shadowBlur  = isHovered && canAfford ? 8 : 0;
    ctx.fillStyle   = isHovered
      ? canAfford ? "#ffd600" : "#ff6060"
      : canAfford ? "rgba(255,214,0,0.8)" : "rgba(160,160,160,0.45)";
    ctx.fillText(`▲ ${cost}g`, cx, slotY + 14);
  }
  ctx.shadowBlur = 0;

  // 5 pip dots showing current level (filled = upgraded, hollow = locked)
  const dotR        = 3.5;
  const dotGap      = 9;
  const dotsStartX  = cx - 2 * dotGap;
  const dotsY       = slotY + SLOT_H - 9;
  for (let d = 0; d < 5; d++) {
    if (d < level) {
      ctx.shadowColor = "#ffd600";
      ctx.shadowBlur  = 5;
      ctx.fillStyle   = "#ffd600";
    } else {
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = "rgba(255,214,0,0.15)";
    }
    ctx.beginPath();
    ctx.arc(dotsStartX + d * dotGap, dotsY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

/**
 * Draws an empty placement slot (right of base wall).
 * Shows the gold cost and whether the player can afford it.
 * Shows a cooldown arc when the short placement cooldown is active.
 *
 * @param {number}  cost        Gold cost to place next turret
 * @param {boolean} canAfford   Whether the player currently has enough gold
 */
function drawPlacementSlot(ctx, rowY, tick, onCooldown, cooldownFrac, isHovered, cost, canAfford) {
  const slotY = rowY - SLOT_H / 2;
  const cx    = SLOT_X + SLOT_W / 2;
  const cy    = slotY + SLOT_H / 2;

  // Slot is "blocked" if on cooldown OR the player can't afford it
  const blocked = onCooldown || !canAfford;

  if (blocked) {
    // Dimmed slot body
    ctx.fillStyle = isHovered
      ? "rgba(255,80,80,0.08)"
      : "rgba(0,229,255,0.03)";
    ctx.beginPath();
    ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
    ctx.fill();

    ctx.strokeStyle = isHovered
      ? "rgba(255,80,80,0.5)"
      : "rgba(0,229,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(SLOT_X, slotY, SLOT_W, SLOT_H, 4);
    ctx.stroke();

    if (onCooldown) {
      // Circular countdown arc — drains from full to empty as cooldown expires
      const arcR = 9;
      ctx.strokeStyle = "rgba(0,229,255,0.1)";
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 5, arcR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,229,255,0.45)";
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 5, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cooldownFrac));
      ctx.stroke();
    }

    // Cost label — red tint when unaffordable
    ctx.font      = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = isHovered ? "rgba(255,100,100,0.9)" : "rgba(160,160,160,0.4)";
    ctx.fillText(`${cost}g`, cx, slotY + SLOT_H - 6);
  } else {
    // Ready and affordable — pulsing cyan slot with cost label
    const pulse = Math.sin(tick * 0.07) * 0.5 + 0.5;

    ctx.fillStyle = isHovered
      ? "rgba(0,229,255,0.16)"
      : `rgba(0,229,255,${0.04 + pulse * 0.04})`;
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

    // "+" icon centered in upper portion of slot
    const iconSize = isHovered ? 7 : 5;
    const iconY    = cy - 5;
    ctx.strokeStyle = isHovered
      ? "rgba(0,229,255,1)"
      : `rgba(0,229,255,${0.55 + pulse * 0.3})`;
    ctx.lineWidth = isHovered ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(cx - iconSize, iconY); ctx.lineTo(cx + iconSize, iconY);
    ctx.moveTo(cx, iconY - iconSize); ctx.lineTo(cx, iconY + iconSize);
    ctx.stroke();

    // Cost label below the "+" icon
    ctx.font        = "bold 10px 'Courier New', monospace";
    ctx.textAlign   = "center";
    ctx.shadowColor = isHovered ? "rgba(0,229,255,0.8)" : "transparent";
    ctx.shadowBlur  = isHovered ? 6 : 0;
    ctx.fillStyle   = isHovered
      ? "rgba(0,229,255,1)"
      : `rgba(0,229,255,${0.55 + pulse * 0.25})`;
    ctx.fillText(`${cost}g`, cx, slotY + SLOT_H - 6);
    ctx.shadowBlur  = 0;
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

/**
 * Draws the heads-up display:
 *   Top-right:    score + turret count (secondary, dimmer)
 *   Bottom-center panel: WAVE | HP bar (with colored outline) | GOLD coin
 */
export function drawHUD(ctx, score, wave, turretCount, gold, baseHp) {
  ctx.save();

  // ── Top-right: score + turret count ─────────────────────────────────────────
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,229,255,0.45)";
  ctx.font      = "12px 'Courier New', monospace";
  ctx.fillText(`SCORE: ${score}`,         CANVAS_WIDTH - 14, 20);
  ctx.fillText(`TURRETS: ${turretCount}`, CANVAS_WIDTH - 14, 38);

  // ── Bottom-center panel ──────────────────────────────────────────────────────
  const panelW  = 440;
  const panelH  = 42;
  const panelX  = (CANVAS_WIDTH - panelW) / 2;
  const panelY  = CANVAS_HEIGHT - panelH - 8;
  const panelCY = panelY + panelH / 2;

  // Panel background + border
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,229,255,0.18)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.stroke();

  // ── Section 1: WAVE (left third) ────────────────────────────────────────────
  const s1cx = panelX + panelW / 6;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,229,255,0.5)";
  ctx.font      = "10px 'Courier New', monospace";
  ctx.fillText("WAVE", s1cx, panelCY - 6);
  ctx.fillStyle = COLORS.hud;
  ctx.font      = "bold 18px 'Courier New', monospace";
  ctx.fillText(`${wave}`, s1cx, panelCY + 10);

  // Divider 1
  ctx.strokeStyle = "rgba(0,229,255,0.18)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + panelW / 3, panelY + 6);
  ctx.lineTo(panelX + panelW / 3, panelY + panelH - 6);
  ctx.stroke();

  // ── Section 2: HP bar (middle third) ────────────────────────────────────────
  const hpFrac  = Math.max(0, baseHp / BASE_HP);
  const hpColor = hpFrac > 0.5 ? COLORS.hud : hpFrac > 0.25 ? "#ffab00" : "#ff1744";
  const s2cx    = panelX + panelW / 2;
  const barW    = panelW / 3 - 24;
  const barH    = 8;
  const barX    = s2cx - barW / 2;
  const barY    = panelCY - 4;

  // "BASE" label
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,229,255,0.5)";
  ctx.font      = "10px 'Courier New', monospace";
  ctx.fillText("BASE", s2cx, panelCY - 8);

  // Track
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(barX, barY, barW, barH);

  // Fill
  ctx.fillStyle = hpColor;
  ctx.fillRect(barX, barY, barW * hpFrac, barH);

  // Outline — color-coded so the border is always visible as HP changes
  ctx.strokeStyle = hpColor;
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);

  // "X / MAX" text below bar
  ctx.fillStyle = hpColor;
  ctx.font      = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${baseHp} / ${BASE_HP}`, s2cx, barY + barH + 10);

  // Divider 2
  ctx.strokeStyle = "rgba(0,229,255,0.18)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 2 * panelW / 3, panelY + 6);
  ctx.lineTo(panelX + 2 * panelW / 3, panelY + panelH - 6);
  ctx.stroke();

  // ── Section 3: GOLD (right third) ───────────────────────────────────────────
  const coinR = 9;
  const coinX = panelX + 5 * panelW / 6 - 26;
  const coinY = panelCY + 1;

  // Coin body
  ctx.shadowColor = "#ffd600";
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = "#ffd600";
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;

  // Inner ring
  ctx.strokeStyle = "#ff8f00";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR - 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // "G" glyph
  ctx.fillStyle = "#7a4000";
  ctx.font      = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("G", coinX, coinY + 3);

  // Amount
  ctx.shadowColor = "#ffd600";
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = "#ffd600";
  ctx.font        = "bold 18px 'Courier New', monospace";
  ctx.textAlign   = "left";
  ctx.fillText(`${gold}`, coinX + coinR + 5, coinY + 7);
  ctx.shadowBlur  = 0;

  ctx.restore();
}
