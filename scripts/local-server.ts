#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning
import {once} from 'node:events'
import {createReadStream, existsSync, statSync} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import {extname, join, normalize} from 'node:path'
import {
  type ChallengeRsp,
  Endpoint,
  type LeaderboardRsp,
} from '../src/shared/api.ts'
import {LEADERBOARD_SIZE, MAX_SCORE} from '../src/shared/config.ts'

const PORT = Number(process.env.PORT ?? 8787)
const PUBLIC = join(import.meta.dirname, '..', 'public')
const USERNAME = 'local-player'
const scores = new Map<string, number>([
  ['snoo', 420],
  ['wombat_fan', 260],
])
const challenged = new Set<string>()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.css': 'text/css; charset=utf-8',
}

function leaderboard(): LeaderboardRsp {
  const all = [...scores.entries()]
    .map(([username, score]) => ({username, score}))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
  const rank = all.findIndex(e => e.username === USERNAME)
  const rsp: LeaderboardRsp = {entries: all.slice(0, LEADERBOARD_SIZE)}
  if (rank >= 0) {
    const me = all[rank]
    if (me) rsp.me = {username: USERNAME, score: me.score, rank: rank + 1}
  }
  return rsp
}

async function handle(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname.slice(1)

  // Journeys only exist on Reddit. Answering here keeps local play from failing
  // a fetch on every drop; the client warns once about the stub and moves on.
  if (path.startsWith('api/telemetry/'))
    return json(rsp, 200, {
      journeyId: 'local',
      receipt: {
        status: 'JOURNEY_RECEIPT_UNSPECIFIED',
        message: 'Journey telemetry is stubbed in local development.',
      },
    })

  if (path === Endpoint.GetLeaderboard && req.method === 'GET')
    return json(rsp, 200, leaderboard())

  if (path === Endpoint.SubmitScore && req.method === 'POST') {
    const chunks: Uint8Array[] = []
    req.on('data', c => chunks.push(c))
    await once(req, 'end')
    let score: unknown
    try {
      score = (JSON.parse(`${Buffer.concat(chunks)}`) as {score?: unknown})
        .score
    } catch {
      return json(rsp, 400, {error: 'bad json', status: 400})
    }
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > MAX_SCORE
    )
      return json(rsp, 400, {error: 'invalid score', status: 400})
    scores.set(USERNAME, Math.max(scores.get(USERNAME) ?? 0, score))
    return json(rsp, 200, leaderboard())
  }

  if (path === Endpoint.CreateChallenge && req.method === 'POST') {
    const score = scores.get(USERNAME)
    if (score === undefined)
      return json(rsp, 400, {error: 'no score to share yet', status: 400})
    if (challenged.has(USERNAME))
      return json(rsp, 409, {
        error: 'you already made a challenge from this post',
        status: 409,
      })
    challenged.add(USERNAME)
    const title = `${USERNAME} piled up ${score} in Pile Kingdom — can you beat it?`
    const postData = {challenger: USERNAME, target: score}
    console.log(`would submit challenge post: ${title}`, postData)
    const body: ChallengeRsp = {
      ok: true,
      score,
      postUrl: 'http://localhost:8787/',
    }
    return json(rsp, 200, body)
  }

  const rel = path === '' ? 'game.html' : normalize(path)
  const file = join(PUBLIC, rel)
  if (
    !file.startsWith(PUBLIC) ||
    !existsSync(file) ||
    !statSync(file).isFile()
  ) {
    rsp.writeHead(404).end('not found')
    return
  }
  rsp.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
  })
  createReadStream(file).pipe(rsp)
}

function json(rsp: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  rsp.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  })
  rsp.end(text)
}

createServer((req, rsp) => {
  handle(req, rsp).catch(err => {
    console.error(err)
    if (!rsp.headersSent) rsp.writeHead(500)
    rsp.end()
  })
}).listen(PORT, () => console.log(`local game at http://localhost:${PORT}`))
