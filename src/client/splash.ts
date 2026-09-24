import {context, requestExpandedMode} from '@devvit/web/client'
import {DROP_Y, MERGE_POP_VELOCITY, PHYSICS_STEP_MS} from '../shared/config.ts'
import {fetchLeaderboard} from './api.ts'
import {physicsStepsFor, resolveMerges} from './game.ts'
import {Physics} from './physics.ts'
import {loadSprites, Renderer} from './render.ts'

type Drop = {tier: number; x: number}

/**
 * The card opens part-way through a game: the first DEMO_SEEDED of these are
 * already settled when it paints, and the rest fall in while you read. Tiers
 * and positions are spread so the opening board keeps its animals instead of
 * cascading itself empty, and so the pile spreads across the floor rather than
 * stacking toward the danger line.
 */
const DEMO_DROPS: readonly Drop[] = [
  {tier: 5, x: 60},
  {tier: 3, x: 150},
  {tier: 4, x: 240},
  {tier: 2, x: 330},
  {tier: 1, x: 110},
  {tier: 5, x: 190},
  {tier: 3, x: 300},
  {tier: 4, x: 80},
  {tier: 2, x: 200},
  {tier: 1, x: 350},
  {tier: 3, x: 40},
  {tier: 2, x: 270},
  {tier: 5, x: 200},
  {tier: 2, x: 300},
  {tier: 2, x: 340},
  {tier: 3, x: 70},
  {tier: 4, x: 190},
  {tier: 1, x: 300},
]
/** How many of them are already on the floor before the first frame. */
const DEMO_SEEDED = 12
/** Gap between drops. Shorter than the game's cooldown: this is a trailer. */
const DEMO_INTERVAL_MS = 240
/** The animal left hovering once the opening is done, waiting for a player. */
const DEMO_HOVER: Drop = {tier: 2, x: 200}
/** How long a run gets after its last drop, by when the pile has settled. */
const DEMO_SETTLE_MS = 2500

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
startBtn.addEventListener('click', ev => requestExpandedMode(ev, 'game'))

const beatEl = document.getElementById('beat') as HTMLParagraphElement

async function renderBeat(): Promise<void> {
  const postData = context.postData
  const challenger = postData?.challenger
  const target = postData?.target
  if (typeof challenger === 'string' && typeof target === 'number') {
    beatEl.textContent = `u/${challenger} scored ${target}. Beat it.`
    return
  }
  const board = await fetchLeaderboard()
  if (!board) {
    beatEl.textContent = 'Could not load the scores.'
    return
  }
  const top = board.entries[0]
  beatEl.textContent = top
    ? `Score to beat: ${top.score} by u/${top.username}`
    : 'No scores yet. Go first.'
}

async function runDemo(): Promise<void> {
  const canvas = document.getElementById('demo') as HTMLCanvasElement
  const sprites = await loadSprites()
  // No chain strip here: the card has room for the bucket, not the whole HUD.
  const renderer = new Renderer(canvas, sprites, {chain: false})
  const physics = new Physics()
  let accumulator = 0
  let dropped = 0
  let score = 0
  let bestTier = 1
  let running = true

  /** Advance the world one fixed step, settling whatever merges it caused. */
  function step(): void {
    const merges = resolveMerges(physics.step(PHYSICS_STEP_MS))
    score += merges.scoreDelta
    for (const id of merges.remove) physics.remove(id)
    for (const s of merges.spawn) {
      physics.spawn(s.tier, s.x, s.y, MERGE_POP_VELOCITY)
      bestTier = Math.max(bestTier, s.tier)
    }
  }

  /**
   * Release every drop the schedule is due, where `simMs` is time since the
   * run's first hover and `offset` the drops that ran before it.
   */
  function dropsDue(simMs: number, limit: number, offset: number): void {
    // One interval of hover before each drop, including the first.
    while (
      dropped < limit &&
      simMs >= (dropped - offset + 1) * DEMO_INTERVAL_MS
    ) {
      const next = DEMO_DROPS[dropped]
      if (next) physics.spawn(next.tier, next.x, DROP_Y)
      dropped++
    }
  }

  // Open on a board someone has already been playing: the seeded drops run
  // through the same simulation here, off-screen, so the first frame paints a
  // settled pile instead of an empty bucket.
  const seedMs = DEMO_SEEDED * DEMO_INTERVAL_MS + DEMO_SETTLE_MS
  for (let t = PHYSICS_STEP_MS; t <= seedMs; t += PHYSICS_STEP_MS) {
    dropsDue(t, DEMO_SEEDED, 0)
    step()
  }

  const runMs =
    (DEMO_DROPS.length - DEMO_SEEDED) * DEMO_INTERVAL_MS + DEMO_SETTLE_MS
  const start = performance.now()
  let last = start

  window.addEventListener('resize', () => {
    renderer.resize()
    // The loop stops once the pile settles, so a late resize has to repaint.
    if (!running) draw()
  })

  function draw(): void {
    renderer.draw({
      bodies: physics.bodies(),
      hover: DEMO_DROPS[dropped] ?? DEMO_HOVER,
      nextTier: DEMO_DROPS[dropped + 1]?.tier ?? DEMO_HOVER.tier,
      bestTier,
      score,
      // Nothing is at stake on the card, so the line never flashes red.
      danger: false,
    })
  }

  function frame(now: number): void {
    const elapsed = now - start
    accumulator = Math.min(accumulator + (now - last), PHYSICS_STEP_MS * 10)
    last = now

    dropsDue(elapsed, DEMO_DROPS.length, DEMO_SEEDED)

    const steps = physicsStepsFor(accumulator)
    accumulator -= steps * PHYSICS_STEP_MS
    for (let i = 0; i < steps; i++) step()

    draw()
    running = elapsed < runMs
    if (running) requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void renderBeat()
void runDemo()
