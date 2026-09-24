import {navigateTo} from '@devvit/web/client'
import type {LeaderboardRsp} from '../shared/api.ts'
import {
  DANGER_Y,
  DROP_Y,
  MERGE_POP_VELOCITY,
  PHYSICS_STEP_MS,
  WORLD,
} from '../shared/config.ts'
import {tierRadius} from '../shared/tiers.ts'
import {createChallenge, fetchLeaderboard, submitScore} from './api.ts'
import {clampDropX, Game, physicsStepsFor} from './game.ts'
import {attachInput} from './input.ts'
import {Physics} from './physics.ts'
import {loadSprites, Renderer} from './render.ts'

const CHALLENGE_LABEL = 'Challenge the subreddit'

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const overlay = document.getElementById('overlay') as HTMLDivElement
  const finalEl = document.getElementById('final') as HTMLDivElement
  const boardEl = document.getElementById('board') as HTMLOListElement
  const meEl = document.getElementById('me') as HTMLParagraphElement
  const againBtn = document.getElementById('again') as HTMLButtonElement
  const challengeBtn = document.getElementById('challenge') as HTMLButtonElement
  const challengeMsgEl = document.getElementById(
    'challenge-msg',
  ) as HTMLParagraphElement
  challengeBtn.disabled = true

  const sprites = await loadSprites()
  const renderer = new Renderer(canvas, sprites)
  const physics = new Physics()
  const game = new Game()
  let hoverX = WORLD.width / 2
  let last = performance.now()
  let accumulator = 0
  let submitted = false
  let challengePosted = false

  window.addEventListener('resize', () => renderer.resize())

  attachInput(canvas, {
    move: clientX => {
      hoverX = clampDropX(renderer.toWorldX(clientX), game.current)
    },
    drop: clientX => {
      if (game.phase !== 'ready') return
      const x = clampDropX(renderer.toWorldX(clientX), game.current)
      const id = physics.spawn(game.current, x, DROP_Y)
      game.drop(performance.now(), id)
      hoverX = clampDropX(x, game.current)
    },
  })

  againBtn.addEventListener('click', () => {
    physics.clear()
    game.reset()
    submitted = false
    overlay.classList.remove('show')
  })

  challengeBtn.addEventListener('click', () => void onChallengeClick())

  function frame(now: number): void {
    const elapsed = now - last
    last = now
    accumulator = Math.min(accumulator + elapsed, PHYSICS_STEP_MS * 10)
    const steps = physicsStepsFor(accumulator)
    accumulator -= steps * PHYSICS_STEP_MS

    if (game.phase !== 'over') {
      for (let i = 0; i < steps; i++) {
        const pairs = physics.step(PHYSICS_STEP_MS)
        const merges = game.applyMerges(pairs)
        for (const id of merges.remove) physics.remove(id)
        for (const s of merges.spawn)
          physics.spawn(s.tier, s.x, s.y, MERGE_POP_VELOCITY)
      }
      game.tick(now)
      if (game.checkGameOver(physics.bodies(), now)) void onGameOver()
    }

    const bodies = physics.bodies()
    renderer.draw({
      bodies,
      hover:
        game.phase === 'ready' ? {tier: game.current, x: hoverX} : undefined,
      nextTier: game.next,
      score: game.score,
      danger: bodies.some(b => b.y - tierRadius(b.tier) < DANGER_Y + 40),
    })
    requestAnimationFrame(frame)
  }

  async function onGameOver(): Promise<void> {
    challengeBtn.disabled = true
    if (submitted) return
    submitted = true
    finalEl.textContent = `${game.score}`
    boardEl.replaceChildren()
    meEl.textContent = 'Saving score…'
    // The one-challenge-per-post slot outlives a round, so only a player who
    // has not spent it gets the button back.
    if (!challengePosted) {
      challengeBtn.textContent = CHALLENGE_LABEL
      challengeMsgEl.textContent = ''
    }
    overlay.classList.add('show')

    let board = await submitScore(game.score)
    challengeBtn.disabled = challengePosted
    if (board === 'signedOut') {
      meEl.textContent = 'Sign in to Reddit to post your score.'
      board = await fetchLeaderboard()
    }
    if (!board) {
      if (!meEl.textContent?.startsWith('Sign in'))
        meEl.textContent = 'Could not load the leaderboard.'
      return
    }
    renderBoard(board)
  }

  function renderBoard(board: LeaderboardRsp): void {
    boardEl.replaceChildren(
      ...board.entries.map((e, i) => {
        const li = document.createElement('li')
        if (e.username === board.me?.username) li.classList.add('me')
        const name = document.createElement('span')
        name.textContent = `${i + 1}. ${e.username}`
        const score = document.createElement('span')
        score.textContent = `${e.score}`
        li.append(name, score)
        return li
      }),
    )
    if (board.me)
      meEl.textContent = `You: #${board.me.rank} with ${board.me.score}`
    else if (!meEl.textContent?.startsWith('Sign in')) meEl.textContent = ''
  }

  async function onChallengeClick(): Promise<void> {
    challengeBtn.disabled = true
    challengeBtn.textContent = 'Posting…'
    const rsp = await createChallenge()
    if (rsp === 'signedOut') {
      challengeBtn.disabled = false
      challengeBtn.textContent = CHALLENGE_LABEL
      challengeMsgEl.textContent = 'Sign in to Reddit to post a challenge.'
      return
    }
    if (rsp === 'alreadyChallenged') {
      challengePosted = true
      challengeBtn.textContent = 'Already challenged'
      challengeMsgEl.textContent =
        'You already made a challenge from this post.'
      return
    }
    if (rsp === 'noScore' || rsp === undefined) {
      challengeBtn.disabled = false
      challengeBtn.textContent = CHALLENGE_LABEL
      challengeMsgEl.textContent =
        rsp === 'noScore'
          ? 'Your score has not saved yet, so there is nothing to challenge.'
          : 'Could not post your challenge.'
      return
    }
    challengePosted = true
    challengeBtn.textContent = 'Challenge posted'
    const link = document.createElement('a')
    link.textContent = 'View your challenge'
    link.href = rsp.postUrl
    link.addEventListener('click', ev => {
      ev.preventDefault()
      navigateTo(rsp.postUrl)
    })
    challengeMsgEl.replaceChildren(link)
  }

  requestAnimationFrame(frame)
}

void init()
