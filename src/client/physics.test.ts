import assert from 'node:assert/strict'
import {test} from 'node:test'
import {WORLD} from '../shared/config.ts'
import {tierRadius} from '../shared/tiers.ts'
import {Physics} from './physics.ts'

test('two overlapping same-tier animals report one collision pair carrying tier and position', () => {
  const p = new Physics()
  const r = tierRadius(3)
  const a = p.spawn(3, 200, 300)
  const b = p.spawn(3, 200 + r, 300)
  let pairs = p.step(1000 / 60)
  for (let i = 0; i < 5 && pairs.length === 0; i++) pairs = p.step(1000 / 60)
  assert.equal(pairs.length, 1)
  const ids = [pairs[0]?.a.id, pairs[0]?.b.id].sort()
  assert.deepEqual(ids, [a, b].sort())
  assert.equal(pairs[0]?.a.tier, 3)
  assert.ok(
    typeof pairs[0]?.a.x === 'number' && typeof pairs[0]?.a.y === 'number',
  )
})

test('an animal falls and comes to rest on the floor instead of leaving the world', () => {
  const p = new Physics()
  const id = p.spawn(1, 200, 60)
  for (let i = 0; i < 600; i++) p.step(1000 / 60)
  const b = p.bodies().find(b => b.id === id)
  assert.ok(b, 'body still exists')
  assert.ok(
    b.y < WORLD.height && b.y > WORLD.height - tierRadius(1) - 5,
    `y=${b.y}`,
  )
})

test('hitting a wall is not reported as a collision pair', () => {
  const p = new Physics()
  p.spawn(1, 200, 60)
  let total = 0
  for (let i = 0; i < 600; i++) total += p.step(1000 / 60).length
  assert.equal(total, 0)
})

test('remove and clear drop bodies from the world', () => {
  const p = new Physics()
  const id = p.spawn(2, 100, 100)
  p.spawn(2, 300, 100)
  p.remove(id)
  assert.equal(p.bodies().length, 1)
  p.clear()
  assert.equal(p.bodies().length, 0)
})
