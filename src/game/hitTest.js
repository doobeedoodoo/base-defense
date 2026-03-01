import {
  UPGRADE_BTN_X,
  SLOT_X,
  SLOT_W,
  SLOT_H,
  NUM_ROWS,
  getRowY,
} from "./constants";

/**
 * Returns the row index (0–7) that a canvas-space point falls on,
 * or -1 if the point is outside all interactive zones.
 *
 * Two zones are covered in a single pass:
 *   • Upgrade button zone  — x = UPGRADE_BTN_X .. UPGRADE_BTN_X+UPGRADE_BTN_W
 *                            (sits to the LEFT of the base wall)
 *   • Placement slot zone  — x = SLOT_X .. SLOT_X+SLOT_W
 *                            (sits to the RIGHT of the base wall)
 *
 * The caller decides which action to take based on whether the row already
 * has a turret (upgrade) or not (place).
 */
export function hitTestSlot(canvasX, canvasY) {
  // Reject points outside the combined x span of both zones
  if (canvasX < UPGRADE_BTN_X || canvasX > SLOT_X + SLOT_W) return -1;

  for (let i = 0; i < NUM_ROWS; i++) {
    const slotY = getRowY(i) - SLOT_H / 2;
    if (canvasY >= slotY && canvasY <= slotY + SLOT_H) return i;
  }

  return -1;
}
