import {
  FANFARE_VOLUME,
  MERGE_RATE,
  MUSIC_VOLUME,
  SFX_VOLUME,
} from '../shared/config.ts'
import {MAX_TIER} from '../shared/tiers.ts'

export type Cue = 'drop' | 'merge' | 'gameover' | 'fanfare'

const CUES: readonly Cue[] = ['drop', 'merge', 'gameover', 'fanfare']
const MUSIC = 'music'
const MUTED_KEY = 'pile-kingdom:muted'

/**
 * How fast to play the merge sample for a merge that produced `tier`. One
 * sample covers the whole chain: a frog chirps, a whale thuds. Tiers outside
 * the mergeable range clamp, because a missing or absurd sound is worse than
 * one that matches its nearest neighbour.
 */
export function mergePlaybackRate(tier: number): number {
  const t = (tier - 2) / (MAX_TIER - 2)
  const clamped = Math.min(Math.max(t, 0), 1)
  return (
    MERGE_RATE.smallest + clamped * (MERGE_RATE.largest - MERGE_RATE.smallest)
  )
}

/**
 * The only file that touches Web Audio, the way physics.ts is the only file
 * that touches Matter.js. Every method is a no-op when the context or a buffer
 * is missing, so a blocked or failed load costs the player sound, never a
 * round.
 */
export class GameAudio {
  #ctx: AudioContext | undefined
  #buffers = new Map<string, AudioBuffer>()
  #master: GainNode | undefined
  #music: AudioBufferSourceNode | undefined
  #muted = false

  constructor(ctx: AudioContext | undefined) {
    this.#ctx = ctx
    if (ctx) {
      this.#master = ctx.createGain()
      this.#master.connect(ctx.destination)
    }
    this.muted = readMuted()
  }

  /**
   * Decode every cue into memory. Cues that fail stay missing rather than
   * throwing, so one bad file costs its own sound and nothing else.
   */
  async load(): Promise<void> {
    const ctx = this.#ctx
    if (!ctx) return
    await Promise.all(
      [...CUES, MUSIC].map(async name => {
        try {
          const rsp = await fetch(`audio/${name}.mp3`)
          if (!rsp.ok) throw Error(`HTTP ${rsp.status}`)
          const buffer = await ctx.decodeAudioData(await rsp.arrayBuffer())
          this.#buffers.set(name, buffer)
        } catch (err) {
          console.error(`failed to load audio for ${name}:`, err)
        }
      }),
    )
  }

  get muted(): boolean {
    return this.#muted
  }

  set muted(value: boolean) {
    this.#muted = value
    if (this.#master) this.#master.gain.value = value ? 0 : 1
    try {
      localStorage.setItem(MUTED_KEY, value ? '1' : '0')
    } catch {
      // Storage can be denied in an embedded webview. Muting still works for
      // this round; it just will not be remembered.
    }
  }

  /**
   * Browsers start an embedded context suspended, so this has to run inside a
   * real gesture handler, synchronously, for iOS to honour it.
   */
  resume(): void {
    if (this.#ctx?.state === 'suspended') void this.#ctx.resume()
  }

  play(cue: Cue, rate = 1): void {
    const gain = cue === 'fanfare' ? FANFARE_VOLUME : SFX_VOLUME
    this.#playBuffer(cue, {gain, rate})
  }

  /** Idempotent: calling it on an already-running loop does nothing. */
  startMusic(): void {
    if (this.#music) return
    this.#music = this.#playBuffer(MUSIC, {gain: MUSIC_VOLUME, loop: true})
  }

  stopMusic(): void {
    this.#music?.stop()
    this.#music = undefined
  }

  #playBuffer(
    name: string,
    opts: {gain: number; rate?: number; loop?: boolean},
  ): AudioBufferSourceNode | undefined {
    const ctx = this.#ctx
    const master = this.#master
    const buffer = this.#buffers.get(name)
    if (!ctx || !master || !buffer) return undefined
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = opts.loop ?? false
    if (opts.rate !== undefined) src.playbackRate.value = opts.rate
    const gain = ctx.createGain()
    gain.gain.value = opts.gain
    src.connect(gain).connect(master)
    src.start()
    return src
  }
}

function newContext(): AudioContext | undefined {
  try {
    return new AudioContext()
  } catch (err) {
    console.error('no audio context, playing silent:', err)
    return undefined
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Usable immediately, silent until the samples arrive. Cues asked for before
 * then are dropped rather than queued: a merge sound that lands a second late
 * is worse than no merge sound at all.
 */
export function loadAudio(): GameAudio {
  const audio = new GameAudio(newContext())
  void audio.load()
  return audio
}
