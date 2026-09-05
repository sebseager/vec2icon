/** Pointer capture, guarded: happy-dom and older engines do not implement it. */
type CaptureTarget = {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
  hasPointerCapture?: (pointerId: number) => boolean
}

export const capturePointer = (target: CaptureTarget, pointerId: number): void => {
  target.setPointerCapture?.(pointerId)
}

export const releasePointer = (target: CaptureTarget, pointerId: number): void => {
  if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId)
}
