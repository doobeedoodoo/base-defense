import { COLORS } from "../game/constants";

/**
 * Full-canvas overlay displayed when an alien reaches the base.
 * Shows the run's final stats and a retry button.
 *
 * @param {{
 *   score:     number,
 *   gold:      number,
 *   wave:      number,
 *   highScore: number,
 *   onRetry:   () => void,
 * }} props
 */
export default function GameOverScreen({ score, gold, wave, highScore, onRetry }) {
  return (
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
      <div
        style={{
          color:        COLORS.danger,
          fontSize:     40,
          fontWeight:   900,
          letterSpacing: 6,
          marginBottom: 12,
        }}
      >
        BASE DESTROYED
      </div>

      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, marginBottom: 6 }}>
        Score:{" "}
        <span style={{ color: COLORS.hud, fontWeight: 700 }}>{score}</span>
      </div>

      <div
        style={{
          color:        "#ffd600",
          fontSize:     16,
          marginBottom: 6,
          textShadow:   "0 0 10px #ffd600",
        }}
      >
        Gold: <span style={{ fontWeight: 700 }}>{gold}</span>
      </div>

      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 6 }}>
        Wave Reached: {wave}
      </div>

      <div style={{ color: "rgba(255,171,0,0.7)", fontSize: 14, marginBottom: 28 }}>
        High Score: {highScore}
      </div>

      <button
        onClick={onRetry}
        style={{
          background:    "transparent",
          border:        `2px solid ${COLORS.danger}`,
          color:         COLORS.danger,
          padding:       "14px 48px",
          fontSize:      18,
          fontFamily:    "'Courier New', monospace",
          cursor:        "pointer",
          letterSpacing: 4,
          fontWeight:    700,
          borderRadius:  4,
          transition:    "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255,23,68,0.15)";
          e.target.style.boxShadow  = "0 0 20px rgba(255,23,68,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
          e.target.style.boxShadow  = "none";
        }}
      >
        RETRY
      </button>

      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 12 }}>
        or press SPACE
      </div>
    </div>
  );
}
