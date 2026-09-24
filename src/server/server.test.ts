import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {
  type ChallengeRsp,
  Endpoint,
  type LeaderboardRsp,
} from '../shared/api.ts'
import {onReq} from './server.ts'

let server: Server
let serverURL: string
/** key -> member -> score */
const sets = new Map<string, Map<string, number>>()
/** key -> field -> value */
const hashes = new Map<string, Map<string, string>>()
const original = {
  zAdd: redis.zAdd,
  zRange: redis.zRange,
  zScore: redis.zScore,
  zRank: redis.zRank,
  zCard: redis.zCard,
  hSetNX: redis.hSetNX,
  hDel: redis.hDel,
}
const originalReddit = {submitCustomPost: reddit.submitCustomPost}
let username: string | undefined = 'alice'
type SubmitCustomPostOpts = Parameters<typeof reddit.submitCustomPost>[0]
let submitCustomPostCalls: SubmitCustomPostOpts[] = []
let submitCustomPostShouldFail = false

function sorted(key: string): {member: string; score: number}[] {
  return [...(sets.get(key) ?? new Map()).entries()]
    .map(([member, score]) => ({member, score}))
    .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member))
}

before(async () => {
  redis.zAdd = async (key, ...members) => {
    const set = sets.get(key) ?? new Map<string, number>()
    for (const m of members) set.set(m.member, m.score)
    sets.set(key, set)
    return members.length
  }
  redis.zRange = async (key, start, stop, opts) => {
    let all = sorted(key)
    if (opts?.reverse) all = all.reverse()
    const s = Number(start)
    const e = Number(stop)
    return all.slice(s, e === -1 ? undefined : e + 1)
  }
  redis.zScore = async (key, member) => sets.get(key)?.get(member)
  redis.zRank = async (key, member) => {
    const i = sorted(key).findIndex(m => m.member === member)
    return i === -1 ? undefined : i
  }
  redis.zCard = async key => sets.get(key)?.size ?? 0
  redis.hSetNX = async (key, field, value) => {
    const h = hashes.get(key) ?? new Map<string, string>()
    if (h.has(field)) return 0
    h.set(field, value)
    hashes.set(key, h)
    return 1
  }
  redis.hDel = async (key, fields) => {
    const h = hashes.get(key)
    if (!h) return 0
    let deleted = 0
    for (const f of fields) if (h.delete(f)) deleted++
    return deleted
  }
  reddit.submitCustomPost = (async opts => {
    submitCustomPostCalls.push(opts)
    if (submitCustomPostShouldFail) throw Error('submitCustomPost failed')
    return {
      id: 't3_new',
      url: 'https://reddit.com/r/test/comments/new',
    } as unknown as Awaited<ReturnType<typeof reddit.submitCustomPost>>
  }) as typeof reddit.submitCustomPost

  server = createServer(async (req, rsp) => {
    await runWithContext(
      {
        appName: 'pile-kingdom',
        postId: 't3_123',
        userId: username ? 't2_123' : undefined,
        username,
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const info = server.address() as AddressInfo
  serverURL = `http://127.0.0.1:${info.port}`
})

after(async () => {
  Object.assign(redis, original)
  Object.assign(reddit, originalReddit)
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  sets.clear()
  hashes.clear()
  submitCustomPostCalls = []
  submitCustomPostShouldFail = false
  username = 'alice'
})

async function submit(score: unknown): Promise<Response> {
  return fetch(`${serverURL}/${Endpoint.SubmitScore}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({score}),
  })
}

async function challenge(body: unknown = {}): Promise<Response> {
  return fetch(`${serverURL}/${Endpoint.CreateChallenge}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
}

test('empty leaderboard returns no entries and no me row', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.GetLeaderboard}`)
  assert.equal(rsp.status, 200)
  assert.deepEqual((await rsp.json()) as LeaderboardRsp, {entries: []})
})

test('submitting a score places the player on the board with a 1-based rank', async () => {
  const rsp = await submit(120)
  assert.equal(rsp.status, 200)
  const body = (await rsp.json()) as LeaderboardRsp
  assert.deepEqual(body.entries, [{username: 'alice', score: 120}])
  assert.deepEqual(body.me, {username: 'alice', score: 120, rank: 1})
})

test('a lower score never overwrites a personal best', async () => {
  await submit(500)
  const rsp = await submit(100)
  const body = (await rsp.json()) as LeaderboardRsp
  assert.deepEqual(body.me, {username: 'alice', score: 500, rank: 1})
})

test('leaderboard is descending and capped at ten', async () => {
  for (let i = 1; i <= 12; i++) {
    username = `user${i}`
    await submit(i * 10)
  }
  username = 'user3'
  const rsp = await fetch(`${serverURL}/${Endpoint.GetLeaderboard}`)
  const body = (await rsp.json()) as LeaderboardRsp
  assert.equal(body.entries.length, 10)
  assert.equal(body.entries[0]?.username, 'user12')
  assert.equal(body.entries[9]?.username, 'user3')
  assert.deepEqual(body.me, {username: 'user3', score: 30, rank: 10})
})

test('a player outside the top ten still gets their own rank', async () => {
  for (let i = 1; i <= 12; i++) {
    username = `user${i}`
    await submit(i * 10)
  }
  username = 'user1'
  const rsp = await fetch(`${serverURL}/${Endpoint.GetLeaderboard}`)
  const body = (await rsp.json()) as LeaderboardRsp
  assert.equal(
    body.entries.some(e => e.username === 'user1'),
    false,
  )
  assert.deepEqual(body.me, {username: 'user1', score: 10, rank: 12})
})

test('anonymous viewers can read the board but not post a score', async () => {
  username = undefined
  const get = await fetch(`${serverURL}/${Endpoint.GetLeaderboard}`)
  assert.equal(get.status, 200)
  const post = await submit(50)
  assert.equal(post.status, 401)
})

test('malformed scores are rejected and nothing is stored', async () => {
  for (const bad of [-1, 1.5, 100_001, 'abc', null, undefined]) {
    const rsp = await submit(bad)
    assert.equal(rsp.status, 400, `score ${String(bad)}`)
  }
  assert.equal(sets.size, 0)
})

test('unknown routes and wrong methods are 404', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.SubmitScore}`)
  assert.equal(rsp.status, 404)
})

test("a challenge post carries the player's stored score, not a client-supplied one", async () => {
  await submit(120)
  const rsp = await challenge({score: 99999})
  assert.equal(rsp.status, 200)
  const body = (await rsp.json()) as ChallengeRsp
  assert.equal(body.score, 120)
  assert.equal(submitCustomPostCalls.length, 1)
  const call = submitCustomPostCalls[0]
  assert.equal(call?.runAs, 'USER')
  assert.match(call?.title ?? '', /120/)
  assert.deepEqual(call?.postData, {challenger: 'alice', target: 120})
})

test("the challenger is seeded onto the new post's board so it is never empty", async () => {
  await submit(120)
  await challenge()
  assert.deepEqual(sorted('lb:t3_new'), [{member: 'alice', score: 120}])
})

test('a second challenge from the same post is refused so the subreddit is not flooded', async () => {
  await submit(120)
  const first = await challenge()
  assert.equal(first.status, 200)
  const second = await challenge()
  assert.equal(second.status, 409)
  assert.equal(submitCustomPostCalls.length, 1)
})

test('a player with no score cannot post a challenge', async () => {
  const rsp = await challenge()
  assert.equal(rsp.status, 400)
  assert.equal(submitCustomPostCalls.length, 0)
})

test('anonymous visitors cannot post a challenge', async () => {
  username = undefined
  const rsp = await challenge()
  assert.equal(rsp.status, 401)
  assert.equal(submitCustomPostCalls.length, 0)
})

test('a failed post creation releases the slot so the player can retry', async () => {
  await submit(120)
  submitCustomPostShouldFail = true
  const failed = await challenge()
  assert.equal(failed.status, 500)
  submitCustomPostShouldFail = false
  const retried = await challenge()
  assert.equal(retried.status, 200)
  assert.equal(submitCustomPostCalls.length, 2)
})
