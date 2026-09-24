import {MAX_TIER} from '../shared/tiers.ts'

/** Structured outcome Reddit returns for every Journey call. */
export type Receipt = {status: string; message: string}

/** Statuses that are routine and not worth a console warning. */
const EXPECTED = new Set([
  'JOURNEY_RECEIPT_VALID',
  'JOURNEY_RECEIPT_DENIED_DUPLICATE',
])

/**
 * Normalized Journey progress for reaching `tier`. Tier 1 is the animal players
 * drop, so tier 2 is the first milestone worth reporting and the whale is 1.
 */
export function tierProgress(tier: number): number {
  return (tier - 1) / (MAX_TIER - 1)
}

/**
 * Remembers what this round has already told Reddit. Telemetry is rate limited
 * and a round can produce hundreds of drops and merges, so the journey opens
 * once and each rung of the ladder is reported once.
 */
export class Round {
  #best = 1
  #started = false

  get best(): number {
    return this.#best
  }

  /** True on the drop that opens the journey, false for every drop after. */
  start(): boolean {
    if (this.#started) return false
    this.#started = true
    return true
  }

  /** The new best tier when `tier` beats everything so far, else undefined. */
  record(tier: number): number | undefined {
    if (tier <= this.#best) return
    this.#best = tier
    return tier
  }

  reset(): void {
    this.#best = 1
    this.#started = false
  }
}

/**
 * Runs Journey calls without letting them reach the game loop and warns once per
 * distinct problem. Playtest builds deny every event, so warning per call would
 * log on every drop.
 */
export class JourneyReporter {
  #warn: (msg: string) => void
  #warned = new Set<string>()

  constructor(warn: (msg: string) => void = console.warn) {
    this.#warn = warn
  }

  /** Never rejects. Telemetry must not be able to drop a frame. */
  async send(op: () => Promise<{receipt: Receipt}>): Promise<void> {
    let receipt: Receipt
    try {
      receipt = (await op()).receipt
    } catch (err) {
      this.#once('error', `journey call failed; ${err}`)
      return
    }
    if (!EXPECTED.has(receipt.status))
      this.#once(receipt.status, receipt.message)
  }

  #once(key: string, msg: string): void {
    if (this.#warned.has(key)) return
    this.#warned.add(key)
    this.#warn(msg)
  }
}
