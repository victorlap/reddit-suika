import {context, requestExpandedMode} from '@devvit/web/client'
import {fetchLeaderboard} from './api.ts'

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
startBtn.addEventListener('click', ev => requestExpandedMode(ev, 'game'))

const beatEl = document.getElementById('beat') as HTMLParagraphElement

async function renderBeat(): Promise<void> {
  const postData = context.postData
  const challenger = postData?.challenger
  const target = postData?.target
  if (typeof challenger === 'string' && typeof target === 'number') {
    beatEl.textContent = `u/${challenger} scored ${target}. Beat it.`
    return
  }
  const board = await fetchLeaderboard()
  if (!board) {
    beatEl.textContent = 'Could not load the scores.'
    return
  }
  const top = board.entries[0]
  beatEl.textContent = top
    ? `Score to beat: ${top.score} by u/${top.username}`
    : 'No scores yet. Go first.'
}

void renderBeat()
