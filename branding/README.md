# Subreddit branding

Uploaded by hand in the subreddit's **Mod Tools → Appearance**; nothing here is
bundled into the app.

| File | Where it goes |
| --- | --- |
| `icon-256.png` | Community icon. Reddit crops it to a circle, so the orange ring is inset. |
| `icon-512.png` | Same artwork at 2x, for anywhere that wants a larger source. |
| `banner-1920x384.png` | Community banner. |

The banner keeps the wordmark and the pile inside the middle 1280px, so a
centred crop on narrow screens still shows both.

Regenerate after a palette or sprite change:

```sh
npm run branding
```

The mascot is `public/animals/whale.png` itself, so the crowned whale always
matches the one you merge your way to in game. Animal sprites are from Kenney's
Animal Pack Redux (CC0) — see `public/animals/LICENSE.txt`.
