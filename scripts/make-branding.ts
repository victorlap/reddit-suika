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

// The pile is a pyramid: a short tower either side of the crowned whale, so the
// silhouette rises to the mascot and the animals read as heaped, not lined up.
function banner(): string {
  const css = `
    .mound {position: absolute; left: -400px; bottom: -252px; width: 2720px; height: 320px; border-radius: 50%; background: ${MOUND};}
    .word {position: absolute; left: 368px; top: 50%; transform: translateY(-50%);}
    h1 {margin: 0; font-size: 84px; line-height: 1; letter-spacing: 1px; color: ${BROWN};}
    .bar {width: 116px; height: 11px; border-radius: 6px; background: ${ORANGE}; margin: 24px 0 18px;}
    p {margin: 0; font-size: 27px; color: ${BROWN}; opacity: 0.72;}
    .rabbit {left: 1085px; bottom: 28px; height: 142px; transform: rotate(-5deg);}
    .frog {left: 1097px; bottom: 148px; height: 92px; transform: rotate(-8deg);}
    .whale {left: 1215px; bottom: 24px; height: 268px;}
    .crown {left: 1247px; bottom: 202px; transform: rotate(-16deg);}
    .duck {left: 1445px; bottom: 26px; height: 118px; transform: rotate(6deg);}
    .chick {left: 1465px; bottom: 134px; height: 88px; transform: rotate(-6deg);}`
  const body = `<div class='mound'></div>
    <div class='word'><h1>PILE KINGDOM</h1><div class='bar'></div><p>Have a whale of a pile.</p></div>
    <img class='rabbit' src='${sprite('rabbit')}' alt=''>
    <img class='frog' src='${sprite('frog')}' alt=''>
    <img class='duck' src='${sprite('duck')}' alt=''>
    <img class='chick' src='${sprite('chick')}' alt=''>
    <img class='whale' src='${sprite('whale')}' alt=''>
    ${crown(98)}`
  return page(1920, 384, css, body)
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
if (!only || only === 'banner')
  await shoot(banner(), 'banner-1920x384.png', 1920, 384)
if (!only || only === 'icon') {
  await shoot(icon(), 'icon-256.png', 256, 256)
  await shoot(icon(), 'icon-512.png', 256, 256, 2)
}
