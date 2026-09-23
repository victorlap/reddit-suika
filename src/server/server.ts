import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type LeaderboardRsp,
  type SubmitScoreReq,
} from '../shared/api.ts'
import {MAX_SCORE} from '../shared/config.ts'
import {dbGetLeaderboard, dbSubmitScore} from './db.ts'

type AnyRsp = LeaderboardRsp | UiResponse | TriggerResponse | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.GetLeaderboard:
        rsp = await routeGetLeaderboard()
        break
      case Endpoint.SubmitScore:
        rsp = await routeSubmitScore(reqMsg)
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      default:
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function routeGetLeaderboard(): Promise<LeaderboardRsp> {
  const t3 = context.postId
  if (!t3) throw Error('no t3')
  return dbGetLeaderboard(t3, context.username)
}

async function routeSubmitScore(
  reqMsg: IncomingMessage,
): Promise<LeaderboardRsp | ErrorRsp> {
  const t3 = context.postId
  if (!t3) throw Error('no t3')
  const username = context.username
  if (!username) return {error: 'sign in to post a score', status: 401}
  const req = await readJson<Partial<SubmitScoreReq>>(reqMsg)
  const score = req?.score
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > MAX_SCORE
  )
    return {error: 'invalid score', status: 400}
  await dbSubmitScore(t3, username, score)
  return dbGetLeaderboard(t3, username)
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T | undefined> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  try {
    return JSON.parse(`${Buffer.concat(chunks)}`) as T
  } catch {
    return
  }
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: 'Pile Kingdom'})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({title: 'Pile Kingdom'})
  return {}
}

export function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
