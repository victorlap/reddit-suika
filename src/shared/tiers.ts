export type TierDef = {tier: number; name: string; radius: number}

export const TIERS: readonly TierDef[] = [
  {tier: 1, name: 'chick', radius: 16},
  {tier: 2, name: 'frog', radius: 22},
  {tier: 3, name: 'duck', radius: 29},
  {tier: 4, name: 'rabbit', radius: 37},
  {tier: 5, name: 'penguin', radius: 46},
  {tier: 6, name: 'dog', radius: 56},
  {tier: 7, name: 'pig', radius: 67},
  {tier: 8, name: 'cow', radius: 79},
  {tier: 9, name: 'hippo', radius: 92},
  {tier: 10, name: 'elephant', radius: 106},
  {tier: 11, name: 'whale', radius: 120},
]

export const MAX_TIER = TIERS.length
export const MAX_DROP_TIER = 5

function def(tier: number): TierDef {
  const d = TIERS[tier - 1]
  if (!d) throw Error(`no tier ${tier}`)
  return d
}

/** Points awarded for producing this tier by a merge. */
export function tierScore(tier: number): number {
  return (tier * (tier + 1)) / 2
}

export function tierRadius(tier: number): number {
  return def(tier).radius
}

export function tierName(tier: number): string {
  return def(tier).name
}
