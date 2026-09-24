import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  DANGER_Y,
  DROP_COOLDOWN_MS,
  GAME_OVER_GRACE_MS,
  MAX_PHYSICS_STEPS_PER_FRAME,
  PHYSICS_STEP_MS,
  WORLD,
} from '../shared/config.ts'
import {MAX_DROP_TIER, MAX_TIER, tierRadius} from '../shared/tiers.ts'
import {
  type BodyInfo,
  clampDropX,
  Game,
  physicsStepsFor,
  resolveMerges,
} from './game.ts'

function body(id: number, tier: number, x = 0, y = 300): BodyInfo {
  return {id, tier, x, y}
}

test('two same-tier animals merge into one of the next tier at their midpoint and score', () => {
  const r = resolveMerges([{a: body(1, 2, 100, 300), b: body(2, 2, 140, 320)}])
  assert.deepEqual(r.remove.sort(), [1, 2])
  assert.deepEqual(r.spawn, [{tier: 3, x: 120, y: 310}])
  assert.equal(r.scoreDelta, 6)
})

test('different tiers touching do not merge', () => {
  const r = resolveMerges([{a: body(1, 2), b: body(2, 3)}])
  assert.deepEqual(r, {remove: [], spawn: [], scoreDelta: 0})
})

test('two whales do not merge because there is no bigger animal', () => {
  const r = resolveMerges([{a: body(1, MAX_TIER), b: body(2, MAX_TIER)}])
  assert.deepEqual(r, {remove: [], spawn: [], scoreDelta: 0})
})

test('a body touching two same-tier bodies in one tick merges only once', () => {
  const r = resolveMerges([
    {a: body(1, 1, 0, 0), b: body(2, 1, 10, 0)},
    {a: body(2, 1, 10, 0), b: body(3, 1, 20, 0)},
  ])
  assert.deepEqual(r.remove.sort(), [1, 2])
  assert.equal(r.spawn.length, 1)
  assert.equal(r.scoreDelta, 3)
})

test('dropping starts a cooldown, then the game is ready again', () => {
  const g = new Game(() => 0)
  assert.equal(g.phase, 'ready')
  g.drop(1000, 7)
  assert.equal(g.phase, 'cooldown')
  g.tick(1000 + DROP_COOLDOWN_MS - 1)
  assert.equal(g.phase, 'cooldown')
  g.tick(1000 + DROP_COOLDOWN_MS)
  assert.equal(g.phase, 'ready')
})

test('dropped tiers always come from the five smallest animals', () => {
  for (const roll of [0, 0.2, 0.5, 0.8, 0.999]) {
    const g = new Game(() => roll)
    assert.ok(
      g.current >= 1 && g.current <= MAX_DROP_TIER,
      `current ${g.current}`,
    )
    assert.ok(g.next >= 1 && g.next <= MAX_DROP_TIER, `next ${g.next}`)
  }
})

test('after a drop the previewed next animal becomes current', () => {
  let n = 0
  const g = new Game(() => [0.1, 0.9, 0.5][n++ % 3] ?? 0)
  const previewed = g.next
  g.drop(0, 1)
  assert.equal(g.current, previewed)
})

test('applyMerges adds to the running score', () => {
  const g = new Game(() => 0)
  g.applyMerges([{a: body(1, 1), b: body(2, 1)}])
  g.applyMerges([{a: body(3, 4), b: body(4, 4)}])
  assert.equal(g.score, 3 + 15)
})

test('a body above the danger line for a full second ends the game, a brief bounce does not', () => {
  const g = new Game(() => 0)
  const above = [body(1, 1, 200, DANGER_Y - 5)]
  assert.equal(g.checkGameOver(above, 0), false)
  assert.equal(g.checkGameOver(above, GAME_OVER_GRACE_MS - 1), false)
  assert.equal(
    g.checkGameOver([body(1, 1, 200, DANGER_Y + 50)], GAME_OVER_GRACE_MS),
    false,
  )
  assert.equal(g.checkGameOver(above, GAME_OVER_GRACE_MS + 10), false)
  assert.equal(g.checkGameOver(above, 2 * GAME_OVER_GRACE_MS + 10), true)
  assert.equal(g.phase, 'over')
})

test('the animal just dropped is ignored for game over while it falls through the danger zone', () => {
  const g = new Game(() => 0)
  g.drop(0, 42)
  const falling = [body(42, 1, 200, DANGER_Y - 20)]
  assert.equal(g.checkGameOver(falling, 0), false)
  assert.equal(g.checkGameOver(falling, DROP_COOLDOWN_MS - 1), false)
  // Still above the line long after the cooldown: now it counts.
  assert.equal(g.checkGameOver(falling, DROP_COOLDOWN_MS), false)
  assert.equal(
    g.checkGameOver(falling, DROP_COOLDOWN_MS + GAME_OVER_GRACE_MS),
    true,
  )
})

test('the drop cooldown delays when the above-line timer starts, not just the game-over decision', () => {
  const g = new Game(() => 0)
  g.drop(0, 42)
  const hovering = [body(42, 1, 200, DANGER_Y - 5)]
  // Still within the cooldown: the timer has not started yet.
  assert.equal(g.checkGameOver(hovering, DROP_COOLDOWN_MS - 100), false)
  // First tick after the cooldown ends: tracking starts now, not at the drop.
  assert.equal(g.checkGameOver(hovering, GAME_OVER_GRACE_MS), false)
  // A full GAME_OVER_GRACE_MS after the drop (i.e. right when a timer that
  // started at drop time would have fired) must still be false, since
  // tracking only began at GAME_OVER_GRACE_MS above.
  assert.equal(g.checkGameOver(hovering, 2 * GAME_OVER_GRACE_MS - 1), false)
  assert.equal(g.checkGameOver(hovering, 2 * GAME_OVER_GRACE_MS), true)
})

test('drop x is clamped so the animal never spawns inside a wall', () => {
  const r = tierRadius(3)
  assert.equal(clampDropX(-500, 3), r)
  assert.equal(clampDropX(WORLD.width + 500, 3), WORLD.width - r)
  assert.equal(clampDropX(200, 3), 200)
})

test('a long background pause runs a bounded number of physics steps', () => {
  assert.equal(physicsStepsFor(PHYSICS_STEP_MS), 1)
  assert.equal(physicsStepsFor(PHYSICS_STEP_MS * 2.5), 2)
  assert.equal(physicsStepsFor(60_000), MAX_PHYSICS_STEPS_PER_FRAME)
  assert.equal(physicsStepsFor(0), 0)
})

test('reset returns to a fresh ready state with zero score', () => {
  const g = new Game(() => 0)
  g.applyMerges([{a: body(1, 1), b: body(2, 1)}])
  g.drop(0, 1)
  g.checkGameOver([body(1, 1, 200, 0)], DROP_COOLDOWN_MS)
  g.checkGameOver([body(1, 1, 200, 0)], DROP_COOLDOWN_MS + GAME_OVER_GRACE_MS)
  assert.equal(g.phase, 'over')
  g.reset()
  assert.equal(g.phase, 'ready')
  assert.equal(g.score, 0)
  // A stale #aboveSince entry from the previous game must not end the next
  // one instantly.
  assert.equal(g.checkGameOver([body(1, 1, 200, 0)], 6000), false)
})
