import {
  CHAIN_HEIGHT,
  DANGER_Y,
  DROP_Y,
  HELP_BUTTON,
  MUTE_BUTTON,
  POPUP_FONT_PX,
  STAGE,
  WORLD,
} from '../shared/config.ts'
import {MAX_TIER, TIERS, tierName, tierRadius} from '../shared/tiers.ts'
import type {PhysicsBody} from './physics.ts'
import type {DrawnPopup} from './popups.ts'

/** Chain slots start right of the strip's buttons and run to the world edge. */
const CHAIN_X = MUTE_BUTTON.x + MUTE_BUTTON.size + 8
const CHAIN_PITCH = (WORLD.width - 6 - CHAIN_X) / MAX_TIER
const CHAIN_RADIUS = CHAIN_PITCH / 2 - 1.5

export type Scene = {
  bodies: readonly PhysicsBody[]
  /** The animal waiting to be dropped, if the player may drop right now. */
  hover?: {tier: number; x: number}
  nextTier: number
  /** Highest tier made this round; the chain lights up to here. */
  bestTier: number
  score: number
  /** Flash the danger line when something is close to ending the game. */
  danger: boolean
  /** Scores floating off the merges that earned them. */
  popups: readonly DrawnPopup[]
  /** Body id to size multiplier, for animals still bouncing into being. */
  pops: ReadonlyMap<number, number>
}

export async function loadSprites(): Promise<Map<number, HTMLImageElement>> {
  const entries = await Promise.all(
    TIERS.map(async t => {
      const img = new Image()
      img.src = `animals/${t.name}.png`
      try {
        await img.decode()
      } catch (err) {
        console.error(`failed to load sprite for tier ${t.tier}:`, err)
        return undefined
      }
      return [t.tier, img] as const
    }),
  )
  return new Map(entries.filter(e => e !== undefined))
}

export class Renderer {
  #canvas: HTMLCanvasElement
  #ctx: CanvasRenderingContext2D
  #sprites: Map<number, HTMLImageElement>
  #scale = 1
  #offsetX = 0
  #offsetY = 0
  #rect: DOMRect

  constructor(
    canvas: HTMLCanvasElement,
    sprites: Map<number, HTMLImageElement>,
  ) {
    this.#canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('no 2d context')
    this.#ctx = ctx
    this.#sprites = sprites
    this.#rect = canvas.getBoundingClientRect()
    this.resize()
  }

