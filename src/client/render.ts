import {DANGER_Y, DROP_Y, WORLD} from '../shared/config.ts'
import {TIERS, tierName, tierRadius} from '../shared/tiers.ts'
import type {PhysicsBody} from './physics.ts'

export type Scene = {
  bodies: readonly PhysicsBody[]
  /** The animal waiting to be dropped, if the player may drop right now. */
  hover?: {tier: number; x: number}
  nextTier: number
  score: number
  /** Flash the danger line when something is close to ending the game. */
  danger: boolean
}

export async function loadSprites(): Promise<Map<number, HTMLImageElement>> {
  const entries = await Promise.all(
    TIERS.map(async t => {
      const img = new Image()
      img.src = `animals/${t.name}.png`
      await img.decode()
      return [t.tier, img] as const
    }),
  )
  return new Map(entries)
}

export class Renderer {
  #canvas: HTMLCanvasElement
  #ctx: CanvasRenderingContext2D
  #sprites: Map<number, HTMLImageElement>
  #scale = 1
  #offsetX = 0
  #offsetY = 0

  constructor(
    canvas: HTMLCanvasElement,
    sprites: Map<number, HTMLImageElement>,
  ) {
    this.#canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('no 2d context')
    this.#ctx = ctx
    this.#sprites = sprites
    this.resize()
  }

  /** Fit the 400x600 world into the canvas's CSS box, centred, HiDPI aware. */
  resize(): void {
    const rect = this.#canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.#canvas.width = Math.round(rect.width * dpr)
    this.#canvas.height = Math.round(rect.height * dpr)
    this.#scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height)
    this.#offsetX = (rect.width - WORLD.width * this.#scale) / 2
    this.#offsetY = (rect.height - WORLD.height * this.#scale) / 2
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** CSS pixel x (clientX) to world x. */
  toWorldX(clientX: number): number {
    const rect = this.#canvas.getBoundingClientRect()
    return (clientX - rect.left - this.#offsetX) / this.#scale
  }

  draw(scene: Scene): void {
    const ctx = this.#ctx
    const rect = this.#canvas.getBoundingClientRect()
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

    for (const b of scene.bodies) this.#sprite(b.tier, b.x, b.y, b.angle)

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
