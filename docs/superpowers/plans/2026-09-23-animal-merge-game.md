# Pile Kingdom Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Suika-style drop-and-merge game where animals merge into bigger animals, running inside a Reddit post via Devvit with a per-post leaderboard, and also runnable in a plain browser.

**Architecture:** Client is a single canvas driven by Matter.js physics with pure game rules in a separate testable module. Server is the Devvit `bare` template's Node handler with two JSON endpoints backed by one Redis sorted set per post. A tiny local Node server fakes those endpoints so the game runs without a Reddit account.

**Tech Stack:** TypeScript, esbuild, Node 24 built-in test runner with type stripping, Matter.js 0.20, `@devvit/web` 0.14.5, Biome.

**Spec:** `docs/superpowers/specs/2026-09-23-pile-kingdom-game-design.md`

## Global Constraints

- Node `>=24.0.0`. Tests run with `node --experimental-strip-types --test`.
- Devvit packages pinned to `0.14.5`; Matter.js `0.20.0`.
- Code style follows the template's Biome config: no semicolons, single quotes, `{a}` without bracket spacing, `arrowParentheses: asNeeded`. Run `npm run format` before each commit.
- Imports between TS files use the `.ts` extension (required by Node type stripping and the template's tsconfig).
- Matter.js is imported as `import Matter from 'matter-js'` and destructured. Named imports break in Node ESM because the package is UMD.
- Only `src/client/physics.ts` may import `matter-js`.
- Logical world is 400 x 600 units. y grows downward. Danger line y = 100. Drop y = 60.
- Tier count is 11. Only tiers 1 to 5 are dropped. Score for producing tier n is `n * (n + 1) / 2`.
- Leaderboard key is `lb:<postId>`, member is username, top 10 returned.
- Score submissions must be integers in `[0, 100000]`; else 400. No username: 401.
- App name in `devvit.json` and `package.json`: `pile-kingdom`. Display title: `Pile Kingdom`. Tagline: `Have a whale of a pile.`
- If `devvit upload` rejects `pile-kingdom` as taken, fall back to `pilekingdom` and change only `devvit.json`.
- Sprites already exist at `public/animals/<name>.png` (chick, frog, duck, rabbit, penguin, dog, pig, cow, hippo, elephant, whale). Do not re-download.

## Review Focus

Inputs the spec implies but did not spell out. Each has a test in the owning task.

1. **Pointer released outside the playfield.** The drop x must clamp so the animal never spawns inside a wall. Test in Task 3 (`clampDropX`).
2. **Three same-tier bodies touching in one tick.** A body appears in two collision pairs; it must merge exactly once and the third body must survive. Test in Task 3.
3. **Tab resumed after minutes in background.** A huge frame delta must not run thousands of physics steps. Test in Task 3 (`physicsStepsFor`).
4. **Lower score than personal best.** Must not overwrite the stored best. Test in Task 5.
5. **Malformed score payload.** Negative, fractional, string, or missing score returns 400 and stores nothing. Test in Task 5.

---

### Task 1: Scaffold from the Devvit bare template

**Files:**
- Create: everything from the `bare` template, renamed. Source is already cloned at `/tmp/dv-bare` (BSD-3-Clause, Reddit Inc.). If missing, `gh repo clone reddit/devvit-template-bare /tmp/dv-bare -- --depth 1`.
- Modify: `package.json`, `devvit.json`, `public/game.html`, `.gitignore`
- Rename: `src/client/game.ts` to `src/client/main.ts`

**Interfaces:**
- Produces: a repo where `npm test` passes with the template's counter example still in place. Later tasks replace the counter code.

- [x] **Step 1: Copy template files without git and node_modules**

```bash
cd /Users/victorlap/Sites/dotpinq/reddit-suika
rsync -a --exclude .git --exclude node_modules --exclude .gitignore /tmp/dv-bare/ ./
git mv -f src/client/game.ts src/client/main.ts 2>/dev/null || mv src/client/game.ts src/client/main.ts
```

- [x] **Step 2: Replace the name placeholder and the renamed entry**

```bash
grep -rl '<% name %>' . --exclude-dir=node_modules --exclude-dir=.git | xargs sed -i '' 's/<% name %>/pile-kingdom/g'
sed -i '' 's#src/client/game.ts#src/client/main.ts#' package.json
sed -i '' 's#game\.js#main.js#g' public/game.html
```

Then confirm `.gitignore` still contains:

```
node_modules/
dist/
public/*.js
public/*.js.map
.devvit/
```

- [x] **Step 3: Add Matter.js and its types**

```bash
npm install --save-exact matter-js@0.20.0
npm install --save-exact --save-dev @types/matter-js
npm install
```

- [x] **Step 4: Run the full check**

Run: `npm test`
Expected: types, lint, unit tests, and build all pass. The unit test is the template's counter test. If Biome complains about `public/animals/LICENSE.txt` formatting, add `"!public/animals/"` to `files.includes` in `biome.jsonc`.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold from devvit bare template with matter-js"
```

---

### Task 2: Shared tier table, config, and API types

**Files:**
- Create: `src/shared/tiers.ts`, `src/shared/config.ts`
- Rewrite: `src/shared/api.ts`
- Test: `src/shared/tiers.test.ts`

**Interfaces:**
- Produces:
  - `TIERS: readonly TierDef[]` with `TierDef = {tier: number; name: string; radius: number}`, index `tier - 1`.
  - `MAX_TIER = 11`, `MAX_DROP_TIER = 5`.
  - `tierScore(tier: number): number`, `tierRadius(tier: number): number`, `tierName(tier: number): string`.
  - Config constants listed in Step 3.
  - API types: `LeaderboardEntry`, `LeaderboardRsp`, `SubmitScoreReq`, `ErrorRsp`, `Endpoint`, `EndpointMethod`.

Note: rewriting `api.ts` breaks the template's counter server and client. That is expected. Task 2 only runs the tiers test and type checks the shared project, and Task 5 and Task 8 restore green for the whole suite. To keep `npm test` runnable in between, delete the template counter files in this task: `src/client/fetch.ts`, `src/server/server.test.ts`, and replace bodies of `src/server/db.ts` and `src/server/server.ts` as shown in Step 4 so the server compiles with only the internal routes.

- [x] **Step 1: Write the failing test**

`src/shared/tiers.test.ts`:

```ts
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  MAX_DROP_TIER,
  MAX_TIER,
  TIERS,
  tierRadius,
  tierScore,
} from './tiers.ts'

