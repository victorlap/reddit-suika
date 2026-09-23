export type InputHandlers = {
  /** Pointer moved; clientX in CSS pixels. */
  move(clientX: number): void
  /** Pointer released; clientX in CSS pixels. */
  drop(clientX: number): void
}

/** Mouse and touch via Pointer Events. Returns a detach function. */
export function attachInput(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
): () => void {
  canvas.style.touchAction = 'none'
  const onMove = (ev: PointerEvent): void => handlers.move(ev.clientX)
  const onDown = (ev: PointerEvent): void => {
    canvas.setPointerCapture(ev.pointerId)
    handlers.move(ev.clientX)
  }
  const onUp = (ev: PointerEvent): void => {
    handlers.move(ev.clientX)
    handlers.drop(ev.clientX)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  return () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
  }
}
