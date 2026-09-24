import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MAX_TIER} from '../shared/tiers.ts'
import {JourneyReporter, Round, tierProgress} from './journey.ts'

function receipt(status: string, message = status) {
  return {receipt: {status, message}}
}

test('the first merge is a tenth of the way and the whale is a full journey', () => {
  assert.equal(tierProgress(2), 0.1)
  assert.equal(tierProgress(MAX_TIER), 1)
})

test('progress climbs with every tier so the dashboard histogram spreads out', () => {
  for (let tier = 3; tier <= MAX_TIER; tier++)
    assert.ok(
      tierProgress(tier) > tierProgress(tier - 1),
      `tier ${tier} is further along than ${tier - 1}`,
    )
})

test('a tier is reported once so a long round cannot spam Journey.Progress', () => {
  const round = new Round()
  assert.equal(round.record(2), 2)
  assert.equal(round.record(2), undefined)
  assert.equal(round.record(3), 3)
})

test('merging back down to a small animal reports nothing', () => {
  const round = new Round()
  round.record(7)
  assert.equal(round.record(4), undefined)
  assert.equal(round.best, 7)
})

test('play again starts a fresh ladder so the next round reports its own milestones', () => {
  const round = new Round()
  round.record(6)
  round.reset()
  assert.equal(round.best, 1)
  assert.equal(round.record(2), 2)
})

test('a telemetry failure never rejects into the game loop', async () => {
  const reporter = new JourneyReporter(() => {})
  await assert.doesNotReject(
    reporter.send(() => Promise.reject(Error('offline'))),
  )
})

test('an ingested event stays quiet', async () => {
  const warnings: string[] = []
  const reporter = new JourneyReporter(msg => warnings.push(msg))
  await reporter.send(async () => receipt('JOURNEY_RECEIPT_VALID'))
  assert.deepEqual(warnings, [])
})

test('a duplicate is normal suppression, not a problem worth warning about', async () => {
  const warnings: string[] = []
  const reporter = new JourneyReporter(msg => warnings.push(msg))
  await reporter.send(async () => receipt('JOURNEY_RECEIPT_DENIED_DUPLICATE'))
  assert.deepEqual(warnings, [])
})

test('a dropped event warns once per status so playtest does not log on every drop', async () => {
  const warnings: string[] = []
  const reporter = new JourneyReporter(msg => warnings.push(msg))
  const denied = () =>
    receipt('JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED', 'not allowlisted yet')
  await reporter.send(async () => denied())
  await reporter.send(async () => denied())
  assert.deepEqual(warnings, ['not allowlisted yet'])
})

test('a second kind of problem still gets through', async () => {
  const warnings: string[] = []
  const reporter = new JourneyReporter(msg => warnings.push(msg))
  await reporter.send(async () =>
    receipt('JOURNEY_RECEIPT_DENIED_RATE_LIMITED', 'rate limited'),
  )
  await reporter.send(async () =>
    receipt('JOURNEY_RECEIPT_INVALID', 'invalid payload'),
  )
  assert.deepEqual(warnings, ['rate limited', 'invalid payload'])
})

test('only the first drop of a round starts a journey, not all two hundred', () => {
  const round = new Round()
  assert.equal(round.start(), true)
  assert.equal(round.start(), false)
})

test('play again lets the next round open its own journey', () => {
  const round = new Round()
  round.start()
  round.reset()
  assert.equal(round.start(), true)
})
