#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning
// Renders the subreddit icon and banner. The mascot is the game's own whale
// sprite rather than a redraw, so the branding and the pen never drift apart.
import {spawn} from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as sleep} from 'node:timers/promises'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'branding')
const CREAM = '#fdf6e3'
const MOUND = '#faf1da'
const BROWN = '#5b4636'
const ORANGE = '#e07a3a'
const FONT = `'Arial Rounded MT Bold', 'Chalkboard SE', system-ui, sans-serif`

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find(path => existsSync(path))

// One scratch dir for every shot: a fresh --user-data-dir makes Chrome redo
// first-run setup, which costs far more than the renders themselves.
const SCRATCH = mkdtempSync(join(tmpdir(), 'pile-branding-'))

/** Inlines a sprite so the rendered page has no external requests to race. */
function sprite(name: string): string {
  const png = readFileSync(join(ROOT, 'public', 'animals', `${name}.png`))
  return `data:image/png;base64,${png.toString('base64')}`
}

/** Flat crown in the accent colour. The round joins come from stroking the fill. */
function crown(width: number): string {
  return `<svg class='crown' width='${width}' viewBox='0 0 100 72'><path d='M10 60 V22 L32 40 L50 12 L68 40 L90 22 V60 Z' fill='${ORANGE}' stroke='${ORANGE}' stroke-width='11' stroke-linejoin='round'/></svg>`
}

function page(
  width: number,
  height: number,
  css: string,
  body: string,
): string {
  return `<!doctype html><html><head><meta charset='utf-8'><style>
    html, body {margin: 0; padding: 0;}
    body {width: ${width}px; height: ${height}px; overflow: hidden; position: relative; background: ${CREAM}; font-family: ${FONT};}
    img, svg {position: absolute; display: block;}
    ${css}
  </style></head><body>${body}</body></html>`
}

// Reddit shows desktop banners at 8.375:1 (its stated floor is 1072x128), so
// this renders three times that. The heap runs long and low rather than tall:
// a taller cluster would just get cropped away at that aspect.
function bannerDesktop(): string {
  const css = `
    .mound {position: absolute; left: -500px; bottom: -300px; width: 4400px; height: 380px; border-radius: 50%; background: ${MOUND};}
    .word {position: absolute; left: 500px; top: 50%; transform: translateY(-50%);}
    h1 {margin: 0; font-size: 110px; line-height: 1; letter-spacing: 1px; color: ${BROWN};}
    .bar {width: 150px; height: 14px; border-radius: 7px; background: ${ORANGE}; margin: 26px 0 18px;}
    p {margin: 0; font-size: 38px; color: ${BROWN}; opacity: 0.72;}
    .cow {left: 1660px; bottom: 30px; height: 145px; transform: rotate(-3deg);}
    .dog {left: 1790px; bottom: 28px; height: 165px; transform: rotate(2deg);}
    .rabbit {left: 1900px; bottom: 30px; height: 160px; transform: rotate(-5deg);}
    .frog {left: 1911px; bottom: 168px; height: 104px; transform: rotate(-8deg);}
    .penguin {left: 2230px; bottom: 28px; height: 180px; transform: rotate(3deg);}
    .chick {left: 2278px; bottom: 186px; height: 98px; transform: rotate(-6deg);}
    .pig {left: 2400px; bottom: 30px; height: 170px; transform: rotate(-2deg);}
    .hippo {left: 2550px; bottom: 28px; height: 145px; transform: rotate(4deg);}
    .whale {left: 1995px; bottom: 26px; height: 300px;}
    .crown {left: 2031px; top: 80px; transform: rotate(-16deg);}`
  // Paint order is the heap's depth: the crowned whale lands last so it stays
  // the summit no matter how much the neighbours overlap it.
  const heap = [
    'cow',
    'dog',
    'rabbit',
    'frog',
    'penguin',
    'chick',
    'pig',
    'hippo',
    'whale',
  ]
    .map(name => `<img class='${name}' src='${sprite(name)}' alt=''>`)
    .join('')
  const body = `<div class='mound'></div>
    <div class='word'><h1>PILE KINGDOM</h1><div class='bar'></div><p>Have a whale of a pile.</p></div>
    ${heap}${crown(110)}`
  return page(3216, 384, css, body)
}

