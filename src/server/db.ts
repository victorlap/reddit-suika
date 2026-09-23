import {redis} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {LeaderboardRsp} from '../shared/api.ts'
import {LEADERBOARD_SIZE} from '../shared/config.ts'

function key(t3: T3): string {
  return `lb:${t3}`
}

/** Store the score only if it beats the player's previous best. */
export async function dbSubmitScore(
  t3: T3,
  username: string,
  score: number,
): Promise<void> {
  const prev = await redis.zScore(key(t3), username)
  if (prev !== undefined && prev >= score) return
  await redis.zAdd(key(t3), {member: username, score})
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
