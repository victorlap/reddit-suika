# Pile Kingdom

Have a whale of a pile. A Suika-style drop-and-merge game for Reddit, built on Devvit. Drop animals into
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

## Deploy a new version

Version numbers live on Reddit's side, not in this repo. Uploading and
publishing each bump the patch number from whatever the server already has, so
there is nothing to edit before deploying. `devvit.json` points `scripts.build`
at `npm run build`, so both build the bundles themselves.

**Every push to `main` uploads automatically.** The `upload` job in
`.github/workflows/ci.yaml` runs after the tests pass and creates a new version.
Uploaded versions are visible only to you and installable on a test subreddit
under 200 subscribers, so this is a deploy for your own testing, not a release.
Pick up the new version with `npx devvit install r/<your-test-sub>`, which
installs `@latest` by default.

**Releasing is manual, on purpose.**

```sh
npm run publish               # once approved, installable anywhere you moderate
npm run publish -- --public   # once approved, listed in the public directory
```

Pile Kingdom uses custom posts, and Devvit sends every custom-post app through
review, so both forms file a review request and wait on an approval email.
Neither takes effect immediately, which is why publishing is not wired to a
push. To cancel a pending request, run `npx devvit publish --withdraw`.

### One-time CI setup

The upload job needs a Devvit token in a repository secret:

1. `npx devvit login` locally, if you have not already.
2. Copy the contents of `~/.devvit/token`. It is a single line of JSON like
   `{"token":"<base64>","copyPaste":false}`. Copy all of it, not just the
   base64 part.
3. In the repo, go to Settings, then Secrets and variables, then Actions, and
   add a secret named `DEVVIT_AUTH_TOKEN` with that value.

The token belongs to your Reddit account and carries your developer
permissions, so treat it like a password. Rotate it by running `npx devvit
logout && npx devvit login` and updating the secret.

## Analytics (Devvit Journeys)

The game reports a Journey per round. Numbers land on the app's Analytics tab at
https://developers.reddit.com.

| Event | Fires when |
| --- | --- |
| `App.Ready` | sprites finish loading |
| `Journey.Start` | the first drop of a round |
| `Journey.Progress` | a merge beats the round's best tier, `progress` 0.1 to 1 |
| `Journey.Interaction` | "Play again" is clicked |
| `Journey.End` | game over, `win` when the round made a whale |

Every round ends by filling the pen, so counting all of them as complete would
pin completion rate at 100%. Making a whale is the objective, so that is what
`complete` and `win` mean here. Read completion rate as "share of rounds that
reached the whale".

Two gates stand between this code and real numbers:

- Playtest builds never ingest. Every receipt comes back
  `JOURNEY_RECEIPT_DENIED_PLAYTEST`.
- Published apps ingest only after Reddit allowlists the app and approves the
  journey map above. Until then receipts read
  `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED`, which is the cue to ask the Devvit
  team for access.

The client logs the first receipt of each kind to the browser console, so open
devtools to see which gate you are behind. Locally, `dev:local` stubs the routes
and logs one line saying so.

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
- `src/client/journey.ts`: pure Journey rules (progress scale, report-once). Tested.
- `src/client/render.ts`, `input.ts`, `main.ts`, `api.ts`, `telemetry.ts`: browser wiring.
- `src/server/`: Devvit server with the leaderboard endpoints. Tested with a fake Redis.
- `scripts/local-server.ts`: static server plus fake API for local play.
- `public/animals/`: sprites from Kenney's Animal Pack Redux (CC0).

## Credits

Animal art: [Kenney Animal Pack Redux](https://kenney.nl/assets/animal-pack),
CC0. Physics: [Matter.js](https://brm.io/matter-js/).
