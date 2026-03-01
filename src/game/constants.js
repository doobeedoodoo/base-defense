// =============================================================================
// GAME CONSTANTS
// =============================================================================
// Constants marked with [TWEAK] are the primary knobs for adjusting difficulty,
// feel, and balance. Adjust those first before touching game logic.
//
// Economy constants are derived from simulation V3 (balance_sim.js at /tmp).
// The sim ran a cover-first greedy AI through 100 waves, targeting:
//   • Full 8-lane coverage by wave 6
//   • First "comfortable" state (DPS margin > 1×) around wave 20
//   • Unspendable gold wall at wave 22 → prestige mechanic trigger
// =============================================================================

// ─── Canvas ──────────────────────────────────────────────────────────────────

export const CANVAS_WIDTH  = 900;
export const CANVAS_HEIGHT = 560;

// ─── Layout ──────────────────────────────────────────────────────────────────

/** X position of the base wall. Everything left of this is the player's base. */
export const BASE_X = 60;

/** Number of lanes the player can defend. Changing this also changes ROW_HEIGHT. */
export const NUM_ROWS = 8; // [TWEAK] fewer rows = easier to defend; more = harder

export const ROW_HEIGHT = (CANVAS_HEIGHT - 60) / NUM_ROWS;

/** Returns the vertical center (in canvas pixels) of lane i. */
export const getRowY = (i) => 30 + ROW_HEIGHT * (i + 0.5);

// Placement slot — the clickable area right of the base wall used to deploy turrets.
export const SLOT_X = BASE_X + 5;
export const SLOT_W = 50;
export const SLOT_H = 36;

// Upgrade button — sits to the LEFT of the base wall (x=4..58) on occupied rows.
export const UPGRADE_BTN_X = 4;
export const UPGRADE_BTN_W = 54; // right edge = UPGRADE_BTN_X + UPGRADE_BTN_W = 58

// ─── Economy ─────────────────────────────────────────────────────────────────

/**
 * [TWEAK] Gold given to the player at the start of every run.
 * 250 buys the first 4–5 turrets immediately, giving ~50-63% lane coverage
 * before the first alien spawns.
 */
export const STARTING_GOLD = 250;

/**
 * [TWEAK] Placement cost formula base and scale factor.
 * Cost to place the nth turret = floor(PLACE_BASE × PLACE_SCALE^n).
 * PLACEMENT_COSTS is the pre-computed lookup table (index = turrets already placed).
 *
 * V3 curve: 8, 14, 24, 43, 75, 131, 230, 402
 * (All 8 slots total: 927g — reachable over the first ~10 waves)
 */
// Formula reference for simulation: floor(PLACE_BASE × PLACE_SCALE^n)
// Actual in-game costs are hand-tuned round numbers derived from that curve
// so that slot 7 is reachable by wave 2–3 rather than wave 4+.
export const PLACE_BASE  = 8;    // kept for simulation / documentation
export const PLACE_SCALE = 1.75; // kept for simulation / documentation

/**
 * [TWEAK] Gold cost to place the nth turret (index = turrets already placed).
 * 250g starting gold buys slots 0–4 (total 195g) with 55g to spare for upgrades.
 * Slot 5 (125g) is affordable within the first wave clear.
 * Slot 6 (175g) follows by wave 2.  Slot 7 (250g) by wave 3–4.
 */
export const PLACEMENT_COSTS = [10, 20, 35, 55, 75, 125, 175, 250];

/**
 * [TWEAK] Wave-clear bonus gold formula multiplier.
 * Bonus = floor(WAVE_BONUS_BASE × wave × log2(wave+1)).
 * At W1: 10g, W5: 128g, W10: 345g, W20: 1,006g.
 * Kept low so kill income dominates; bonus is a reward, not the main income stream.
 */
export const WAVE_BONUS_BASE = 10;

