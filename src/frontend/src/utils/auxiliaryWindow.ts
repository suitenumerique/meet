// A normal window the user can move, resize, and put on another screen.
// Not the meeting PiP: that API allows only one always-on-top window, and
// it is already used. A blank popup has no CSS, so we copy styles from the meeting.

const AUXILIARY_ROOT_ID = 'root'

const copyDocumentChrome = (target: Window) => {
  const { document: targetDoc } = target
  document.head
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => {
      targetDoc.head.appendChild(node.cloneNode(true))
    })

  targetDoc.documentElement.className = document.documentElement.className
  targetDoc.documentElement.style.cssText =
    document.documentElement.style.cssText
  targetDoc.documentElement.setAttribute(
    'lang',
    document.documentElement.lang || 'en'
  )

  const theme = document.documentElement.dataset.lkTheme
  if (theme) {
    targetDoc.documentElement.dataset.lkTheme = theme
  }
}

const ensureAuxiliaryRoot = (target: Window) => {
  const existing = target.document.getElementById(AUXILIARY_ROOT_ID)
  if (existing) return existing

  const root = target.document.createElement('div')
  root.id = AUXILIARY_ROOT_ID
  root.style.width = '100%'
  root.style.height = '100%'
  target.document.body.appendChild(root)
  return root
}

// Fill the window and reuse the meeting colors so it does not flash white.
const applyLayout = (target: Window) => {
  const { document: targetDoc } = target
  const sourceBody = getComputedStyle(document.body)

  targetDoc.documentElement.style.height = '100%'
  targetDoc.body.style.margin = '0'
  targetDoc.body.style.height = '100%'
  targetDoc.body.style.overflow = 'hidden'
  targetDoc.body.style.backgroundColor = sourceBody.backgroundColor
  targetDoc.body.style.color = sourceBody.color
}

// Returns the element to portal into.
export const initializeAuxiliaryWindow = (
  target: Window,
  { title }: { title: string }
) => {
  copyDocumentChrome(target)
  target.document.title = title
  applyLayout(target)
  return ensureAuxiliaryRoot(target)
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 240
const FALLBACK_WIDTH = 1280
const FALLBACK_HEIGHT = 720
// Leaves room for the browser's title bar: window.open sizes the content.
const SCREEN_FRACTION = 0.9

// Sized to the share, on the meeting's screen. The user moves it from there.
// A very narrow share hits the minimum and gets bars, not a stretched picture.
export const getAuxiliaryWindowSize = (
  video?: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'> | null
) => {
  const maxWidth = Math.max(
    MIN_WIDTH,
    Math.round(window.screen.availWidth * SCREEN_FRACTION)
  )
  const maxHeight = Math.max(
    MIN_HEIGHT,
    Math.round(window.screen.availHeight * SCREEN_FRACTION)
  )
  const videoWidth = video?.videoWidth ?? 0
  const videoHeight = video?.videoHeight ?? 0

  if (videoWidth > 0 && videoHeight > 0) {
    const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight, 1)
    return {
      width: Math.max(MIN_WIDTH, Math.round(videoWidth * scale)),
      height: Math.max(MIN_HEIGHT, Math.round(videoHeight * scale)),
    }
  }

  return {
    width: Math.min(FALLBACK_WIDTH, maxWidth),
    height: Math.min(FALLBACK_HEIGHT, maxHeight),
  }
}

export const getAuxiliaryWindowFeatures = (width: number, height: number) =>
  `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=no,status=no,location=no,toolbar=no,menubar=no`
