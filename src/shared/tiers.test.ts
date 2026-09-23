import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MAX_DROP_TIER, MAX_TIER, TIERS, tierRadius, tierScore} from './tiers.ts'

test('there are 11 tiers from chick to whale and radii grow monotonically', () => {
  assert.equal(TIERS.length, MAX_TIER)
  assert.equal(TIERS[0]?.name, 'chick')
  assert.equal(TIERS[MAX_TIER - 1]?.name, 'whale')
  for (let i = 1; i < TIERS.length; i++)
    assert.ok(
      tierRadius(i + 1) > tierRadius(i),
      `tier ${i + 1} bigger than ${i}`,
    )
})

test('merge score is the triangular number so late merges pay off', () => {
  assert.deepEqual(
    Array.from({length: MAX_TIER}, (_, i) => tierScore(i + 1)),
    [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66],
  )
})

test('only the five smallest animals are ever dropped', () => {
  assert.equal(MAX_DROP_TIER, 5)
})
