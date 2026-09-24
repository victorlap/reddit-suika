import {telemetry} from '@devvit/analytics/client/reddit'
import {MAX_TIER, tierName} from '../shared/tiers.ts'
import {JourneyReporter, Round, tierProgress} from './journey.ts'

const reporter = new JourneyReporter()
const round = new Round()

/** Sprites are loaded and the canvas accepts input. */
export function appReady(): void {
  void reporter.send(() => telemetry.appReady())
}

/**
 * The player released an animal. Only the first release of a round opens the
 * journey: Reddit requires Journey.Start to be a committed action, never a view.
 */
export function dropped(): void {
  if (round.start()) void reporter.send(() => telemetry.startJourney())
}

/** A merge produced `tier`, reported only when it beats the round's best. */
export function merged(tier: number): void {
  const best = round.record(tier)
  if (best === undefined) return
  void reporter.send(() =>
    telemetry.progress({
      progress: tierProgress(best),
      action: 'tier_reached',
      actionDetails: tierName(best),
    }),
  )
}

/**
 * The pile crossed the danger line. Every round ends this way, so counting them
 * all as complete would peg the dashboard's completion rate at 100%. Making a
 * whale is the objective, so that is what counts as finishing.
 */
export function gameOver(score: number): void {
  const win = round.best >= MAX_TIER
  void reporter.send(() =>
    telemetry.endJourney({complete: win, game: {win, score}}),
  )
  round.reset()
}

export function playedAgain(): void {
  void reporter.send(() => telemetry.interaction({action: 'play_again'}))
}