// Mobile's floor is 1080x128 -- all but the same shape as desktop, so the cut
// differs by weight, not proportion. It lands about 1080px wide on a phone
// against a desktop banner's full monitor width, so the tagline would shrink
// past reading and eight animals would turn to mush. Fewer, bigger, bolder.
function bannerMobile(): string {
  const css = `
    .mound {position: absolute; left: -500px; bottom: -300px; width: 4400px; height: 380px; border-radius: 50%; background: ${MOUND};}
    .word {position: absolute; left: 400px; top: 50%; transform: translateY(-50%);}
    h1 {margin: 0; font-size: 155px; line-height: 1; letter-spacing: 1px; color: ${BROWN};}
    .bar {width: 180px; height: 16px; border-radius: 8px; background: ${ORANGE}; margin: 28px 0 0;}
    .cow {left: 1900px; bottom: 24px; height: 175px; transform: rotate(-3deg);}
    .rabbit {left: 2070px; bottom: 26px; height: 190px; transform: rotate(-5deg);}
    .penguin {left: 2420px; bottom: 26px; height: 200px; transform: rotate(3deg);}
    .pig {left: 2615px; bottom: 24px; height: 185px; transform: rotate(-2deg);}
    .whale {left: 2170px; bottom: 24px; height: 300px;}
    .crown {left: 2206px; top: 82px; transform: rotate(-16deg);}`
  // Neighbours are kept apart in hue as well as space: two greys side by side
  // merge into one shape once this is down at phone size.
  const heap = ['cow', 'rabbit', 'penguin', 'pig', 'whale']
    .map(name => `<img class='${name}' src='${sprite(name)}' alt=''>`)
    .join('')
  const body = `<div class='mound'></div>
    <div class='word'><h1>PILE KINGDOM</h1><div class='bar'></div></div>
    ${heap}${crown(110)}`
  return page(3240, 384, css, body)
}

function icon(): string {
  const css = `
    .ring {position: absolute; inset: 9px; border-radius: 50%; border: 7px solid ${ORANGE};}
    .whale {left: 52px; bottom: 30px; height: 168px;}
    .crown {left: 66px; top: 44px; transform: rotate(-16deg);}`
  const body = `<div class='ring'></div><img class='whale' src='${sprite('whale')}' alt=''>${crown(70)}`
  return page(256, 256, css, body)
}

async function shoot(
  html: string,
  file: string,
  width: number,
  height: number,
  scale = 1,
): Promise<void> {
  if (!CHROME)
    throw new Error(
      'no Chrome/Chromium/Edge found; this script renders with a local browser',
    )
  const src = join(SCRATCH, `${file}.html`)
  const dest = join(OUT, file)
  writeFileSync(src, html)
  rmSync(dest, {force: true})
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(SCRATCH, 'profile')}`,
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      `--screenshot=${dest}`,
      `file://${src}`,
    ],
    {stdio: 'ignore'},
  )
  try {
    // Headless Chrome writes the screenshot and then, on macOS, keeps running.
    // The file landing and settling is the real success signal, not the exit.
    let size = -1
    for (let tick = 0; tick < 300; tick++) {
      await sleep(100)
      const now = existsSync(dest) ? statSync(dest).size : -1
      if (now > 0 && now === size) {
        console.log(`branding/${file}  ${width * scale}x${height * scale}`)
        return
      }
      size = now
    }
    throw new Error(`chrome never produced ${file}`)
  } finally {
    chrome.kill('SIGKILL')
  }
}

const only = process.argv[2]
mkdirSync(OUT, {recursive: true})
if (!only || only === 'banner') {
  await shoot(bannerDesktop(), 'banner-desktop-3216x384.png', 3216, 384)
  await shoot(bannerMobile(), 'banner-mobile-3240x384.png', 3240, 384)
}
if (!only || only === 'icon') {
  await shoot(icon(), 'icon-256.png', 256, 256)
  await shoot(icon(), 'icon-512.png', 256, 256, 2)
}
