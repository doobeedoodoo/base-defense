/**
 * Pure game-state update module.
 *
 * Nothing here touches React. The main component calls stepGame() each frame
 * and uses the returned events object to update React state / refs.
 */

import {
  CANVAS_WIDTH,
  BASE_X,
  GUN_WIDTH,
  NUM_ROWS,
  getRowY,
  SPAWN_INTERVAL_BASE,
  ALIEN_SPEED_BASE,
  ALIEN_TIER_SIZES,
  ELITE_CHANCE_PER_WAVE,
  ELITE_CHANCE_CAP,
  FIRE_INTERVAL,
  BULLET_SPEED,
  BULLET_RADIUS,
  UPGRADE_STATS,
  WAVE_THRESHOLD_START,
  WAVE_THRESHOLD_SCALE,
  WAVE_SPEED_INCREMENT,
  WAVE_SPAWN_DECREMENT,
  WAVE_SPAWN_MIN,
  WAVE_BONUS_BASE,
  PASSIVE_GOLD_BASE,
  PASSIVE_GOLD_SCALE,
  BASE_HP,
  COLORS,
} from "./constants";

// ─── Explosion visual params by tier ─────────────────────────────────────────

/**
 * Per-tier death/hit visual parameters.
 * Index matches alien.tier (1–4). Index 0 is unused (no tier 0 aliens).
 *
 * For tier 1 the glow color is null — the caller substitutes the alien's
 * individual body color (ALIEN_COLORS[a.type % 3]).
 */
const TIER_FX = [
  null,
  { glow: null,             deathCount: 8,  spread: 2,   maxPx: 3 }, // tier 1
  { glow: COLORS.tier2Glow, deathCount: 12, spread: 2.5, maxPx: 4 }, // tier 2
  { glow: COLORS.eliteGlow, deathCount: 18, spread: 3,   maxPx: 5 }, // tier 3
  { glow: COLORS.tier4Glow, deathCount: 26, spread: 4,   maxPx: 7 }, // tier 4
];

/** Tier-1 alien body colors (cycled by alien.type). */
const ALIEN_COLORS = [COLORS.alien1, COLORS.alien2, COLORS.alien3];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a fresh game-state object for the start of a new run.
 * Pass this into the component's gameStateRef on game init.
 */
export function createInitialState() {
  return {
    turrets: [],
    bullets: [],
    aliens: [],
    explosions: [],
    lastSpawn: 0,
    tick: 0,
    wave: 1,
    aliensKilledInWave: 0,
    waveThreshold: WAVE_THRESHOLD_START,
    spawnInterval: SPAWN_INTERVAL_BASE,
    alienSpeed: ALIEN_SPEED_BASE,
    baseHp: BASE_HP,
    running: true,
  };
}

/**
 * Advance the game by one logic tick. Mutates `gs` in place.
 *
 * @param {object} gs  The mutable game-state object from gameStateRef.current.
 * @returns {{
 *   hitBase:     boolean,      // true if an alien reached the base this tick
 *   scoreGained: number,       // score delta this tick (add to running total)
 *   goldGained:  number,       // gold delta this tick: passive + kills + wave bonus
 *   newWave:     number|null   // new wave number if wave advanced, otherwise null
 * }}
 */
