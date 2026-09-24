/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

export type LeaderboardEntry = {username: string; score: number}

/** Top scores for this post plus the caller's own row when signed in. */
export type LeaderboardRsp = {
  entries: LeaderboardEntry[]
  me?: {username: string; score: number; rank: number}
}

export type SubmitScoreReq = {score: number}

/** Returned when a challenge post is created from the player's stored score. */
export type ChallengeRsp = {ok: true; score: number; postUrl: string}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  GetLeaderboard: 'api/leaderboard',
  SubmitScore: 'api/score',
  CreateChallenge: 'api/challenge',
  OnMenuNewPost: 'internal/on/menu/new-post',
} as const

export const EndpointMethod = {
  [Endpoint.GetLeaderboard]: 'GET',
  [Endpoint.SubmitScore]: 'POST',
  [Endpoint.CreateChallenge]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
