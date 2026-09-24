import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MERGE_RATE} from '../shared/config.ts'
import {MAX_TIER} from '../shared/tiers.ts'
import {mergePlaybackRate} from './audio.ts'

// Merges are the game's main feedback, and one sample covers all ten of them.
// The pitch is what tells the player how big a thing they just made, so these
// guard that meaning rather than the arithmetic.

test('the smallest merge is the highest pitch, the whale the lowest', () => {
  assert.equal(mergePlaybackRate(2), MERGE_RATE.smallest)
  assert.equal(mergePlaybackRate(MAX_TIER), MERGE_RATE.largest)
})

test('every step up the chain sounds lower than the one before', () => {
  for (let tier = 3; tier <= MAX_TIER; tier++)
    assert.ok(
      mergePlaybackRate(tier) < mergePlaybackRate(tier - 1),
      `tier ${tier} should sound lower than tier ${tier - 1}`,
    )
})

test('merges stay in a musical range, never chipmunked or sludge', () => {
  for (let tier = 2; tier <= MAX_TIER; tier++) {
    const rate = mergePlaybackRate(tier)
    assert.ok(rate >= MERGE_RATE.largest && rate <= MERGE_RATE.smallest)
  }
})

// A tier outside 2..MAX_TIER means a bug elsewhere, but a silent or absurdly
// pitched sample is a worse failure than a merge that sounds like its nearest
// neighbour, so the rate is clamped rather than left to run off the scale.
test('out-of-range tiers clamp instead of running off the scale', () => {
  assert.equal(mergePlaybackRate(1), MERGE_RATE.smallest)
  assert.equal(mergePlaybackRate(0), MERGE_RATE.smallest)
  assert.equal(mergePlaybackRate(MAX_TIER + 5), MERGE_RATE.largest)
})