test('there are 11 tiers from chick to whale and radii grow monotonically', () => {
  assert.equal(TIERS.length, MAX_TIER)
  assert.equal(TIERS[0]?.name, 'chick')
  assert.equal(TIERS[MAX_TIER - 1]?.name, 'whale')
  for (let i = 1; i < TIERS.length; i++)
    assert.ok(tierRadius(i + 1) > tierRadius(i), `tier ${i + 1} bigger than ${i}`)
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/shared/tiers.test.ts`
Expected: FAIL, cannot find module `./tiers.ts`.

- [x] **Step 3: Write tiers, config, and api**

`src/shared/tiers.ts`:

```ts
export type TierDef = {tier: number; name: string; radius: number}

export const TIERS: readonly TierDef[] = [
  {tier: 1, name: 'chick', radius: 16},
  {tier: 2, name: 'frog', radius: 22},
  {tier: 3, name: 'duck', radius: 29},
  {tier: 4, name: 'rabbit', radius: 37},
  {tier: 5, name: 'penguin', radius: 46},
  {tier: 6, name: 'dog', radius: 56},
  {tier: 7, name: 'pig', radius: 67},
  {tier: 8, name: 'cow', radius: 79},
  {tier: 9, name: 'hippo', radius: 92},
  {tier: 10, name: 'elephant', radius: 106},
  {tier: 11, name: 'whale', radius: 120},
]

export const MAX_TIER = TIERS.length
export const MAX_DROP_TIER = 5

function def(tier: number): TierDef {
  const d = TIERS[tier - 1]
  if (!d) throw Error(`no tier ${tier}`)
  return d
}

/** Points awarded for producing this tier by a merge. */
export function tierScore(tier: number): number {
  return (tier * (tier + 1)) / 2
}

export function tierRadius(tier: number): number {
  return def(tier).radius
}

export function tierName(tier: number): string {
  return def(tier).name
}
```

`src/shared/config.ts`:

```ts
/** Logical playfield size. The canvas scales this to fit the viewport. */
export const WORLD = {width: 400, height: 600} as const
/** Bodies whose centre is above this y for GAME_OVER_GRACE_MS end the game. */
export const DANGER_Y = 100
/** y where the next animal hovers before dropping. */
export const DROP_Y = 60
export const DROP_COOLDOWN_MS = 500
export const GAME_OVER_GRACE_MS = 1000
export const PHYSICS_STEP_MS = 1000 / 60
export const MAX_PHYSICS_STEPS_PER_FRAME = 5
/** Upward velocity given to a freshly merged animal. */
export const MERGE_POP_VELOCITY = -3
export const WALL_THICKNESS = 40
export const BODY = {
  restitution: 0.15,
  friction: 0.4,
  frictionStatic: 0.6,
  density: 0.002,
} as const
export const GRAVITY_Y = 1.2
export const MAX_SCORE = 100_000
export const LEADERBOARD_SIZE = 10
```

`src/shared/api.ts`:

```ts
/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

export type LeaderboardEntry = {username: string; score: number}

/** Top scores for this post plus the caller's own row when signed in. */
export type LeaderboardRsp = {
  entries: LeaderboardEntry[]
  me?: {username: string; score: number; rank: number}
}

export type SubmitScoreReq = {score: number}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  GetLeaderboard: 'api/leaderboard',
  SubmitScore: 'api/score',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
} as const

export const EndpointMethod = {
  [Endpoint.GetLeaderboard]: 'GET',
  [Endpoint.SubmitScore]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
```

- [x] **Step 4: Remove the counter code so the tree compiles**

```bash
git rm -q src/client/fetch.ts src/server/server.test.ts
```

Replace `src/server/db.ts` with a placeholder that Task 5 fills:

```ts
export {}
```

Replace `src/server/server.ts` with the internal routes only:

```ts
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {Endpoint, EndpointMethod, type ErrorRsp} from '../shared/api.ts'

type AnyRsp = UiResponse | TriggerResponse | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      default:
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: 'Pile Kingdom'})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({title: 'Pile Kingdom'})
  return {}
}

export function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
```

Replace `src/client/main.ts` with a stub Task 8 replaces:

```ts
console.log('animal merge: client not wired yet')
```

- [x] **Step 5: Run tests and type check**

Run: `npm test`
Expected: PASS. Three tiers tests pass, `tsc --build` clean, build succeeds.

- [x] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "feat: add shared tier table, tuning config, and leaderboard api types"
```

---

### Task 3: Pure game rules

**Files:**
- Create: `src/client/game.ts`
- Test: `src/client/game.test.ts`

**Interfaces:**
- Consumes: `tierScore`, `tierRadius`, `MAX_TIER`, `MAX_DROP_TIER` from `../shared/tiers.ts`; `WORLD`, `DANGER_Y`, `DROP_COOLDOWN_MS`, `GAME_OVER_GRACE_MS`, `PHYSICS_STEP_MS`, `MAX_PHYSICS_STEPS_PER_FRAME` from `../shared/config.ts`.
- Produces:
  - `type BodyInfo = {id: number; tier: number; x: number; y: number}`
  - `type CollisionPair = {a: BodyInfo; b: BodyInfo}`
  - `type MergeResult = {remove: number[]; spawn: {tier: number; x: number; y: number}[]; scoreDelta: number}`
  - `type Phase = 'ready' | 'cooldown' | 'over'`
  - `class Game` with fields `phase`, `score`, `current`, `next`, and methods `drop(nowMs, bodyId)`, `tick(nowMs)`, `applyMerges(pairs)`, `checkGameOver(bodies, nowMs)`, `reset()`.
  - `clampDropX(x: number, tier: number): number`
  - `physicsStepsFor(elapsedMs: number): number`
  - `resolveMerges(pairs: CollisionPair[]): MergeResult` (stateless helper used by `applyMerges`).

- [x] **Step 1: Write the failing tests**

`src/client/game.test.ts`:

```ts
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
    assert.ok(g.current >= 1 && g.current <= MAX_DROP_TIER, `current ${g.current}`)
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
  assert.equal(g.checkGameOver([body(1, 1, 200, DANGER_Y + 50)], GAME_OVER_GRACE_MS), false)
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
  assert.equal(g.checkGameOver(falling, DROP_COOLDOWN_MS + GAME_OVER_GRACE_MS), true)
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
  g.checkGameOver([body(1, 1, 200, 0)], 0)
  g.checkGameOver([body(1, 1, 200, 0)], 5000)
  assert.equal(g.phase, 'over')
  g.reset()
  assert.equal(g.phase, 'ready')
  assert.equal(g.score, 0)
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/client/game.test.ts`
Expected: FAIL, cannot find module `./game.ts`.

- [x] **Step 3: Implement game.ts**

