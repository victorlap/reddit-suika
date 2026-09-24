import {
  type ChallengeRsp,
  Endpoint,
  type LeaderboardRsp,
  type SubmitScoreReq,
} from '../shared/api.ts'

export async function fetchLeaderboard(): Promise<LeaderboardRsp | undefined> {
  const rsp = await request<LeaderboardRsp>(Endpoint.GetLeaderboard)
  return rsp === 'signedOut' ? undefined : rsp
}

/** Returns the board after submitting, or `signedOut` when the server says 401. */
export async function submitScore(
  score: number,
): Promise<LeaderboardRsp | 'signedOut' | undefined> {
  const req: SubmitScoreReq = {score}
  return request<LeaderboardRsp>(Endpoint.SubmitScore, req)
}

/**
 * Posts a challenge carrying the player's stored score. `noScore` and
 * `alreadyChallenged` let the caller tell those cases apart from a generic
 * failure.
 */
export async function createChallenge(): Promise<
  ChallengeRsp | 'signedOut' | 'noScore' | 'alreadyChallenged' | undefined
> {
  return request<ChallengeRsp, 'noScore' | 'alreadyChallenged'>(
    Endpoint.CreateChallenge,
    {},
    {400: 'noScore', 409: 'alreadyChallenged'},
  )
}

async function request<T, S extends string = never>(
  endpoint: Endpoint,
  body?: unknown,
  statusMap?: Record<number, S>,
): Promise<T | 'signedOut' | S | undefined> {
  let rsp: Response
  try {
    rsp = await fetch(endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    console.error(`HTTP error: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (rsp.status === 401) return 'signedOut'
  const mapped = statusMap?.[rsp.status]
  if (mapped !== undefined) return mapped
  if (!rsp.ok) {
    console.error(`HTTP ${rsp.status}: ${await rsp.text().catch(() => '')}`)
    return
  }
  return (await rsp.json().catch((err: unknown) => {
    console.error(
      `bad JSON response: ${err instanceof Error ? err.message : err}`,
    )
    return undefined
  })) as T | undefined
}
