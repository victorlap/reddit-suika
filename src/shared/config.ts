/** Logical playfield size. The canvas scales this to fit the viewport. */
export const WORLD = {width: 400, height: 600} as const
/** Strip under the bucket showing the chain from chick to whale. */
export const CHAIN_HEIGHT = 60
/** Everything the canvas draws: the bucket plus the chain strip. */
export const STAGE = {
  width: WORLD.width,
  height: WORLD.height + CHAIN_HEIGHT,
} as const
/** Help button box at the left end of the chain strip, in world units. */
export const HELP_BUTTON = {x: 6, y: WORLD.height + 13, size: 34} as const
/** Bodies whose centre is above this y for GAME_OVER_GRACE_MS end the game. */
export const DANGER_Y = 100
/** y where the next animal hovers before dropping. */
export const DROP_Y = 60
export const DROP_COOLDOWN_MS = 500
export const GAME_OVER_GRACE_MS = 1000
export const PHYSICS_STEP_MS = 1000 / 60
export const MAX_PHYSICS_STEPS_PER_FRAME = 5
/** Upward velocity given to a freshly merged animal. */
export const MERGE_POP_VELOCITY = -3
export const WALL_THICKNESS = 40
export const BODY = {
  restitution: 0.15,
  friction: 0.4,
  frictionStatic: 0.6,
  density: 0.002,
} as const
export const GRAVITY_Y = 1.2
export const MAX_SCORE = 100_000
export const LEADERBOARD_SIZE = 10