```ts
import {
  DANGER_Y,
  DROP_COOLDOWN_MS,
  GAME_OVER_GRACE_MS,
  MAX_PHYSICS_STEPS_PER_FRAME,
  PHYSICS_STEP_MS,
  WORLD,
} from '../shared/config.ts'
import {
  MAX_DROP_TIER,
  MAX_TIER,
  tierRadius,
  tierScore,
} from '../shared/tiers.ts'

export type BodyInfo = {id: number; tier: number; x: number; y: number}
export type CollisionPair = {a: BodyInfo; b: BodyInfo}
export type MergeResult = {
  remove: number[]
  spawn: {tier: number; x: number; y: number}[]
  scoreDelta: number
}
export type Phase = 'ready' | 'cooldown' | 'over'

/** Turn this frame's collisions into removals, spawns, and score. */
export function resolveMerges(pairs: readonly CollisionPair[]): MergeResult {
  const consumed = new Set<number>()
  const result: MergeResult = {remove: [], spawn: [], scoreDelta: 0}
  for (const {a, b} of pairs) {
    if (a.tier !== b.tier || a.tier >= MAX_TIER) continue
    if (consumed.has(a.id) || consumed.has(b.id)) continue
    consumed.add(a.id)
    consumed.add(b.id)
    const tier = a.tier + 1
    result.remove.push(a.id, b.id)
    result.spawn.push({tier, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2})
    result.scoreDelta += tierScore(tier)
  }
  return result
}

/** Keep the hovering animal fully inside the side walls. */
export function clampDropX(x: number, tier: number): number {
  const r = tierRadius(tier)
  return Math.min(Math.max(x, r), WORLD.width - r)
}

/** Fixed-step catch-up, capped so a background tab cannot explode on resume. */
export function physicsStepsFor(elapsedMs: number): number {
  return Math.min(
    Math.floor(elapsedMs / PHYSICS_STEP_MS),
    MAX_PHYSICS_STEPS_PER_FRAME,
  )
}

export class Game {
  phase: Phase = 'ready'
  score = 0
  current: number
  next: number
  #rng: () => number
  #cooldownUntil = 0
  #lastDrop: {id: number; atMs: number} | undefined
  #aboveSince = new Map<number, number>()

  constructor(rng: () => number = Math.random) {
    this.#rng = rng
    this.current = this.#rollTier()
    this.next = this.#rollTier()
  }

  /** Called when the player releases the current animal as body `bodyId`. */
  drop(nowMs: number, bodyId: number): void {
    if (this.phase !== 'ready') return
    this.phase = 'cooldown'
    this.#cooldownUntil = nowMs + DROP_COOLDOWN_MS
    this.#lastDrop = {id: bodyId, atMs: nowMs}
    this.current = this.next
    this.next = this.#rollTier()
  }

  tick(nowMs: number): void {
    if (this.phase === 'cooldown' && nowMs >= this.#cooldownUntil)
      this.phase = 'ready'
  }

  applyMerges(pairs: readonly CollisionPair[]): MergeResult {
    const result = resolveMerges(pairs)
    this.score += result.scoreDelta
    for (const id of result.remove) this.#aboveSince.delete(id)
    return result
  }

  /** True once any body has sat above the danger line for the grace period. */
  checkGameOver(bodies: readonly BodyInfo[], nowMs: number): boolean {
    if (this.phase === 'over') return true
    const seen = new Set<number>()
    for (const b of bodies) {
      if (b.y >= DANGER_Y) continue
      const justDropped =
        this.#lastDrop?.id === b.id &&
        nowMs - this.#lastDrop.atMs < DROP_COOLDOWN_MS
      if (justDropped) continue
      seen.add(b.id)
      const since = this.#aboveSince.get(b.id)
      if (since === undefined) this.#aboveSince.set(b.id, nowMs)
      else if (nowMs - since >= GAME_OVER_GRACE_MS) {
        this.phase = 'over'
        return true
      }
    }
    for (const id of this.#aboveSince.keys())
      if (!seen.has(id)) this.#aboveSince.delete(id)
    return false
  }

  reset(): void {
    this.phase = 'ready'
    this.score = 0
    this.#cooldownUntil = 0
    this.#lastDrop = undefined
    this.#aboveSince.clear()
    this.current = this.#rollTier()
    this.next = this.#rollTier()
  }

  #rollTier(): number {
    return 1 + Math.min(MAX_DROP_TIER - 1, Math.floor(this.#rng() * MAX_DROP_TIER))
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/client/game.test.ts`
Expected: all 13 tests PASS. Then `npm test` for types and lint.

- [x] **Step 5: Commit**

```bash
npm run format
git add src/client/game.ts src/client/game.test.ts
git commit -m "feat: add pure game rules for merging, scoring, cooldown, and game over"
```

---

### Task 4: Matter.js physics wrapper

**Files:**
- Create: `src/client/physics.ts`
- Test: `src/client/physics.test.ts`

**Interfaces:**
- Consumes: `BodyInfo`, `CollisionPair` from `./game.ts`; `WORLD`, `WALL_THICKNESS`, `BODY`, `GRAVITY_Y` from `../shared/config.ts`; `tierRadius` from `../shared/tiers.ts`.
- Produces:
  - `type PhysicsBody = BodyInfo & {angle: number}`
  - `class Physics` with `spawn(tier, x, y, velocityY = 0): number`, `remove(id): void`, `step(dtMs): CollisionPair[]`, `bodies(): PhysicsBody[]`, `clear(): void`.
  - `step` returns the collision pairs between two dynamic animal bodies that started during that step. Walls are never included.

- [x] **Step 1: Write the failing test**

`src/client/physics.test.ts`:

```ts
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
  assert.ok(typeof pairs[0]?.a.x === 'number' && typeof pairs[0]?.a.y === 'number')
})

test('an animal falls and comes to rest on the floor instead of leaving the world', () => {
  const p = new Physics()
  const id = p.spawn(1, 200, 60)
  for (let i = 0; i < 600; i++) p.step(1000 / 60)
  const b = p.bodies().find(b => b.id === id)
  assert.ok(b, 'body still exists')
  assert.ok(b.y < WORLD.height && b.y > WORLD.height - tierRadius(1) - 5, `y=${b.y}`)
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/client/physics.test.ts`
Expected: FAIL, cannot find module `./physics.ts`.

- [x] **Step 3: Implement physics.ts**

