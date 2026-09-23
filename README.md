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
