import {redis} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {LeaderboardRsp} from '../shared/api.ts'
import {LEADERBOARD_SIZE} from '../shared/config.ts'

function key(t3: T3): string {
  return `lb:${t3}`
}

function challengeKey(t3: T3): string {
  return `challenged:${t3}`
}

/** Store the score only if it beats the player's previous best. */
// Note: the read and write below are not atomic (a concurrent submit could
// race this check), which is acceptable for a community game's leaderboard.
export async function dbSubmitScore(
  t3: T3,
  username: string,
  score: number,
): Promise<void> {
  const prev = await redis.zScore(key(t3), username)
  if (prev !== undefined && prev >= score) return
  await redis.zAdd(key(t3), {member: username, score})
}

/** The player's stored best for a post, or `undefined` when they have none. */
export async function dbGetScore(
  t3: T3,
  username: string,
): Promise<number | undefined> {
  return redis.zScore(key(t3), username)
}

export async function dbGetLeaderboard(
  t3: T3,
  username: string | undefined,
): Promise<LeaderboardRsp> {
  const top = await redis.zRange(key(t3), 0, LEADERBOARD_SIZE - 1, {
    by: 'rank',
    reverse: true,
  })
  const rsp: LeaderboardRsp = {
    entries: top.map(m => ({username: m.member, score: m.score})),
  }
  if (!username) return rsp
  const [score, ascRank, total] = await Promise.all([
    redis.zScore(key(t3), username),
    redis.zRank(key(t3), username),
    redis.zCard(key(t3)),
  ])
  if (score === undefined || ascRank === undefined) return rsp
  rsp.me = {username, score, rank: total - ascRank}
  return rsp
}

/** Atomically claims the one-challenge-per-player-per-post slot. */
export async function dbClaimChallenge(
  t3: T3,
  username: string,
): Promise<boolean> {
  const claimed = await redis.hSetNX(challengeKey(t3), username, '1')
  return claimed === 1
}

/** Releases a claimed slot, e.g. after a failed post creation, so the player can retry. */
export async function dbReleaseChallenge(
  t3: T3,
  username: string,
): Promise<void> {
  await redis.hDel(challengeKey(t3), [username])
}