  /** Fit the bucket and the chain strip into the canvas's CSS box, centred. */
  resize(): void {
    this.#rect = this.#canvas.getBoundingClientRect()
    const rect = this.#rect
    const dpr = window.devicePixelRatio || 1
    this.#canvas.width = Math.round(rect.width * dpr)
    this.#canvas.height = Math.round(rect.height * dpr)
    this.#scale = Math.min(rect.width / STAGE.width, rect.height / STAGE.height)
    this.#offsetX = (rect.width - STAGE.width * this.#scale) / 2
    this.#offsetY = (rect.height - STAGE.height * this.#scale) / 2
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** CSS pixel x (clientX) to world x. */
  toWorldX(clientX: number): number {
    // Read the rect fresh rather than using the cache: left/top are
    // viewport-relative and go stale on scroll, unlike the cached
    // width/height/scale/offsets that draw() uses. This only runs on
    // pointer moves, not every frame, so it doesn't reintroduce the
    // per-frame getBoundingClientRect() cost that resize() caching fixed.
    const rect = this.#canvas.getBoundingClientRect()
    return (clientX - rect.left - this.#offsetX) / this.#scale
  }

  /**
   * Where a chain-strip button goes, in viewport CSS pixels. These are DOM
   * buttons so that they swallow the pointer instead of dropping an animal,
   * which means the page has to move them whenever the stage is laid out again.
   */
  buttonRect(box: {x: number; y: number; size: number}): {
    left: number
    top: number
    size: number
  } {
    const rect = this.#canvas.getBoundingClientRect()
    return {
      left: rect.left + this.#offsetX + box.x * this.#scale,
      top: rect.top + this.#offsetY + box.y * this.#scale,
      size: box.size * this.#scale,
    }
  }

  helpRect(): {left: number; top: number; size: number} {
    return this.buttonRect(HELP_BUTTON)
  }

  muteRect(): {left: number; top: number; size: number} {
    return this.buttonRect(MUTE_BUTTON)
  }

  draw(scene: Scene): void {
    const ctx = this.#ctx
    const rect = this.#rect
    ctx.save()
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#1f2430'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.translate(this.#offsetX, this.#offsetY)
    ctx.scale(this.#scale, this.#scale)

    // Container
    ctx.fillStyle = '#fdf6e3'
    ctx.fillRect(0, 0, WORLD.width, WORLD.height)
    ctx.strokeStyle = '#5b4636'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, WORLD.height)
    ctx.lineTo(WORLD.width, WORLD.height)
    ctx.lineTo(WORLD.width, 0)
    ctx.stroke()

    // Danger line
    ctx.strokeStyle = scene.danger ? '#e04b3a' : 'rgba(224,75,58,0.35)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(0, DANGER_Y)
    ctx.lineTo(WORLD.width, DANGER_Y)
    ctx.stroke()
    ctx.setLineDash([])

    for (const b of scene.bodies)
      this.#sprite(
        b.tier,
        b.x,
        b.y,
        b.angle,
        tierRadius(b.tier) * (scene.pops.get(b.id) ?? 1),
      )

    if (scene.hover) {
      ctx.globalAlpha = 0.9
      this.#sprite(scene.hover.tier, scene.hover.x, DROP_Y, 0)
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#5b4636'
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.moveTo(scene.hover.x, DROP_Y)
      ctx.lineTo(scene.hover.x, WORLD.height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    this.#popups(scene.popups)

    // Evolution chain: what the player has made, and what is still ahead.
    const chainY = WORLD.height + CHAIN_HEIGHT / 2
    for (const t of TIERS) {
      ctx.globalAlpha = t.tier <= scene.bestTier ? 1 : 0.25
      const x = CHAIN_X + (t.tier - 0.5) * CHAIN_PITCH
      this.#sprite(t.tier, x, chainY, 0, CHAIN_RADIUS)
    }
    ctx.globalAlpha = 1

    // HUD
    ctx.fillStyle = '#5b4636'
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(`${scene.score}`, 12, 10)
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('NEXT', WORLD.width - 12, 10)
    this.#sprite(scene.nextTier, WORLD.width - 36, 46, 0, 22)
    ctx.restore()
  }

  /** Scores floating up from their merges, outlined to stay legible on animals. */
  #popups(popups: readonly DrawnPopup[]): void {
    const ctx = this.#ctx
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const p of popups) {
      ctx.globalAlpha = p.alpha
      ctx.font = `bold ${POPUP_FONT_PX * p.scale}px system-ui, sans-serif`
      ctx.lineWidth = 4 * p.scale
      ctx.strokeStyle = '#fdf6e3'
      ctx.strokeText(p.text, p.x, p.y)
      ctx.fillStyle = '#5b4636'
      ctx.fillText(p.text, p.x, p.y)
    }
    ctx.restore()
  }

  /** Draw a tier sprite centred at (x, y), longest side = diameter. */
  #sprite(
    tier: number,
    x: number,
    y: number,
    angle: number,
    radius = tierRadius(tier),
  ): void {
    const img = this.#sprites.get(tier)
    const ctx = this.#ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    if (img) {
      const d = radius * 2
      const k = d / Math.max(img.naturalWidth, img.naturalHeight)
      const w = img.naturalWidth * k
      const h = img.naturalHeight * k
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else {
      ctx.fillStyle = '#999'
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.font = `${radius}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tierName(tier)[0] ?? '?', 0, 0)
    }
    ctx.restore()
  }
}