```ts
import Matter from 'matter-js'
import {BODY, GRAVITY_Y, WALL_THICKNESS, WORLD} from '../shared/config.ts'
import {tierRadius} from '../shared/tiers.ts'
import type {BodyInfo, CollisionPair} from './game.ts'

const {Bodies, Body, Composite, Engine, Events} = Matter

export type PhysicsBody = BodyInfo & {angle: number}

type AnimalPlugin = {tier: number}

/** Owns the Matter.js world. Nothing outside this file imports matter-js. */
export class Physics {
  #engine: Matter.Engine
  #pending: CollisionPair[] = []

  constructor() {
    this.#engine = Engine.create({gravity: {x: 0, y: GRAVITY_Y}})
    const t = WALL_THICKNESS
    const {width: w, height: h} = WORLD
    const wall = {isStatic: true, friction: 0.6}
    Composite.add(this.#engine.world, [
      Bodies.rectangle(w / 2, h + t / 2, w + 2 * t, t, wall),
      Bodies.rectangle(-t / 2, h / 2, t, h * 3, wall),
      Bodies.rectangle(w + t / 2, h / 2, t, h * 3, wall),
    ])
    Events.on(this.#engine, 'collisionStart', ev => {
      for (const pair of ev.pairs) {
        const a = toInfo(pair.bodyA)
        const b = toInfo(pair.bodyB)
        if (a && b) this.#pending.push({a, b})
      }
    })
  }

  spawn(tier: number, x: number, y: number, velocityY = 0): number {
    const body = Bodies.circle(x, y, tierRadius(tier), {
      restitution: BODY.restitution,
      friction: BODY.friction,
      frictionStatic: BODY.frictionStatic,
      density: BODY.density,
    })
    body.plugin = {tier} satisfies AnimalPlugin
    if (velocityY) Body.setVelocity(body, {x: 0, y: velocityY})
    Composite.add(this.#engine.world, body)
    return body.id
  }

  remove(id: number): void {
    const body = this.#find(id)
    if (body) Composite.remove(this.#engine.world, body)
  }

  /** Advance the simulation and return animal-to-animal collisions that began. */
  step(dtMs: number): CollisionPair[] {
    this.#pending = []
    Engine.update(this.#engine, dtMs)
    return this.#pending
  }

  bodies(): PhysicsBody[] {
    const out: PhysicsBody[] = []
    for (const b of Composite.allBodies(this.#engine.world)) {
      const info = toInfo(b)
      if (info) out.push({...info, angle: b.angle})
    }
    return out
  }

  clear(): void {
    for (const b of Composite.allBodies(this.#engine.world))
      if (toInfo(b)) Composite.remove(this.#engine.world, b)
  }

  #find(id: number): Matter.Body | undefined {
    return Composite.allBodies(this.#engine.world).find(b => b.id === id)
  }
}

function toInfo(body: Matter.Body): BodyInfo | undefined {
  const plugin = body.plugin as Partial<AnimalPlugin> | undefined
  if (body.isStatic || typeof plugin?.tier !== 'number') return
  return {id: body.id, tier: plugin.tier, x: body.position.x, y: body.position.y}
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/client/physics.test.ts`
Expected: 4 PASS. If the resting-y test fails by a few units, widen the tolerance in the assertion to 10 rather than tuning physics. Then `npm test`.

- [x] **Step 5: Commit**

```bash
npm run format
git add src/client/physics.ts src/client/physics.test.ts
git commit -m "feat: add matter-js physics wrapper with animal collision reporting"
```

---

### Task 5: Server leaderboard endpoints

**Files:**
- Rewrite: `src/server/db.ts`, `src/server/server.ts`
- Test: `src/server/server.test.ts`

**Interfaces:**
- Consumes: `Endpoint`, `EndpointMethod`, `LeaderboardRsp`, `SubmitScoreReq`, `ErrorRsp` from `../shared/api.ts`; `MAX_SCORE`, `LEADERBOARD_SIZE` from `../shared/config.ts`.
- Produces:
  - `dbGetLeaderboard(t3: T3, username: string | undefined): Promise<LeaderboardRsp>`
  - `dbSubmitScore(t3: T3, username: string, score: number): Promise<void>` (keeps the max)
  - `GET /api/leaderboard` and `POST /api/score` behaving per spec.

Devvit Redis facts verified against `@devvit/redis` 0.14.5 types: `zAdd(key, ...members: {member: string; score: number}[]): Promise<number>`, `zRange(key, start, stop, {by: 'rank', reverse: true}): Promise<{member: string; score: number}[]>`, `zScore(key, member): Promise<number | undefined>`, `zRank(key, member): Promise<number | undefined>` (ascending), `zCard(key): Promise<number>`. There is no `zRevRank`, so descending rank is `zCard - 1 - zRank`.

- [x] **Step 1: Write the failing tests**

`src/server/server.test.ts`:

```ts
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {type Context, redis, runWithContext} from '@devvit/web/server'
import {Endpoint, type LeaderboardRsp} from '../shared/api.ts'
import {onReq} from './server.ts'

let server: Server
let serverURL: string
/** key -> member -> score */
const sets = new Map<string, Map<string, number>>()
const original = {
  zAdd: redis.zAdd,
  zRange: redis.zRange,
  zScore: redis.zScore,
  zRank: redis.zRank,
  zCard: redis.zCard,
}
let username: string | undefined = 'alice'

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
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  sets.clear()
  username = 'alice'
})

async function submit(score: unknown): Promise<Response> {
  return fetch(`${serverURL}/${Endpoint.SubmitScore}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({score}),
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
  assert.equal(body.entries.some(e => e.username === 'user1'), false)
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
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/server/server.test.ts`
Expected: FAIL, the leaderboard route returns 404 and `db.ts` exports nothing.

- [x] **Step 3: Implement db.ts**

```ts
import {redis} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {LeaderboardRsp} from '../shared/api.ts'
import {LEADERBOARD_SIZE} from '../shared/config.ts'

function key(t3: T3): string {
  return `lb:${t3}`
}

/** Store the score only if it beats the player's previous best. */
export async function dbSubmitScore(
  t3: T3,
  username: string,
  score: number,
): Promise<void> {
  const prev = await redis.zScore(key(t3), username)
  if (prev !== undefined && prev >= score) return
  await redis.zAdd(key(t3), {member: username, score})
}

