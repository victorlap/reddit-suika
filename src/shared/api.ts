/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

export type LeaderboardEntry = {username: string; score: number}

/** Top scores for this post plus the caller's own row when signed in. */
export type LeaderboardRsp = {
  entries: LeaderboardEntry[]
  me?: {username: string; score: number; rank: number}
}

export type SubmitScoreReq = {score: number}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  GetLeaderboard: 'api/leaderboard',
  SubmitScore: 'api/score',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
} as const

export const EndpointMethod = {
  [Endpoint.GetLeaderboard]: 'GET',
  [Endpoint.SubmitScore]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
