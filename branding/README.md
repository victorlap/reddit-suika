# Subreddit branding

Uploaded by hand in the subreddit's **Mod Tools → Appearance**; nothing here is
bundled into the app.

| File | Where it goes |
| --- | --- |
| `icon-256.png` | Community icon. Reddit crops it to a circle, so the orange ring is inset. |
| `icon-512.png` | Same artwork at 2x, for anywhere that wants a larger source. |
| `banner-desktop-3216x384.png` | Desktop community banner. |
| `banner-mobile-3240x384.png` | Mobile community banner. |

Reddit's floors are 1072x128 for desktop banners and 1080x128 for mobile, and it
displays them at those aspects. Both are rendered at three times those
dimensions. The shape drives the composition: the heap runs long and low across
the strip rather than stacking tall, because height at 8.4:1 just gets cropped
away.

The two banners differ by weight rather than proportion, since the shapes are
all but identical. The mobile cut lands roughly 1080px wide on a phone, against
a desktop banner's full monitor width, so it drops the tagline and carries five
big animals where desktop carries eight — at phone size the tagline falls below
reading and a denser heap turns to mush. Both were checked scaled down to their
stated floors.

Regenerate after a palette or sprite change:

```sh
npm run branding
```

The mascot is `public/animals/whale.png` itself, so the crowned whale always
matches the one you merge your way to in game. Animal sprites are from Kenney's
Animal Pack Redux (CC0) — see `public/animals/LICENSE.txt`.