export async function dbGetLeaderboard(
  t3: T3,
  username: string | undefined,
): Promise<LeaderboardRsp> {
  const top = await redis.zRange(key(t3), 0, LEADERBOARD_SIZE - 1, {
    by: 'rank',
    reverse: true,
  })
  const rsp: LeaderboardRsp = {
    entries: top.map(m => ({username: m.member, score: m.score})),
  }
  if (!username) return rsp
  const [score, ascRank, total] = await Promise.all([
    redis.zScore(key(t3), username),
    redis.zRank(key(t3), username),
    redis.zCard(key(t3)),
  ])
  if (score === undefined || ascRank === undefined) return rsp
  rsp.me = {username, score, rank: total - ascRank}
  return rsp
}
```

- [x] **Step 4: Add the two routes to server.ts**

Add imports at the top of `src/server/server.ts`:

```ts
import {once} from 'node:events'
import {MAX_SCORE} from '../shared/config.ts'
import type {LeaderboardRsp, SubmitScoreReq} from '../shared/api.ts'
import {dbGetLeaderboard, dbSubmitScore} from './db.ts'
```

Widen `AnyRsp`:

```ts
type AnyRsp = LeaderboardRsp | UiResponse | TriggerResponse | ErrorRsp
```

Add cases to the switch before `default`:

```ts
      case Endpoint.GetLeaderboard:
        rsp = await routeGetLeaderboard()
        break
      case Endpoint.SubmitScore:
        rsp = await routeSubmitScore(reqMsg)
        break
```

Add the handlers and JSON reader:

```ts
async function routeGetLeaderboard(): Promise<LeaderboardRsp> {
  const t3 = context.postId
  if (!t3) throw Error('no t3')
  return dbGetLeaderboard(t3, context.username)
}

async function routeSubmitScore(
  reqMsg: IncomingMessage,
): Promise<LeaderboardRsp | ErrorRsp> {
  const t3 = context.postId
  if (!t3) throw Error('no t3')
  const username = context.username
  if (!username) return {error: 'sign in to post a score', status: 401}
  const req = await readJson<Partial<SubmitScoreReq>>(reqMsg)
  const score = req?.score
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > MAX_SCORE
  )
    return {error: 'invalid score', status: 400}
  await dbSubmitScore(t3, username, score)
  return dbGetLeaderboard(t3, username)
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T | undefined> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  try {
    return JSON.parse(`${Buffer.concat(chunks)}`) as T
  } catch {
    return
  }
}
```

Note the `default:` branch keeps `endpoint satisfies never` from the template if the exhaustive check type-checks; otherwise leave the plain 404.

- [x] **Step 5: Run tests to verify they pass**

Run: `node --experimental-strip-types --no-warnings=ExperimentalWarning --test src/server/server.test.ts`
Expected: 8 PASS. Then `npm test` for the full suite.

- [x] **Step 6: Commit**

```bash
npm run format
git add src/server
git commit -m "feat: add per-post leaderboard endpoints backed by a redis sorted set"
```

---

### Task 6: Local dev server without Reddit

**Files:**
- Create: `scripts/local-server.ts`
- Modify: `package.json` (scripts), `biome.jsonc` if the script trips a lint

**Interfaces:**
- Consumes: `Endpoint` from `src/shared/api.ts`, `LeaderboardRsp`, `MAX_SCORE`, `LEADERBOARD_SIZE`.
- Produces: `npm run dev:local` serves `public/` at `http://localhost:8787` and fakes both API routes in memory with username `local-player`.

- [x] **Step 1: Write the script**

`scripts/local-server.ts`:

```ts
#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning
import {once} from 'node:events'
import {createReadStream, existsSync, statSync} from 'node:fs'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {extname, join, normalize} from 'node:path'
import {Endpoint, type LeaderboardRsp} from '../src/shared/api.ts'
import {LEADERBOARD_SIZE, MAX_SCORE} from '../src/shared/config.ts'

const PORT = Number(process.env.PORT ?? 8787)
const PUBLIC = join(import.meta.dirname, '..', 'public')
const USERNAME = 'local-player'
const scores = new Map<string, number>([
  ['snoo', 420],
  ['wombat_fan', 260],
])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
}

function leaderboard(): LeaderboardRsp {
  const all = [...scores.entries()]
    .map(([username, score]) => ({username, score}))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
  const rank = all.findIndex(e => e.username === USERNAME)
  const rsp: LeaderboardRsp = {entries: all.slice(0, LEADERBOARD_SIZE)}
  if (rank >= 0) {
    const me = all[rank]
    if (me) rsp.me = {username: USERNAME, score: me.score, rank: rank + 1}
  }
  return rsp
}

async function handle(req: IncomingMessage, rsp: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname.slice(1)

  if (path === Endpoint.GetLeaderboard && req.method === 'GET')
    return json(rsp, 200, leaderboard())

  if (path === Endpoint.SubmitScore && req.method === 'POST') {
    const chunks: Uint8Array[] = []
    req.on('data', c => chunks.push(c))
    await once(req, 'end')
    let score: unknown
    try {
      score = (JSON.parse(`${Buffer.concat(chunks)}`) as {score?: unknown}).score
    } catch {
      return json(rsp, 400, {error: 'bad json', status: 400})
    }
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > MAX_SCORE
    )
      return json(rsp, 400, {error: 'invalid score', status: 400})
    scores.set(USERNAME, Math.max(scores.get(USERNAME) ?? 0, score))
    return json(rsp, 200, leaderboard())
  }

  const rel = path === '' ? 'game.html' : normalize(path)
  const file = join(PUBLIC, rel)
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    rsp.writeHead(404).end('not found')
    return
  }
  rsp.writeHead(200, {'Content-Type': MIME[extname(file)] ?? 'application/octet-stream'})
  createReadStream(file).pipe(rsp)
}

function json(rsp: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  rsp.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  })
  rsp.end(text)
}

createServer((req, rsp) => {
  handle(req, rsp).catch(err => {
    console.error(err)
    if (!rsp.headersSent) rsp.writeHead(500)
    rsp.end()
  })
}).listen(PORT, () => console.log(`local game at http://localhost:${PORT}`))
```

- [x] **Step 2: Add npm scripts**

In `package.json` `scripts`, add:

```json
"dev:local": "sh -c 'trap \"kill 0\" exit; npm run build:client -- --watch=forever& node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/local-server.ts& wait' --",
```

- [x] **Step 3: Verify it serves and fakes the API**

Run in background: `npm run dev:local`
Then:

```bash
curl -s localhost:8787/api/leaderboard
curl -s -X POST -H 'Content-Type: application/json' -d '{"score":999}' localhost:8787/api/score
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/animals/whale.png
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/
```

Expected: first returns the two seeded entries with no `me`; second returns `local-player` at rank 1 with 999; the PNG and `/` return 200. Stop the server.

- [x] **Step 4: Lint and type check**

Run: `npm test`
Expected: PASS. `tsc --build` does not include `scripts/`, so the file is only linted. If Biome flags `import.meta.dirname`, that is a Node 20.11+ API and fine; disable the rule inline only if it blocks.

- [x] **Step 5: Commit**

```bash
npm run format
git add scripts/local-server.ts package.json biome.jsonc
git commit -m "feat: add local dev server that fakes the leaderboard api"
```

---

### Task 7: Renderer and input

**Files:**
- Create: `src/client/render.ts`, `src/client/input.ts`

**Interfaces:**
- Consumes: `PhysicsBody` from `./physics.ts`; `WORLD`, `DANGER_Y`, `DROP_Y` from `../shared/config.ts`; `TIERS`, `tierName`, `tierRadius` from `../shared/tiers.ts`.
- Produces:
  - `loadSprites(): Promise<Map<number, HTMLImageElement>>`
  - `type Scene = {bodies: readonly PhysicsBody[]; hover?: {tier: number; x: number}; nextTier: number; score: number; danger: boolean}`
  - `class Renderer` with `constructor(canvas: HTMLCanvasElement, sprites: Map<number, HTMLImageElement>)`, `resize(): void`, `draw(scene: Scene): void`, `toWorldX(clientX: number): number`.
  - `attachInput(canvas: HTMLCanvasElement, handlers: {move(clientX: number): void; drop(clientX: number): void}): () => void` returning a detach function.

These are browser-only modules and are verified visually in Task 8. Keep them free of game logic so that the tested `game.ts` stays the single source of rules.

- [x] **Step 1: Write render.ts**

```ts
import {DANGER_Y, DROP_Y, WORLD} from '../shared/config.ts'
import {TIERS, tierName, tierRadius} from '../shared/tiers.ts'
import type {PhysicsBody} from './physics.ts'

