# Subreddit branding

Uploaded by hand in the subreddit's **Mod Tools → Appearance**; nothing here is
bundled into the app.

| File | Where it goes |
| --- | --- |
| `icon-256.png` | Community icon. Reddit crops it to a circle, so the orange ring is inset. |
| `icon-512.png` | Same artwork at 2x, for anywhere that wants a larger source. |
| `banner-3216x384.png` | Desktop community banner. |

Reddit asks for desktop banners of at least 1072x128, and displays them at that
8.375:1 aspect, so the banner is rendered at three times those dimensions. The
shape drives the composition: the heap runs long and low across the strip
rather than stacking tall, because height at that aspect just gets cropped
away. Everything stays legible scaled down to 1072x128.

Mobile banners are a separate, squarer asset that this does not cover.

Regenerate after a palette or sprite change:

```sh
npm run branding
```

The mascot is `public/animals/whale.png` itself, so the crowned whale always
matches the one you merge your way to in game. Animal sprites are from Kenney's
Animal Pack Redux (CC0) — see `public/animals/LICENSE.txt`.
