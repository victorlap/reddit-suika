import {
  MERGE_POP_MS,
  MERGE_POP_SCALE,
  POPUP_MS,
  POPUP_PEAK_SCALE,
  POPUP_RISE,
  POPUP_SPRING_MS,
} from '../shared/config.ts'

/** A merge's score, waiting to float off the spot where it happened. */
export type ScorePopup = {points: number; x: number; y: number; bornMs: number}
/** A popup resolved for this frame. The renderer draws it and asks nothing. */
export type DrawnPopup = {
  text: string
  x: number
  y: number
  alpha: number
  scale: number
}

/**
 * Rises from 0 to 1 and falls back to 0 over the unit interval, and is exactly
 * 0 outside it. Both effects are a swell that has to land back where it
 * started, so they share this shape.
 */
function bump(t: number): number {
  if (t <= 0 || t >= 1) return 0
  return Math.sin(Math.PI * t)
}

/** Slows as it goes, so the number drifts rather than shoots off. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** How this popup looks now, or undefined once it has lived out its life. */
export function scorePopup(
  popup: ScorePopup,
  nowMs: number,
): DrawnPopup | undefined {
  const age = nowMs - popup.bornMs
  if (age < 0 || age >= POPUP_MS) return undefined
  const t = age / POPUP_MS
  return {
    text: `+${popup.points}`,
    x: popup.x,
    y: popup.y - POPUP_RISE * easeOut(t),
    // Hold it readable for the first half, then fade it out entirely.
    alpha: t < 0.5 ? 1 : Math.max(1 - (t - 0.5) / 0.5, 0),
    scale: 1 + (POPUP_PEAK_SCALE - 1) * bump(age / POPUP_SPRING_MS),
  }
}

/**
 * Size multiplier for an animal this long after it was merged into being.
 * Exactly 1 once the bounce is over, so a body never sits off its real radius.
 */
export function mergePopScale(ageMs: number): number {
  return 1 + (MERGE_POP_SCALE - 1) * bump(ageMs / MERGE_POP_MS)
}

/** Holds the effects a round has in flight and forgets them as they finish. */
export class Effects {
  #popups: ScorePopup[] = []
  #born = new Map<number, number>()

  /** Record a merge that made `bodyId` at (x, y) and scored `points`. */
  add(
    bodyId: number,
    points: number,
    x: number,
    y: number,
    nowMs: number,
  ): void {
    this.#popups.push({points, x, y, bornMs: nowMs})
    this.#born.set(bodyId, nowMs)
  }

  /** Called when physics drops a body, so finished ids cannot accumulate. */
  remove(bodyId: number): void {
    this.#born.delete(bodyId)
  }

  clear(): void {
    this.#popups = []
    this.#born.clear()
  }

  /** This frame's popups. Expired ones are dropped on the way past. */
  popups(nowMs: number): DrawnPopup[] {
    const drawn: DrawnPopup[] = []
    const alive: ScorePopup[] = []
    for (const popup of this.#popups) {
      const frame = scorePopup(popup, nowMs)
      if (!frame) continue
      alive.push(popup)
      drawn.push(frame)
    }
    this.#popups = alive
    return drawn
  }

  /** Body id to size multiplier, holding only the bodies still bouncing. */
  bodyScales(nowMs: number): Map<number, number> {
    const scales = new Map<number, number>()
    for (const [id, bornMs] of this.#born) {
      const age = nowMs - bornMs
      if (age >= MERGE_POP_MS) {
        this.#born.delete(id)
        continue
      }
      scales.set(id, mergePopScale(age))
    }
    return scales
  }
}