/**
 * [TWEAK] Passive gold per second earned by a turret at level L:
 *   PASSIVE_GOLD_BASE × PASSIVE_GOLD_SCALE^L
 * L0: 0.25 g/s, L3: 1.02 g/s, L5: 2.62 g/s.
 * Fills dead air between wave kills; not a dominant income source.
 */
export const PASSIVE_GOLD_BASE  = 0.25; // [TWEAK]
export const PASSIVE_GOLD_SCALE = 1.6;  // [TWEAK]

// ─── Enemy difficulty ─────────────────────────────────────────────────────────

/**
 * [TWEAK] Starting delay (ms) between alien spawns at wave 1.
 * Higher = more breathing room at the start.
 */
export const SPAWN_INTERVAL_BASE = 1700;

/**
 * [TWEAK] Base alien movement speed (px per logic tick).
 * This is the floor — actual speed has a random ±0.5 component added on spawn.
 */
export const ALIEN_SPEED_BASE = 0.5;

/**
 * [TWEAK] How much the probability of spawning an elite (multi-HP) alien
 * increases per wave. At wave W the chance is:
 *   min(ELITE_CHANCE_CAP, (W-1) × ELITE_CHANCE_PER_WAVE)
 * Lowered from 0.05 → 0.035 so players get more normal-alien waves early
 * to accumulate gold before elites demand upgraded turrets.
 */
export const ELITE_CHANCE_PER_WAVE = 0.035; // [TWEAK]

/**
 * [TWEAK] Maximum fraction of spawned aliens that can be elite, regardless
 * of how high the wave number climbs. Keeps late-game manageable.
 * Lowered from 0.35 → 0.28.
 */
export const ELITE_CHANCE_CAP = 0.28; // [TWEAK]

/**
 * [TWEAK] Number of alien kills needed to complete the first wave.
 * Each subsequent wave threshold is multiplied by WAVE_THRESHOLD_SCALE.
 */
export const WAVE_THRESHOLD_START = 8;

/** [TWEAK] Multiplier applied to the kill threshold after each wave advance. */
export const WAVE_THRESHOLD_SCALE = 1.2;

/**
 * [TWEAK] How much alien speed increases each wave advance (px/tick).
 * Lowered from 0.2 → 0.12 for a smoother ramp; prevents abrupt DPS cliffs
 * between waves and gives speed/DPS requirements a more linear feel.
 */
export const WAVE_SPEED_INCREMENT = 0.12; // [TWEAK]

/**
 * [TWEAK] How many ms are shaved off the spawn interval each wave.
 * Lowered from 250 → 120 so the spawn rate doesn't hit minimum
 * until ~wave 12, giving players time to build economy before the rush.
 */
export const WAVE_SPAWN_DECREMENT = 120; // [TWEAK]

/**
 * [TWEAK] Hard floor for spawn interval (ms). Aliens will never spawn
 * faster than this no matter how high the wave number gets.
 * Raised from 150 → 250 to guarantee a brief reaction window at high waves.
 */
export const WAVE_SPAWN_MIN = 250; // [TWEAK]

// ─── Base ─────────────────────────────────────────────────────────────────────

/**
 * [TWEAK] Number of alien hits the base can absorb before game over.
 * Each alien that reaches the wall deals 1 damage regardless of its tier.
 * 10 HP ≈ 2–3 waves of uncovered-lane traffic, giving the player time to
 * fill their last few slots before losing.
 */
export const BASE_HP = 10;

// ─── Turret ──────────────────────────────────────────────────────────────────

/** Pixel width of the gun barrel sprite. */
export const GUN_WIDTH = 48;

/**
 * [TWEAK] Base fire interval in ms between shots (at upgrade level 0).
 * UPGRADE_STATS.fireRateMult is applied as a multiplier on top of this.
 * Lower = faster shooting base turret.
 */
export const FIRE_INTERVAL = 1680;

/**
 * [TWEAK] Minimum ms between consecutive turret placements.
 * Gold cost is the primary placement limiter; this short cooldown just
 * prevents accidental double-clicks and enforces deliberate pacing.
 * Reduced from 3000 → 500 now that gold gates placement.
 */
