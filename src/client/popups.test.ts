import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  MERGE_POP_MS,
  POPUP_MS,
  POPUP_RISE,
  POPUP_SPRING_MS,
} from '../shared/config.ts'
import {Effects, mergePopScale, scorePopup} from './popups.ts'

const at = (x = 100, y = 200, points = 21, bornMs = 0) => ({
  points,
  x,
  y,
  bornMs,
})

// These effects exist to tell the player what a merge was worth and to make it
// feel like it landed. The tests below guard those two meanings, plus the
// bookkeeping that stops either effect from outliving its merge.

test('the number shown is the points the merge actually scored', () => {
  assert.equal(scorePopup(at(100, 200, 21), 0)?.text, '+21')
  assert.equal(scorePopup(at(100, 200, 3), 0)?.text, '+3')
})

test('a popup stops existing once its life is up, so they cannot pile up', () => {
  assert.ok(scorePopup(at(), POPUP_MS - 1))
  assert.equal(scorePopup(at(), POPUP_MS), undefined)
  assert.equal(scorePopup(at(), POPUP_MS * 3), undefined)
})

test('a popup only ever drifts upward, never sinks back', () => {
  let previous = Number.POSITIVE_INFINITY
  for (let age = 0; age < POPUP_MS; age += 25) {
    const y = scorePopup(at(), age)?.y
    assert.ok(y !== undefined)
    assert.ok(y <= previous, `age ${age} moved down`)
    previous = y
  }
  // It should travel the distance it was given, not stall partway.
  const last = scorePopup(at(), POPUP_MS - 1)
  assert.ok(200 - (last?.y ?? 0) > POPUP_RISE * 0.9)
})

test('a popup fades out rather than blinking away at full strength', () => {
  assert.equal(scorePopup(at(), 0)?.alpha, 1)
  const nearEnd = scorePopup(at(), POPUP_MS - 1)?.alpha
  assert.ok(
    nearEnd !== undefined && nearEnd < 0.05,
    `ended at alpha ${nearEnd}`,
  )
})

test('a popup springs past its size, then settles back to it', () => {
  assert.equal(scorePopup(at(), 0)?.scale, 1)
  const peak = scorePopup(at(), POPUP_SPRING_MS / 2)?.scale
  assert.ok(peak !== undefined && peak > 1.2, `peaked at ${peak}`)
  assert.equal(scorePopup(at(), POPUP_SPRING_MS)?.scale, 1)
})

// A body that stays even slightly scaled would sit wrong against its physics
// radius forever, so the bounce has to land exactly back on 1.
test('a merged animal bounces and returns to exactly its real size', () => {
  assert.equal(mergePopScale(0), 1)
  assert.ok(mergePopScale(MERGE_POP_MS / 2) > 1.1)
  assert.equal(mergePopScale(MERGE_POP_MS), 1)
  assert.equal(mergePopScale(MERGE_POP_MS * 10), 1)
})

test('each merge in a chain gets its own number at its own spot', () => {
  const fx = new Effects()
  fx.add(1, 3, 10, 20, 0)
  fx.add(2, 6, 90, 80, 0)
  const drawn = fx.popups(0)
  assert.deepEqual(
    drawn.map(p => p.text),
    ['+3', '+6'],
  )
  assert.deepEqual(
    drawn.map(p => p.x),
    [10, 90],
  )
})

test('expired popups are dropped so the list cannot grow without bound', () => {
  const fx = new Effects()
  fx.add(1, 3, 10, 20, 0)
  assert.equal(fx.popups(10).length, 1)
  assert.equal(fx.popups(POPUP_MS).length, 0)
  // Asking again must not resurrect it.
  assert.equal(fx.popups(0).length, 0)
})

test('a body merged away loses its bounce, so the id cannot leak', () => {
  const fx = new Effects()
  fx.add(7, 3, 10, 20, 0)
  assert.ok(fx.bodyScales(0).has(7))
  fx.remove(7)
  assert.equal(fx.bodyScales(0).has(7), false)
})

test('a finished bounce is forgotten instead of tracked forever', () => {
  const fx = new Effects()
  fx.add(7, 3, 10, 20, 0)
  assert.equal(fx.bodyScales(MERGE_POP_MS).has(7), false)
})

test('a new round starts with no leftover effects on screen', () => {
  const fx = new Effects()
  fx.add(1, 3, 10, 20, 0)
  fx.clear()
  assert.equal(fx.popups(0).length, 0)
  assert.equal(fx.bodyScales(0).size, 0)
})
