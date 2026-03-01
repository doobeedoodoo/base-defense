# Base Defense — Project Memory

## Build Command
```
PATH="/Users/mac/.nvm/versions/node/v24.14.0/bin:$PATH" /Users/mac/Projects/base-defense/node_modules/.bin/react-scripts build
```
Node binary: `/Users/mac/.nvm/versions/node/v24.14.0/bin/node`

## File Structure
```
src/
  BaseDefenseGame.jsx      — main React component (~220 lines)
  game/
    constants.js           — all game constants (marked [TWEAK])
    loop.js                — pure stepGame() / createInitialState()
    draw.js                — all canvas drawing functions
    hitTest.js             — hitTestSlot() for click/hover detection
  components/
    StartScreen.jsx
    GameOverScreen.jsx
```

## Economy System (V3 balance — implemented)
- **Starting gold**: 250g (fills ~4-5 lanes before wave 1)
- **Placement cost**: `floor(8 × 1.75^n)` → [8, 14, 24, 43, 75, 131, 230, 402]
- **Upgrade costs**: [12, 25, 50, 100, 200] (total 387g to max one turret)
- **Kill income**: 1 gold per alien HP killed
- **Wave-clear bonus**: `floor(10 × wave × log2(wave+1))`
- **Passive income**: `0.25 × 1.6^level` g/s per turret

## Key Architecture Notes
- Game state lives in `useRef` (avoids stale closures in rAF loop)
- `stepGame()` returns `{hitBase, scoreGained, goldGained, newWave}` — no React inside
- Turret placement now deducts gold (`PLACEMENT_COSTS[gs.turrets.length]`)
- Two hit zones: upgrade button (x=4..58, left of wall) and placement slot (x=65..115)
- `drawRows` receives `gold` to color upgrade/placement buttons by affordability

## Simulation
Balance simulation at `/tmp/balance_sim.js` — run with the node binary above.
V3 constants verified: cover-first player survives 100 waves; comfortable ~W20-W29.
