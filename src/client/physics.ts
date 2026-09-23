import Matter from 'matter-js'
import {BODY, GRAVITY_Y, WALL_THICKNESS, WORLD} from '../shared/config.ts'
import {tierRadius} from '../shared/tiers.ts'
import type {BodyInfo, CollisionPair} from './game.ts'

const {Bodies, Body, Composite, Engine, Events} = Matter

export type PhysicsBody = BodyInfo & {angle: number}

type AnimalPlugin = {tier: number}

/** Owns the Matter.js world. Nothing outside this file imports matter-js. */
export class Physics {
  #engine: Matter.Engine
  #pending: CollisionPair[] = []

  constructor() {
    this.#engine = Engine.create({gravity: {x: 0, y: GRAVITY_Y}})
    const t = WALL_THICKNESS
    const {width: w, height: h} = WORLD
    const wall = {isStatic: true, friction: 0.6}
    Composite.add(this.#engine.world, [
      Bodies.rectangle(w / 2, h + t / 2, w + 2 * t, t, wall),
      Bodies.rectangle(-t / 2, h / 2, t, h * 3, wall),
      Bodies.rectangle(w + t / 2, h / 2, t, h * 3, wall),
    ])
    Events.on(this.#engine, 'collisionStart', ev => {
      for (const pair of ev.pairs) {
        const a = toInfo(pair.bodyA)
        const b = toInfo(pair.bodyB)
        if (a && b) this.#pending.push({a, b})
      }
    })
  }

  spawn(tier: number, x: number, y: number, velocityY = 0): number {
    const body = Bodies.circle(x, y, tierRadius(tier), {
      restitution: BODY.restitution,
      friction: BODY.friction,
      frictionStatic: BODY.frictionStatic,
      density: BODY.density,
    })
    body.plugin = {tier} satisfies AnimalPlugin
    if (velocityY) Body.setVelocity(body, {x: 0, y: velocityY})
    Composite.add(this.#engine.world, body)
    return body.id
  }

  remove(id: number): void {
    const body = this.#find(id)
    if (body) Composite.remove(this.#engine.world, body)
  }

  /** Advance the simulation and return animal-to-animal collisions that began. */
  step(dtMs: number): CollisionPair[] {
    this.#pending = []
    Engine.update(this.#engine, dtMs)
    return this.#pending
  }

  bodies(): PhysicsBody[] {
    const out: PhysicsBody[] = []
    for (const b of Composite.allBodies(this.#engine.world)) {
      const info = toInfo(b)
      if (info) out.push({...info, angle: b.angle})
    }
    return out
  }

  clear(): void {
    for (const b of Composite.allBodies(this.#engine.world))
      if (toInfo(b)) Composite.remove(this.#engine.world, b)
  }

  #find(id: number): Matter.Body | undefined {
    return Composite.allBodies(this.#engine.world).find(b => b.id === id)
  }
}

function toInfo(body: Matter.Body): BodyInfo | undefined {
  const plugin = body.plugin as Partial<AnimalPlugin> | undefined
  if (body.isStatic || typeof plugin?.tier !== 'number') return
  return {
    id: body.id,
    tier: plugin.tier,
    x: body.position.x,
    y: body.position.y,
  }
}
