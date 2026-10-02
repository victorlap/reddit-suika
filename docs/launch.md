# Launch kit

Everything needed to open r/PileKingdom to the public and tell people about it.
Steps marked "by hand" need a moderator account and can't be scripted.

## Before posting anywhere

1. Merge the `launch-prep` branch so the simulated-clock game-over fix ships.
   Without it, a phone that drops frames or comes back from the background
   mid-drop can end a round after a few drops.
2. `npm run publish` and wait for the approval email. Devvit reviews every
   custom-post app. Until a version is approved it only installs on
   subreddits under 200 subscribers, so the sub stops taking updates once a
   launch brings people in.
3. `npx devvit install r/PileKingdom` once approved. As of 2026-10-02 the sub
   runs v0.0.12, which predates the fix. Check with `npx devvit list installs`.
4. By hand: in Mod Tools, Appearance, upload `branding/icon-256.png` and both
   banners (see `branding/README.md`).
5. By hand: paste the description and rules below.
6. By hand: mod menu, "[Pile Kingdom] New game post". Play one round on a phone
   and one on desktop. Post a score, then press "Challenge the subreddit" once
   to confirm user-run posts work on the published version (the asUser
   `SUBMIT_POST` fix in 8228f65 has only ever run in playtest).
7. By hand: post the welcome post below and pin it. Pin the game post too.

Then share, in this order, a day or two apart so you can fix what the first
wave finds before the second sees it: r/PileKingdom welcome, r/Devvit,
anywhere else.

## Subreddit description

Under Reddit's 500-character limit.

> Pile Kingdom is a drop-and-merge game you play right in the feed. Drop
> animals into the pen. Two of the same kind merge into the next one up, from
> chick to whale. Every game post keeps its own top 10, and any score can
> become a challenge post for the rest of the sub. No install, no account
> needed to play.

## Rules

1. Keep it about Pile Kingdom. Game posts, challenges, strategy, screenshots,
   and bug reports all count.
2. Be decent. Trash talk about scores is fine. Trash talk about people isn't.
3. Report bugs in the pinned post or on the issue tracker, with your device and
   what you were doing.

## Welcome post (r/PileKingdom, pinned)

**Title:** Welcome to Pile Kingdom. Start here.

> Pile Kingdom is a Suika-style game that runs inside Reddit posts. Drop an
> animal into the pen. When two of the same animal touch, they merge into the
> next one up the row:
>
> chick, frog, duck, rabbit, penguin, dog, pig, cow, hippo, elephant, whale
>
> Bigger merges pay more (1, 3, 6, 10, 15, 21 and up), so the points live at
> the top of the chain. If the pile sits above the dashed line for a second,
> the round is over.
>
> Each game post has its own top 10. When a round ends you can hit "Challenge
> the subreddit" to turn your score into a new post with your name on the
> board. You get one challenge per post, so the feed doesn't drown.
>
> Nobody has made a whale here yet. Post a screenshot when you do.
>
> Found a bug? Reply here with your device and what happened, or open an issue
> at https://github.com/victorlap/reddit-suika/issues. The code is open source.

## r/Devvit showcase post

Use the showcase flair if the sub offers one. Link to a game post, not the
subreddit, so people land in a playable card.

**Title:** I built Pile Kingdom, a Suika-style merge game that plays inside the post

> Pile Kingdom is a drop-and-merge game on Devvit Web. You drop animals into a
> pen, matching pairs merge into the next animal up, and the goal is the whale.
> Play it here: <link to the pinned game post>
>
> A few things I found worth sharing:
>
> - **The splash card plays a real game.** It runs the same Matter.js physics
>   off-screen to seed a settled pile, then keeps dropping animals while you
>   read. It's the cheapest "this is a game, tap it" signal I could think of.
> - **Challenge posts.** At game over, a player can submit their score as a new
>   post, run as the user, with their score already on its leaderboard. One
>   per player per post, enforced server-side, so it can't flood a sub.
> - **Game-over timing runs on simulated time, not the wall clock.** Physics
>   catches up at most five steps a frame. On a phone that came back from the
>   background, a wall-clock timer ended rounds on animals that never got the
>   time to fall. Counting simulated milliseconds fixed it.
> - **Journeys.** Each round reports a journey, and "complete" means you made a
>   whale. Every round ends by overflowing, so counting those would pin
>   completion at 100%.
>
> Art and sound are CC0 from Kenney, music is CC0 from OpenGameArt. Source is
> BSD-3: https://github.com/victorlap/reddit-suika
>
> Feedback welcome, especially on how it feels on older phones.

## After launch

- `npx devvit logs r/PileKingdom` while the first posts are live.
- Watch the pinned post and GitHub issues for the first few days.
- Journeys stay at `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED` until the Devvit
  team allowlists the app (see the README). Ask them once there's traffic
  worth measuring.
