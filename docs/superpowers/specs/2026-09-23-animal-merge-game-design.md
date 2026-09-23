# Animal Merge: a Suika-style game for Reddit

Date: 2026-09-23
Status: approved in conversation (sections 1 and 2), sections 3 to 5 written from the same brief

## Purpose

A polished, replayable drop-and-merge physics game that runs inside a Reddit post
via Devvit. Small animals merge into bigger ones. Each game post keeps its own
top-10 leaderboard. The game also runs in a plain browser for local development
because the author has no Devvit account yet.

Success looks like: a stranger opens the post, understands the game in five
seconds, plays a full round on mobile without jank, and sees their name on the
post's leaderboard.

## Decisions already made

| Decision | Choice |
|---|---|
| Platform | Devvit Web, based on the official `bare` template (Node server, Redis, esbuild, no framework) |
| Physics | Matter.js, single canvas, hand-drawn sprites |
| Art | Kenney Animal Pack Redux, `PNG/Round` style, CC0. One PNG per animal, roughly 130 to 180 px, not square |
| Leaderboard | Per post, top 10, stored in Redis sorted set keyed by post ID |
| Tiers | 11: chick, frog, duck, rabbit, penguin, dog, pig, cow, hippo, elephant, whale |
| Local dev | Same client bundle, stub server with in-memory leaderboard |

## 1. Game rules and tuning

**Playfield.** Logical size 400 x 600 units. The canvas scales to fit the webview
preserving aspect ratio. Static walls on left, right, and bottom. Danger line at
y = 100 (from the top).

**Drop loop.** The next animal hovers at y = 60 and follows the pointer or finger
horizontally, clamped so it never overlaps a wall. Pointer release (or tap on
touch) drops it. A 500 ms cooldown follows before the next animal appears.
Only tiers 1 to 5 are ever spawned as drops. The spawn tier is chosen uniformly
from 1 to 5. The upcoming tier is shown as a "next" preview.

**Merging.** When two dynamic bodies of the same tier collide, both are removed
and one body of tier + 1 spawns at their midpoint with a small upward impulse.
Two tier-11 bodies do not merge. A body may take part in at most one merge per
physics tick; the handler tracks a set of body IDs already consumed in this
tick.

**Scoring.** A merge that produces tier `n` adds `n * (n + 1) / 2` points:
1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66 for tiers 1 to 11. Dropping earns
nothing.

**Game over.** If any body whose centre is above the danger line has been there
for one continuous second, the game ends. Bodies still in the 500 ms cooldown
window after a drop are ignored. On game over the client shows the final score,
submits it, and shows the leaderboard with a "play again" button.

**Tier table.** Radii in logical units, sprite file from the pack's round style.

| Tier | Animal | Radius | Score on merge |
|---|---|---|---|
| 1 | chick | 16 | 1 |
| 2 | frog | 22 | 3 |
| 3 | duck | 29 | 6 |
| 4 | rabbit | 37 | 10 |
| 5 | penguin | 46 | 15 |
| 6 | dog | 56 | 21 |
| 7 | pig | 67 | 28 |
| 8 | cow | 79 | 36 |
| 9 | hippo | 92 | 45 |
| 10 | elephant | 106 | 55 |
| 11 | whale | 120 | 66 |

All tuning constants (sizes, cooldown, danger line, gravity, restitution,
friction) live in `src/shared/tiers.ts` and `src/shared/config.ts` so the feel
can be adjusted without touching logic.

## 2. Client architecture

Files under `src/client/`. Each module has one job and a small interface.

- `physics.ts`. Wraps Matter.js. Creates the engine, walls, and bodies. Exposes
  `spawn(tier, x, y)`, `remove(body)`, `step(dtMs)`, `bodies()`, and
  `onCollision(cb)` where `cb` receives pairs of `(bodyA, bodyB)`. Bodies carry
  `{tier, id}` in a typed plugin field. Nothing else imports Matter.
