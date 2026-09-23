import {
  Endpoint,
  type LeaderboardRsp,
  type SubmitScoreReq,
} from '../shared/api.ts'

export async function fetchLeaderboard(): Promise<LeaderboardRsp | undefined> {
  const rsp = await request(Endpoint.GetLeaderboard)
  return rsp === 'signedOut' ? undefined : rsp
}

/** Returns the board after submitting, or `signedOut` when the server says 401. */
export async function submitScore(
  score: number,
): Promise<LeaderboardRsp | 'signedOut' | undefined> {
  const req: SubmitScoreReq = {score}
  return request(Endpoint.SubmitScore, req)
}

async function request(
  endpoint: Endpoint,
  body?: unknown,
): Promise<LeaderboardRsp | 'signedOut' | undefined> {
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
  if (!rsp.ok) {
    console.error(`HTTP ${rsp.status}: ${await rsp.text().catch(() => '')}`)
    return
  }
  return (await rsp.json()) as LeaderboardRsp
}