export type Scene = {
  bodies: readonly PhysicsBody[]
  /** The animal waiting to be dropped, if the player may drop right now. */
  hover?: {tier: number; x: number}
  nextTier: number
  score: number
  /** Flash the danger line when something is close to ending the game. */
  danger: boolean
}

export async function loadSprites(): Promise<Map<number, HTMLImageElement>> {
  const entries = await Promise.all(
    TIERS.map(async t => {
      const img = new Image()
      img.src = `animals/${t.name}.png`
      await img.decode()
      return [t.tier, img] as const
    }),
  )
  return new Map(entries)
}

export class Renderer {
  #canvas: HTMLCanvasElement
  #ctx: CanvasRenderingContext2D
  #sprites: Map<number, HTMLImageElement>
  #scale = 1
  #offsetX = 0
  #offsetY = 0

  constructor(canvas: HTMLCanvasElement, sprites: Map<number, HTMLImageElement>) {
    this.#canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('no 2d context')
    this.#ctx = ctx
    this.#sprites = sprites
    this.resize()
  }

  /** Fit the 400x600 world into the canvas's CSS box, centred, HiDPI aware. */
  resize(): void {
    const rect = this.#canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.#canvas.width = Math.round(rect.width * dpr)
    this.#canvas.height = Math.round(rect.height * dpr)
    this.#scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height)
    this.#offsetX = (rect.width - WORLD.width * this.#scale) / 2
    this.#offsetY = (rect.height - WORLD.height * this.#scale) / 2
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** CSS pixel x (clientX) to world x. */
  toWorldX(clientX: number): number {
    const rect = this.#canvas.getBoundingClientRect()
    return (clientX - rect.left - this.#offsetX) / this.#scale
  }

  draw(scene: Scene): void {
    const ctx = this.#ctx
    const rect = this.#canvas.getBoundingClientRect()
    ctx.save()
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#1f2430'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.translate(this.#offsetX, this.#offsetY)
    ctx.scale(this.#scale, this.#scale)

    // Container
    ctx.fillStyle = '#fdf6e3'
    ctx.fillRect(0, 0, WORLD.width, WORLD.height)
    ctx.strokeStyle = '#5b4636'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, WORLD.height)
    ctx.lineTo(WORLD.width, WORLD.height)
    ctx.lineTo(WORLD.width, 0)
    ctx.stroke()

    // Danger line
    ctx.strokeStyle = scene.danger ? '#e04b3a' : 'rgba(224,75,58,0.35)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(0, DANGER_Y)
    ctx.lineTo(WORLD.width, DANGER_Y)
    ctx.stroke()
    ctx.setLineDash([])

    for (const b of scene.bodies) this.#sprite(b.tier, b.x, b.y, b.angle)

    if (scene.hover) {
      ctx.globalAlpha = 0.9
      this.#sprite(scene.hover.tier, scene.hover.x, DROP_Y, 0)
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#5b4636'
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.moveTo(scene.hover.x, DROP_Y)
      ctx.lineTo(scene.hover.x, WORLD.height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // HUD
    ctx.fillStyle = '#5b4636'
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(`${scene.score}`, 12, 10)
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('NEXT', WORLD.width - 12, 10)
    this.#sprite(scene.nextTier, WORLD.width - 36, 46, 0, 22)
    ctx.restore()
  }

  /** Draw a tier sprite centred at (x, y), longest side = diameter. */
  #sprite(tier: number, x: number, y: number, angle: number, radius = tierRadius(tier)): void {
    const img = this.#sprites.get(tier)
    const ctx = this.#ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    if (img) {
      const d = radius * 2
      const k = d / Math.max(img.naturalWidth, img.naturalHeight)
      const w = img.naturalWidth * k
      const h = img.naturalHeight * k
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else {
      ctx.fillStyle = '#999'
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.font = `${radius}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tierName(tier)[0] ?? '?', 0, 0)
    }
    ctx.restore()
  }
}
```

- [x] **Step 2: Write input.ts**

```ts
export type InputHandlers = {
  /** Pointer moved; clientX in CSS pixels. */
  move(clientX: number): void
  /** Pointer released; clientX in CSS pixels. */
  drop(clientX: number): void
}

/** Mouse and touch via Pointer Events. Returns a detach function. */
export function attachInput(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
): () => void {
  canvas.style.touchAction = 'none'
  const onMove = (ev: PointerEvent): void => handlers.move(ev.clientX)
  const onDown = (ev: PointerEvent): void => {
    canvas.setPointerCapture(ev.pointerId)
    handlers.move(ev.clientX)
  }
  const onUp = (ev: PointerEvent): void => {
    handlers.move(ev.clientX)
    handlers.drop(ev.clientX)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  return () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
  }
}
```

- [x] **Step 3: Type check and lint**

Run: `npm run test:types && npm run lint`
Expected: clean. The client tsconfig has the DOM lib.

- [x] **Step 4: Commit**

```bash
npm run format
git add src/client/render.ts src/client/input.ts
git commit -m "feat: add canvas renderer and pointer input for the game client"
```

---

### Task 8: Wire the client, HTML shell, and leaderboard overlay

**Files:**
- Rewrite: `src/client/main.ts`, `public/game.html`
- Create: `src/client/api.ts`

**Interfaces:**
- Consumes: `Game`, `clampDropX`, `physicsStepsFor` from `./game.ts`; `Physics` from `./physics.ts`; `Renderer`, `loadSprites` from `./render.ts`; `attachInput` from `./input.ts`; `Endpoint`, `LeaderboardRsp`, `SubmitScoreReq` from `../shared/api.ts`; `DROP_Y`, `PHYSICS_STEP_MS`, `MERGE_POP_VELOCITY`, `DANGER_Y` from `../shared/config.ts`.
- Produces: a playable game at `npm run dev:local`.

- [x] **Step 1: Write api.ts**

```ts
import {
  Endpoint,
  type LeaderboardRsp,
  type SubmitScoreReq,
} from '../shared/api.ts'

export async function fetchLeaderboard(): Promise<LeaderboardRsp | undefined> {
  return request(Endpoint.GetLeaderboard)
}

/** Returns the board after submitting, or `signedOut` when the server says 401. */
export async function submitScore(
  score: number,
): Promise<LeaderboardRsp | 'signedOut' | undefined> {
  const req: SubmitScoreReq = {score}
  return request(Endpoint.SubmitScore, req)
}

async function request(
  endpoint: Endpoint,
  body?: unknown,
): Promise<LeaderboardRsp | 'signedOut' | undefined> {
  let rsp: Response
  try {
    rsp = await fetch(endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    console.error(`HTTP error: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (rsp.status === 401) return 'signedOut'
  if (!rsp.ok) {
    console.error(`HTTP ${rsp.status}: ${await rsp.text().catch(() => '')}`)
    return
  }
  return (await rsp.json()) as LeaderboardRsp
}
```

- [x] **Step 2: Write game.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta
      name="viewport"
      content="width=device-width, maximum-scale=1, minimum-scale=1, user-scalable=no"
    >
    <title>Pile Kingdom</title>
    <link rel="modulepreload" href="main.js">
    <style>
    html, body {
      margin: 0;
      width: 100dvw;
      height: 100dvh;
      overflow: hidden;
      background: #1f2430;
      font-family: system-ui, sans-serif;
      color: #fdf6e3;
    }
    canvas {
      display: block;
      width: 100dvw;
      height: 100dvh;
    }
    #overlay {
      position: fixed;
      inset: 0;
      display: none;
      place-items: center;
      background: rgba(31, 36, 48, 0.85);
    }
    #overlay.show { display: grid; }
    #panel {
      background: #fdf6e3;
      color: #5b4636;
      border-radius: 16px;
      padding: 20px 24px;
      min-width: 260px;
      max-width: 90vw;
      text-align: center;
    }
    #panel h1 { margin: 0 0 4px; font-size: 22px; }
    #final { font-size: 40px; font-weight: 700; margin: 4px 0 12px; }
    #board { list-style: none; margin: 0 0 12px; padding: 0; text-align: left; }
    #board li { display: flex; justify-content: space-between; padding: 3px 0; }
    #board li.me { font-weight: 700; }
    #me { margin: 0 0 12px; font-size: 14px; }
    #again {
      font: inherit;
      font-weight: 700;
      padding: 10px 22px;
      border: 0;
      border-radius: 999px;
      background: #e07a3a;
      color: #fff;
      cursor: pointer;
    }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="overlay">
      <div id="panel">
        <h1>Game over</h1>
        <div id="final">0</div>
        <ol id="board"></ol>
        <p id="me"></p>
        <button id="again" type="button">Play again</button>
      </div>
    </div>
    <script src="main.js" type="module"></script>
  </body>
</html>
```

- [x] **Step 3: Write main.ts**

```ts
import type {LeaderboardRsp} from '../shared/api.ts'
import {
  DANGER_Y,
  DROP_Y,
  MERGE_POP_VELOCITY,
  PHYSICS_STEP_MS,
  WORLD,
} from '../shared/config.ts'
import {tierRadius} from '../shared/tiers.ts'
import {fetchLeaderboard, submitScore} from './api.ts'
import {clampDropX, Game, physicsStepsFor} from './game.ts'
import {attachInput} from './input.ts'
import {Physics} from './physics.ts'
import {loadSprites, Renderer} from './render.ts'

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const overlay = document.getElementById('overlay') as HTMLDivElement
  const finalEl = document.getElementById('final') as HTMLDivElement
  const boardEl = document.getElementById('board') as HTMLOListElement
  const meEl = document.getElementById('me') as HTMLParagraphElement
  const againBtn = document.getElementById('again') as HTMLButtonElement

  const sprites = await loadSprites()
  const renderer = new Renderer(canvas, sprites)
  const physics = new Physics()
  const game = new Game()
  let hoverX = WORLD.width / 2
  let last = performance.now()
  let accumulator = 0
  let submitted = false

  window.addEventListener('resize', () => renderer.resize())

  attachInput(canvas, {
    move: clientX => {
      hoverX = clampDropX(renderer.toWorldX(clientX), game.current)
    },
    drop: clientX => {
      if (game.phase !== 'ready') return
      const x = clampDropX(renderer.toWorldX(clientX), game.current)
      const id = physics.spawn(game.current, x, DROP_Y)
      game.drop(performance.now(), id)
      hoverX = clampDropX(x, game.current)
    },
  })

  againBtn.addEventListener('click', () => {
    physics.clear()
    game.reset()
    submitted = false
    overlay.classList.remove('show')
  })

  function frame(now: number): void {
    const elapsed = now - last
    last = now
    accumulator = Math.min(accumulator + elapsed, PHYSICS_STEP_MS * 10)
    const steps = physicsStepsFor(accumulator)
    accumulator -= steps * PHYSICS_STEP_MS

    if (game.phase !== 'over') {
      for (let i = 0; i < steps; i++) {
        const pairs = physics.step(PHYSICS_STEP_MS)
        const merges = game.applyMerges(pairs)
        for (const id of merges.remove) physics.remove(id)
        for (const s of merges.spawn)
          physics.spawn(s.tier, s.x, s.y, MERGE_POP_VELOCITY)
      }
      game.tick(now)
      if (game.checkGameOver(physics.bodies(), now)) void onGameOver()
    }

    const bodies = physics.bodies()
    renderer.draw({
      bodies,
      hover: game.phase === 'ready' ? {tier: game.current, x: hoverX} : undefined,
      nextTier: game.next,
      score: game.score,
      danger: bodies.some(b => b.y - tierRadius(b.tier) < DANGER_Y + 40),
    })
    requestAnimationFrame(frame)
  }

  async function onGameOver(): Promise<void> {
    if (submitted) return
    submitted = true
    finalEl.textContent = `${game.score}`
    boardEl.replaceChildren()
    meEl.textContent = 'Saving score…'
    overlay.classList.add('show')

    let board = await submitScore(game.score)
    if (board === 'signedOut') {
      meEl.textContent = 'Sign in to Reddit to post your score.'
      board = await fetchLeaderboard()
    }
    if (!board) {
      if (!meEl.textContent?.startsWith('Sign in'))
        meEl.textContent = 'Could not load the leaderboard.'
      return
    }
    renderBoard(board)
  }

  function renderBoard(board: LeaderboardRsp): void {
    boardEl.replaceChildren(
      ...board.entries.map((e, i) => {
        const li = document.createElement('li')
        if (e.username === board.me?.username) li.classList.add('me')
        const name = document.createElement('span')
        name.textContent = `${i + 1}. ${e.username}`
        const score = document.createElement('span')
        score.textContent = `${e.score}`
        li.append(name, score)
        return li
      }),
    )
    if (board.me)
      meEl.textContent = `You: #${board.me.rank} with ${board.me.score}`
    else if (!meEl.textContent?.startsWith('Sign in')) meEl.textContent = ''
  }

  requestAnimationFrame(frame)
}

void init()
```

Biome's formatter and import sorter will flag anything left over.

- [x] **Step 4: Build and play locally**

Run in background: `npm run dev:local`. Open `http://localhost:8787` in a browser (or use the harness preview tools). Check:

1. Animals fall, stack, and do not pass through walls.
2. Moving the pointer moves the hovering animal; releasing drops it; a new one appears after half a second.
3. Two identical animals touching merge into the next tier and the score increases.
4. Stacking past the dashed line for one second shows the overlay with the final score and the board with `local-player` in it.
5. "Play again" clears the board and resets score.
6. Narrow the window to phone width; the playfield scales and stays centred.

Fix anything broken before committing. If sprites look too large or small relative to the physics circle, adjust only the sprite scale in `render.ts`, not the radii.

- [x] **Step 5: Full check and commit**

Run: `npm test`
Expected: PASS.

```bash
npm run format
git add src/client/main.ts src/client/api.ts public/game.html
git commit -m "feat: wire physics, rules, renderer, and leaderboard into a playable client"
```

---

### Task 9: Splash screen, README, and Devvit setup notes

**Files:**
- Modify: `public/splash.html`, `src/client/splash.ts` (keep as is), `readme.md` (rename to `README.md`), `devvit.json` (menu label text)
- Delete: `public/snoo.png`

**Interfaces:**
- Produces: a splash that shows the whale sprite and a "Play" button; a README with local dev, Devvit onboarding, and the manual test checklist.

- [x] **Step 1: Update splash.html**

Replace the `<main>` contents with:

```html
    <main>
      <img src="/animals/whale.png" width="138" height="154" alt="Whale">
      <h1>Pile Kingdom</h1>
      <p>Have a whale of a pile. Match two animals to make a bigger one.</p>
      <button id="start-btn" type="button">Play</button>
    </main>
```

And add to the style block:

```css
    body { background: #fdf6e3; color: #5b4636; font-family: system-ui, sans-serif; text-align: center; }
    h1 { margin: 0; font-size: 28px; }
    p { margin: 0; font-size: 14px; }
    button { font: inherit; font-weight: 700; padding: 10px 28px; border: 0; border-radius: 999px; background: #e07a3a; color: #fff; cursor: pointer; }
```

```bash
git rm -q public/snoo.png
```

- [x] **Step 2: Update devvit.json menu copy**

Change the menu item to `"label": "[Pile Kingdom] New game post"` and `"description": "Create a new Pile Kingdom game post."`.

- [x] **Step 3: Write README.md**

```bash
git mv readme.md README.md
```

Content:

````markdown
# Pile Kingdom

A Suika-style drop-and-merge game for Reddit, built on Devvit. Drop animals into
the pen; two of the same kind merge into the next bigger animal. Each game post
keeps its own top-10 leaderboard.

Tiers: chick, frog, duck, rabbit, penguin, dog, pig, cow, hippo, elephant, whale.

## Play locally (no Reddit account needed)

```sh
npm install
npm run dev:local
```

Open http://localhost:8787. The leaderboard is faked in memory under the name
`local-player`.

## Run on Reddit

1. Create a Reddit account and visit https://developers.reddit.com to accept the
   developer terms.
2. Create a private test subreddit you moderate.
3. `npx devvit login`
4. `npm run playtest r/<your-test-sub>` builds, uploads, and installs the app,
   then rebuilds on every change.
5. In the subreddit, open the mod menu and pick "[Pile Kingdom] New game post".

## Commands

- `npm run dev:local`: local browser build with a fake API.
- `npm run playtest [r/sub]`: live develop on Reddit.
- `npm test`: type check, lint, unit tests, and build.
- `npm run format`: fix lints and formatting.
- `npm run publish`: build, upload, and request app review.

## Manual test checklist

- Desktop and a phone-width viewport: playfield scales and stays centred.
- Drop, cooldown, and the hover animal follows the pointer and finger.
- Merge up to at least the dog (tier 6); score rises by 1, 3, 6, 10, 15, 21.
- Fill past the dashed line for one second: game over overlay appears.
- Leaderboard shows your name and rank; "Play again" resets.

## Layout

- `src/shared/`: tier table, tuning constants, API types shared by client and server.
- `src/client/game.ts`: pure rules (merging, scoring, cooldown, game over). Tested.
- `src/client/physics.ts`: the only file that touches Matter.js. Tested headless.
- `src/client/render.ts`, `input.ts`, `main.ts`, `api.ts`: browser wiring.
- `src/server/`: Devvit server with the leaderboard endpoints. Tested with a fake Redis.
- `scripts/local-server.ts`: static server plus fake API for local play.
- `public/animals/`: sprites from Kenney's Animal Pack Redux (CC0).

## Credits

Animal art: [Kenney Animal Pack Redux](https://kenney.nl/assets/animal-pack),
CC0. Physics: [Matter.js](https://brm.io/matter-js/).
````

- [x] **Step 4: Build and check the splash renders**

Run: `npm run build` then open `public/splash.html` via the local server at `http://localhost:8787/splash.html`. The whale and Play button show. Clicking Play outside Reddit does nothing, which is expected because `requestExpandedMode` needs the Reddit host.

- [x] **Step 5: Full check and commit**

Run: `npm test`
Expected: PASS.

```bash
npm run format
git add -A
git commit -m "docs: add splash screen copy, README with devvit onboarding, and test checklist"
```