export function stepGame(gs) {
  gs.tick++;

  let scoreGained = 0;
  let goldGained  = 0;
  let newWave     = null;
  let killCount   = 0;
  let hitCount    = 0;

  // ── Passive income ─────────────────────────────────────────────────────────
  // Each turret earns PASSIVE_GOLD_BASE × PASSIVE_GOLD_SCALE^level gold/sec.
  // The loop runs at ~60 fps, so divide by 60 to get the per-tick rate.
  goldGained += gs.turrets.reduce(
    (sum, t) => sum + PASSIVE_GOLD_BASE * Math.pow(PASSIVE_GOLD_SCALE, t.level ?? 0) / 60,
    0
  );

  // ── Fire turrets ───────────────────────────────────────────────────────────
  gs.turrets.forEach((turret) => {
    const stats = UPGRADE_STATS[turret.level ?? 0];
    // Divide by 16 because the game loop runs at ~60fps but intervals are in ms;
    // ticks ≈ frames, so ms/16 ≈ frames at 60fps.
    const fireThreshold = (FIRE_INTERVAL * stats.fireRateMult) / 16;

    if (gs.tick - turret.lastFire > fireThreshold) {
      gs.bullets.push({
        x: BASE_X + GUN_WIDTH + 18,
        y: turret.y,
        id: gs.tick + turret.rowIndex * 0.001, // unique enough for React keys
        damage: stats.damage,
      });
      turret.lastFire   = gs.tick;
      turret.muzzleFlash = 1;
    }

    // Decay muzzle flash each tick
    if (turret.muzzleFlash > 0) {
      turret.muzzleFlash = Math.max(0, turret.muzzleFlash - 0.12);
    }
  });

  // ── Move bullets; discard those that fly off screen ───────────────────────
  gs.bullets = gs.bullets.filter((b) => {
    b.x += BULLET_SPEED;
    return b.x < CANVAS_WIDTH + 10;
  });

  // ── Spawn one alien per interval ──────────────────────────────────────────
  if (gs.tick - gs.lastSpawn > gs.spawnInterval / 16) {
    spawnAlien(gs);
    gs.lastSpawn = gs.tick;
  }

  // ── Move aliens toward the base; deal damage when one reaches the wall ───
  let hitBase     = false;
  let baseDmgTaken = 0;
  gs.aliens = gs.aliens.filter((a) => {
    a.x -= a.speed;
    if (a.x - a.size / 2 <= BASE_X) {
      gs.baseHp  -= 1;
      baseDmgTaken++;
      if (gs.baseHp <= 0) hitBase = true;
      return false; // remove alien that reached the wall
    }
    return true;
  });

  // ── Bullet–alien collision ─────────────────────────────────────────────────
  const newExplosions = [];
  gs.aliens = gs.aliens.filter((a) => {
    for (let i = gs.bullets.length - 1; i >= 0; i--) {
      const b  = gs.bullets[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.sqrt(dx * dx + dy * dy) >= a.size / 2 + BULLET_RADIUS) continue;

      // Hit detected — consume bullet
      gs.bullets.splice(i, 1);
      a.hp -= b.damage ?? 1;

      const fx        = TIER_FX[a.tier];
      const glowColor = a.tier === 1 ? ALIEN_COLORS[a.type % 3] : fx.glow;

      if (a.hp > 0) {
        // Alien survived — emit a small spark at the impact point
        hitCount++;
        newExplosions.push(makeHitSpark(b.x, b.y, glowColor));
        break; // bullet is gone, stop checking more bullets against this alien
      }

      // Alien killed — emit a full death burst and award resources
      killCount++;
      newExplosions.push(makeDeathBurst(a.x, a.y, glowColor, fx));

      // 1 gold per HP of the dead alien; 10 score per HP
      goldGained  += a.maxHp;
      scoreGained += a.maxHp * 10;

      // Check wave progression
      gs.aliensKilledInWave++;
      if (gs.aliensKilledInWave >= gs.waveThreshold) {
        gs.wave++;
        gs.aliensKilledInWave = 0;
        gs.waveThreshold      = Math.floor(gs.waveThreshold * WAVE_THRESHOLD_SCALE);
        gs.spawnInterval      = Math.max(WAVE_SPAWN_MIN, gs.spawnInterval - WAVE_SPAWN_DECREMENT);
        gs.alienSpeed         += WAVE_SPEED_INCREMENT;
        newWave = gs.wave;

        // Wave-clear bonus: floor(WAVE_BONUS_BASE × wave × log2(wave+1))
        goldGained += Math.floor(WAVE_BONUS_BASE * gs.wave * Math.log2(gs.wave + 1));
      }

      return false; // alien removed
    }
    return true;
  });

  // ── Age and prune explosions ───────────────────────────────────────────────
  gs.explosions.push(...newExplosions);
  gs.explosions = gs.explosions.filter((e) => {
    e.life -= 0.035;
    return e.life > 0;
  });

  return { hitBase, scoreGained, goldGained, newWave, baseDmgTaken, killCount, hitCount };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/** Spawns a single alien into gs.aliens based on current wave difficulty. */
function spawnAlien(gs) {
  const rowIndex    = Math.floor(Math.random() * NUM_ROWS);
  const y           = getRowY(rowIndex);

  // Elite (multi-HP) probability grows linearly with wave number up to the cap.
  const eliteChance = Math.min(
    ELITE_CHANCE_CAP,
    Math.max(0, (gs.wave - 1) * ELITE_CHANCE_PER_WAVE)
  );
  const isElite = Math.random() < eliteChance;

  // HP determines visual tier (see ALIEN_TIER_SIZES comment in constants.js).
  const maxHp = isElite ? Math.min(12, 1 + Math.floor(gs.wave * 0.5)) : 1;
  const tier  = maxHp <= 1 ? 1 : maxHp <= 3 ? 2 : maxHp <= 6 ? 3 : 4;
  const size  = ALIEN_TIER_SIZES[tier];

  // Higher-tier aliens move slower to compensate for their extra HP budget.
  const speedMults = [1, 1, 0.85, 0.72, 0.6];
  const speed = (gs.alienSpeed + Math.random() * 0.5) * speedMults[tier];

  gs.aliens.push({
    x: CANVAS_WIDTH + size, // spawn just off the right edge
    y,
    rowIndex,
    type:  Math.floor(Math.random() * 3), // selects shape/color variant for tier 1
    speed,
    id:    gs.tick + Math.random(),       // stable key for rendering
    hp:    maxHp,
    maxHp,
    tier,
    size,
  });
}

/** Creates a small particle burst at a bullet impact point (alien survived). */
function makeHitSpark(x, y, color) {
  return {
    x, y,
    life: 0.5, maxLife: 0.5,
    particles: Array.from({ length: 5 }, () => ({
      vx:    (Math.random() - 0.5) * 2.5,
      vy:    (Math.random() - 0.5) * 2.5,
      size:  Math.random() * 2 + 0.5,
      color,
    })),
  };
}

/** Creates a large particle burst centered on a killed alien. */
function makeDeathBurst(x, y, color, fx) {
  return {
    x, y,
    life: 1, maxLife: 1,
    particles: Array.from({ length: fx.deathCount }, () => ({
      vx:    (Math.random() - 0.5) * fx.spread,
      vy:    (Math.random() - 0.5) * fx.spread,
      size:  Math.random() * fx.maxPx + 1,
      color,
    })),
  };
}
