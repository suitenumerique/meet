/** Dispose a preview track even if device acquisition resolves after unmount. */
export function startAwaySafePreview<
  T extends {
    attach: (element: HTMLVideoElement) => void
    detach: () => void
    stop: () => void
  },
>(element: HTMLVideoElement, acquire: () => Promise<T>): () => void {
  let disposed = false
  let track: T | null = null

  void acquire().then((created) => {
    if (disposed) {
      created.stop()
      return
    }
    track = created
    created.attach(element)
  })

  return () => {
    disposed = true
    track?.detach()
    track?.stop()
  }
}