export const TURRET_COOLDOWN_MS = 500; // [TWEAK]

// ─── Bullet ──────────────────────────────────────────────────────────────────

/** [TWEAK] Bullet travel speed in canvas pixels per frame. */
export const BULLET_SPEED = 8;

/** Collision radius of bullets in pixels. */
export const BULLET_RADIUS = 4;

// ─── Aliens ──────────────────────────────────────────────────────────────────

/** Visual size of a tier-1 (basic) alien, used in its draw function. */
export const ALIEN_SIZE = 28;

/**
 * Pixel radius of each alien tier's hitbox/sprite.
 * Index 0 is unused (no tier 0); indices 1–4 map to the four visual tiers.
 *
 * Tier 1 = basic, Tier 2 = armored, Tier 3 = elite, Tier 4 = brute.
 * An alien's tier is derived from its HP at spawn time:
 *   HP 1       → tier 1
 *   HP 2–3     → tier 2
 *   HP 4–6     → tier 3
 *   HP 7–12    → tier 4
 */
export const ALIEN_TIER_SIZES = [0, 28, 34, 42, 54];

// ─── Upgrade system ──────────────────────────────────────────────────────────

/**
 * [TWEAK] Gold cost to advance a turret from its current level to the next.
 * Index = turret's CURRENT level (0 = base → costs 12g to reach level 1).
 *
 * Formula basis: floor(PLACE_COST(slot0) × 1.4 × 2.1^level)
 * Total cost to fully upgrade: 12+25+50+100+200 = 387g.
 * Scaled up from old [10,20,30,40,50] to match the new gold economy where
 * players earn hundreds of gold per wave rather than tens.
 */
export const UPGRADE_COSTS = [12, 25, 50, 100, 200]; // [TWEAK]

/**
 * [TWEAK] Per-level turret stats. Index = turret level (0 = base).
 *
 * fireRateMult: multiplied against FIRE_INTERVAL. Values < 1 shoot faster.
 *   e.g. 0.80 → fires 25% faster than base; 0.36 → fires ~2.8× faster.
 *
 * damage: HP removed from an alien per bullet hit.
 *
 * DPS relative to level 0:
 *   Level 0: 1.00×   Level 1: 1.25×   Level 2: 1.61×
 *   Level 3: 3.64×   Level 4: 4.55×   Level 5: 8.33×
 */
export const UPGRADE_STATS = [
  { fireRateMult: 1.00, damage: 1 }, // level 0 — base
  { fireRateMult: 0.80, damage: 1 }, // level 1 — slightly faster
  { fireRateMult: 0.62, damage: 1 }, // level 2 — noticeably faster
  { fireRateMult: 0.55, damage: 2 }, // level 3 — double damage
  { fireRateMult: 0.44, damage: 2 }, // level 4 — rapid double damage
  { fireRateMult: 0.36, damage: 3 }, // level 5 — elite rapid triple damage
];

// ─── Colors ──────────────────────────────────────────────────────────────────

export const COLORS = {
  // Environment
  bg:          "#0a0e17",
  stars:       "#ffffff",
  base:        "#00e5ff",
  danger:      "#ff1744",

  // HUD
  hud:         "#00e5ff",

  // Turret
  gun:         "#e0e0e0",
  gunBarrel:   "#ff6f00",
  bullet:      "#ffab00",

  // Alien tier 1 (three shape variants)
  alien1:      "#76ff03",
  alien2:      "#ff1744",
  alien3:      "#d500f9",

  // Alien tier 2 (armored)
  tier2Body:   "#0d1f2d",
  tier2Armor:  "#00b0ff",
  tier2Glow:   "#40c4ff",

  // Alien tier 3 (elite) — reuses elite palette
  eliteBody:   "#7f2600",
  eliteArmor:  "#ff6d00",
  eliteGlow:   "#ff9800",

  // Alien tier 4 (brute)
  tier4Body:   "#2a0000",
  tier4Armor:  "#b71c1c",
  tier4Glow:   "#ff5252",
};
