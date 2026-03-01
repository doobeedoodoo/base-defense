import { COLORS } from "../game/constants";

/**
 * Full-canvas overlay shown before the game begins.
 * Fades in and presents instructions + a start button.
 *
 * @param {{ onStart: () => void }} props
 */
export default function StartScreen({ onStart }) {
  return (
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
      <div
        style={{
          color: COLORS.hud,
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: 6,
          marginBottom: 16,
        }}
      >
        BASE DEFENSE
      </div>

      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8 }}>
        Defend your base from alien invaders
      </div>

      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
        Click a row slot on the left to place a turret
      </div>

      <button
        onClick={onStart}
        style={{
          background:    "transparent",
          border:        `2px solid ${COLORS.hud}`,
          color:         COLORS.hud,
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
          e.target.style.background  = "rgba(0,229,255,0.15)";
          e.target.style.boxShadow   = "0 0 20px rgba(0,229,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background  = "transparent";
          e.target.style.boxShadow   = "none";
        }}
      >
        START MISSION
      </button>

      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 16 }}>
        or press SPACE
      </div>
    </div>
  );
}
