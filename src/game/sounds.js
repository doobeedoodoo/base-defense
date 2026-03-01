/**
 * Web Audio API sound effects and background music.
 *
 * All audio is synthesised on-the-fly — no external files required.
 * The AudioContext is created lazily inside startMusic(), which must be
 * called from a user-gesture handler so the browser allows it to run.
 */

let ac = null;

function getCtx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === "suspended") ac.resume();
  return ac;
}

// ─── SFX ──────────────────────────────────────────────────────────────────────

/**
 * Descending sawtooth sweep mixed with noise — scales with alien tier.
 * Higher tiers produce a lower, heavier thud.
 */
export function playAlienKilled(tier = 1) {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const dur = 0.09 + (tier - 1) * 0.02;

    const osc  = ctx.createOscillator();
    osc.type   = "sawtooth";
    osc.frequency.setValueAtTime(480 - (tier - 1) * 70, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + dur);

    const nLen  = Math.ceil(ctx.sampleRate * dur);
    const nBuf  = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nData[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.38 + (tier - 1) * 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    noise.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
    noise.start(now);
  } catch (_) {}
}

/** Short descending triangle tick — bullet impact on a surviving alien. */
export function playBulletHit() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type  = "triangle";
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.035);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  } catch (_) {}
}

/** Two quick ascending square-wave tones — confirms a turret placement. */
export function playTurretPlaced() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    [440, 660].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.10, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.055 + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.07);
    });
  } catch (_) {}
}

/**
 * Ascending sine arpeggio — note count grows with the new level,
 * so a level-5 upgrade sounds noticeably more impressive than level-1.
 */
export function playTurretUpgraded(newLevel = 1) {
  try {
    const ctx   = getCtx();
    const now   = ctx.currentTime;
    const freqs = [330, 415, 523, 659, 831, 1047];
    const count = Math.min(newLevel + 1, freqs.length);

    for (let i = 0; i < count; i++) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = "sine";
      osc.frequency.value = freqs[i];
      gain.gain.setValueAtTime(0.12, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.09);
    }
  } catch (_) {}
}

/** Four descending sawtooth notes — ominous game-over fanfare. */
export function playGameOver() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    [440, 330, 220, 110].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = "sawtooth";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, now + i * 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.28);
      osc.stop(now + i * 0.28 + 0.32);
    });
  } catch (_) {}
}

// ─── Background music ─────────────────────────────────────────────────────────

let musicHandle = null;

/**
 * Starts a looping procedural music track (A-minor, 128 BPM).
 * Instrumentation: bass line + melody + kick drum + hi-hat.
 *
 * Uses the Web Audio scheduling pattern: a lightweight scheduler fires every
 * 100 ms and queues notes up to 300 ms ahead, so timing is precise even if
 * the JS thread is briefly busy.
 *
 * Must be called from a user-gesture handler (button click / key press).
 * Automatically stops any already-playing music before starting.
 */
export function startMusic() {
  stopMusic();

  const ctx  = getCtx();
  const BPM  = 128;
  const STEP = 60 / BPM / 2; // 8th-note duration in seconds (~0.234 s)

  // A-minor pentatonic bass line — 8 steps, loops forever
  const bassLine = [110, 165,  98, 131, 110, 147,  98, 165];
  // Melody — played on every even bass step (quarter-note feel)
  const melLine  = [440, 330, 523, 392, 659, 523, 440, 330];

  let step  = 0;
  let nextT = ctx.currentTime + 0.05; // small delay so first note isn't clipped
  let alive = true;

  const schedule = () => {
    if (!alive) return;

    while (nextT < ctx.currentTime + 0.3) {
      const t  = nextT;
      const si = step % bassLine.length;

      // ── Bass: sawtooth through a lowpass, short envelope ──────────────────
      const bOsc  = ctx.createOscillator();
      const bFilt = ctx.createBiquadFilter();
      const bGain = ctx.createGain();
      bOsc.type             = "sawtooth";
      bOsc.frequency.value  = bassLine[si];
      bFilt.type            = "lowpass";
      bFilt.frequency.value = 600;
      bGain.gain.setValueAtTime(0.07, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.85);
      bOsc.connect(bFilt);
      bFilt.connect(bGain);
      bGain.connect(ctx.destination);
      bOsc.start(t);
      bOsc.stop(t + STEP * 0.85);

      // ── Melody: triangle wave, every other step ────────────────────────────
      if (si % 2 === 0) {
        const mOsc  = ctx.createOscillator();
        const mGain = ctx.createGain();
        mOsc.type            = "triangle";
        mOsc.frequency.value = melLine[si / 2];
        mGain.gain.setValueAtTime(0.06, t);
        mGain.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.7);
        mOsc.connect(mGain);
        mGain.connect(ctx.destination);
        mOsc.start(t);
        mOsc.stop(t + STEP * 1.7);
      }

      // ── Kick: sine frequency sweep on beats 1 and 3 (steps 0 and 4) ──────
      if (si === 0 || si === 4) {
        const kOsc  = ctx.createOscillator();
        const kGain = ctx.createGain();
        kOsc.type = "sine";
        kOsc.frequency.setValueAtTime(150, t);
        kOsc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        kGain.gain.setValueAtTime(0.18, t);
        kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        kOsc.connect(kGain);
        kGain.connect(ctx.destination);
        kOsc.start(t);
        kOsc.stop(t + 0.12);
      }

      // ── Hi-hat: short highpass-filtered noise, accented on beat ──────────
      const hLen  = Math.ceil(ctx.sampleRate * 0.035);
      const hBuf  = ctx.createBuffer(1, hLen, ctx.sampleRate);
      const hData = hBuf.getChannelData(0);
      for (let i = 0; i < hLen; i++) hData[i] = Math.random() * 2 - 1;
      const hSrc  = ctx.createBufferSource();
      const hFilt = ctx.createBiquadFilter();
      const hGain = ctx.createGain();
      hSrc.buffer            = hBuf;
      hFilt.type             = "highpass";
      hFilt.frequency.value  = 7000;
      hGain.gain.setValueAtTime(si % 2 === 0 ? 0.06 : 0.03, t);
      hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      hSrc.connect(hFilt);
      hFilt.connect(hGain);
      hGain.connect(ctx.destination);
      hSrc.start(t);

      nextT += STEP;
      step++;
    }

    setTimeout(schedule, 100);
  };

  schedule();
  musicHandle = { stop() { alive = false; musicHandle = null; } };
}

/** Stops the background music if it is currently playing. */
export function stopMusic() {
  if (musicHandle) musicHandle.stop();
}