- `game.ts`. Pure state machine with no DOM or Matter dependency, so it runs in
  Node tests. Holds phase (`ready`, `cooldown`, `over`), score, current and
  next tier, and the merge rule. Exposes `resolveMerges(pairs)` returning
  `{remove: id[], spawn: {tier, x, y}[], scoreDelta}` and
  `checkGameOver(bodies, nowMs)`.
- `render.ts`. Draws walls, danger line, each body's sprite rotated to its
  angle, the hovering next animal, the score, and the "next" preview onto a
  2D canvas. Preloads one `HTMLImageElement` per tier. Sprites are not square,
  so each is drawn centred on the body and scaled so its larger dimension
  equals the body diameter, preserving aspect ratio.
- `input.ts`. Pointer events (mouse and touch via Pointer Events API) mapped
  from CSS pixels to logical units. Emits `move(x)` and `drop(x)`.
- `main.ts`. Wires the modules, runs `requestAnimationFrame`, and calls the API
  client at game over. Also handles the leaderboard overlay and replay.
- `api.ts`. Fetch wrapper for the two endpoints, typed from `src/shared/api.ts`.

The HTML shell is `public/game.html` with a full-viewport canvas and a hidden
overlay for game over and leaderboard. `public/splash.html` is the inline
preview shown in the feed with a "Play" button, as the bare template does.

Rendering and physics run on the same `requestAnimationFrame` loop. Physics is
stepped with a fixed 1000/60 ms delta, catching up when a frame is late, and
capped at 5 steps per frame so a background tab does not explode on resume.

## 3. Server and leaderboard

Server code stays as close to the bare template as possible.

**Endpoints** (declared in `src/shared/api.ts` as a const map with method):

- `GET api/leaderboard`. Returns `{entries: {username, score}[], me?: {username, score, rank}}`
  for the current post, top 10.
- `POST api/score` with `{score: number}`. Records the score for the current
  user on the current post if it beats their previous best. Returns the same
  shape as the GET so the client redraws in one step.
- `POST internal/on/menu/new-post` and `POST internal/on/app/install`. Create a
  game post, unchanged from the template.

**Storage.** One Redis sorted set per post: key `lb:<postId>`, member is the
username, score is the best score. `zAdd` with the greater of the existing and
new score. Top 10 via `zRange` with reverse order. User rank via `zRank`.

**Identity.** Username comes from `context.username` on the server. Anonymous
viewers can play but `POST api/score` returns 401 and the client shows the
leaderboard without a "you" row.

**Validation.** Score must be a non-negative integer no greater than 100000.
Anything else returns 400. There is no server-side replay verification; the
client is trusted, which matches the scope of a fun community game. Noted as a
known limitation.

## 4. Local development without a Reddit account

`npm run dev:local` runs `scripts/local-server.ts` with Node: serves `public/`
statically and implements the two `api/` routes with an in-memory map and a
fixed username `local-player`. The client uses relative paths so no code
changes are needed between local and Reddit.

Devvit steps, for later: create a Reddit account, run `npx devvit login`,
create a private test subreddit, then `npm run playtest r/<sub>`. These live in
the README, not in code.

## 5. Testing

- **Unit tests, Node built-in runner** (as the template does): `game.ts` merge
  resolution, scoring, tier capping, game-over timing, spawn tier range. Server
  route handlers with the Redis client replaced by an in-memory fake. Each test
  states the rule it protects in its name.
- **Physics smoke test**: Matter.js runs in Node, so one test spawns two
  same-tier bodies overlapping, steps the engine, and asserts a merge pair is
  reported. This guards the collision-wiring code that is otherwise only
  exercised in a browser.
- **Manual checklist** in the README: play on desktop and phone-width viewport,
  merge to at least tier 6, trigger game over, confirm leaderboard updates.

## Out of scope

Sounds, particle effects, daily seeds, cross-post leaderboards, server-side
anti-cheat, animated sprites. Each can be added later without changing the
module boundaries above.

## Assets

Copy the 11 needed files from `PNG/Round/` in Kenney Animal Pack Redux to
`public/animals/<animal>.png` along with `License.txt` renamed to
`public/animals/LICENSE.txt`. The pack zip is mirrored at
https://opengameart.org/sites/default/files/kenney_animalPackRedux.zip.
