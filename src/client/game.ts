import {
  DANGER_Y,
  DROP_COOLDOWN_MS,
  GAME_OVER_GRACE_MS,
  MAX_PHYSICS_STEPS_PER_FRAME,
  PHYSICS_STEP_MS,
  WORLD,
} from '../shared/config.ts'
import {
  MAX_DROP_TIER,
  MAX_TIER,
  tierRadius,
  tierScore,
} from '../shared/tiers.ts'

export type BodyInfo = {id: number; tier: number; x: number; y: number}
export type CollisionPair = {a: BodyInfo; b: BodyInfo}
export type MergeResult = {
  remove: number[]
  spawn: {tier: number; x: number; y: number}[]
  scoreDelta: number
}
export type Phase = 'ready' | 'cooldown' | 'over'

/** Turn this frame's collisions into removals, spawns, and score. */
export function resolveMerges(pairs: readonly CollisionPair[]): MergeResult {
  const consumed = new Set<number>()
  const result: MergeResult = {remove: [], spawn: [], scoreDelta: 0}
  for (const {a, b} of pairs) {
    if (a.tier !== b.tier || a.tier >= MAX_TIER) continue
    if (consumed.has(a.id) || consumed.has(b.id)) continue
    consumed.add(a.id)
    consumed.add(b.id)
    const tier = a.tier + 1
    result.remove.push(a.id, b.id)
    result.spawn.push({tier, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2})
    result.scoreDelta += tierScore(tier)
  }
  return result
}

/** Keep the hovering animal fully inside the side walls. */
export function clampDropX(x: number, tier: number): number {
  const r = tierRadius(tier)
  return Math.min(Math.max(x, r), WORLD.width - r)
}

/** Fixed-step catch-up, capped so a background tab cannot explode on resume. */
export function physicsStepsFor(elapsedMs: number): number {
  return Math.min(
    Math.floor(elapsedMs / PHYSICS_STEP_MS),
    MAX_PHYSICS_STEPS_PER_FRAME,
  )
}

export class Game {
  phase: Phase = 'ready'
  score = 0
  /** Highest tier dropped or merged this round. */
  bestTier = 1
  current: number
  next: number
  #rng: () => number
  #cooldownUntil = 0
  #lastDrop: {id: number; atMs: number} | undefined
  #aboveSince = new Map<number, number>()

  constructor(rng: () => number = Math.random) {
    this.#rng = rng
    this.current = this.#rollTier()
    this.next = this.#rollTier()
  }

  /** Called when the player releases the current animal as body `bodyId`. */
  drop(nowMs: number, bodyId: number): void {
    if (this.phase !== 'ready') return
    this.phase = 'cooldown'
    this.#cooldownUntil = nowMs + DROP_COOLDOWN_MS
    this.#lastDrop = {id: bodyId, atMs: nowMs}
    this.bestTier = Math.max(this.bestTier, this.current)
    this.current = this.next
    this.next = this.#rollTier()
  }

  tick(nowMs: number): void {
    if (this.phase === 'cooldown' && nowMs >= this.#cooldownUntil)
      this.phase = 'ready'
  }

  applyMerges(pairs: readonly CollisionPair[]): MergeResult {
    const result = resolveMerges(pairs)
    this.score += result.scoreDelta
    for (const s of result.spawn)
      this.bestTier = Math.max(this.bestTier, s.tier)
    return result
  }

  /** True once any body has sat above the danger line for the grace period. */
  checkGameOver(bodies: readonly BodyInfo[], nowMs: number): boolean {
    if (this.phase === 'over') return true
    const seen = new Set<number>()
    for (const b of bodies) {
      if (b.y >= DANGER_Y) continue
      seen.add(b.id)
      // Bodies still in the drop cooldown window are not tracked yet, so the
      // above-line timer only starts once the cooldown has elapsed.
      const justDropped =
        this.#lastDrop?.id === b.id &&
        nowMs - this.#lastDrop.atMs < DROP_COOLDOWN_MS
      if (justDropped) continue
      const since = this.#aboveSince.get(b.id)
      if (since === undefined) {
        this.#aboveSince.set(b.id, nowMs)
      } else if (nowMs - since >= GAME_OVER_GRACE_MS) {
        this.phase = 'over'
        return true
      }
    }
    for (const id of this.#aboveSince.keys())
      if (!seen.has(id)) this.#aboveSince.delete(id)
    return false
  }

  /**
   * Give back time the player spent with the game paused. Without this, a body
   * that was already above the line ends the round the moment play resumes.
   */
  resumeAfter(pausedMs: number): void {
    for (const [id, since] of this.#aboveSince)
      this.#aboveSince.set(id, since + pausedMs)
  }

  reset(): void {
    this.phase = 'ready'
    this.score = 0
    this.bestTier = 1
    this.#cooldownUntil = 0
    this.#lastDrop = undefined
    this.#aboveSince.clear()
    this.current = this.#rollTier()
    this.next = this.#rollTier()
  }

  #rollTier(): number {
    return (
      1 + Math.min(MAX_DROP_TIER - 1, Math.floor(this.#rng() * MAX_DROP_TIER))
    )
  }
}
