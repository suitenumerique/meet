export function calculateCenteredPopupPosition(openerWindow) {
  // Get the opener window dimensions
  const openerWidth =
    openerWindow.innerWidth ||
    openerWindow.document.documentElement.clientWidth ||
    openerWindow.document.body.clientWidth
  const openerHeight =
    openerWindow.innerHeight ||
    openerWindow.document.documentElement.clientHeight ||
    openerWindow.document.body.clientHeight

  // Get the opener window's position
  const openerLeft = openerWindow.screenX || openerWindow.screenLeft
  const openerTop = openerWindow.screenY || openerWindow.screenTop

  // Define popup dimensions
  const popupWidth = 500
  const popupHeight = 500

  // Calculate position centered relative to the opener window
  const left = openerLeft + (openerWidth - popupWidth) / 2
  const top = openerTop + (openerHeight - popupHeight) / 2

  return {
    left,
    top,
    width: popupWidth,
    height: popupHeight,
  }
}
