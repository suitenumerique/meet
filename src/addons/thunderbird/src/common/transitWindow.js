const { URLS } = require("./urls");

const POPUP_HEIGHT = 700;
const POPUP_WIDTH = 480;

/**
 * Opens the SSO popup and navigates it straight to transit.html with the
 * transit token in the URL fragment.
 *
 * The Outlook add-in has to do a `postMessage` ready/done handshake after
 * opening its dialog, because Office.context.ui.displayDialogAsync only
 * accepts a bare URL (see src/addons/outlook/src/transit/transit.js, which
 * flags that handshake as fragile). browser.windows.create lets us pass the
 * token in from the start instead. The fragment (`#...`, not `?...`) is
 * never sent to the server and is stripped from Referer headers, so this
 * isn't a materially different exposure than the postMessage handoff — just
 * one less moving part.
 */
async function openTransitWindow(transitToken, { onCancel } = {}) {
  const url = `${URLS.transitPage}#${encodeURIComponent(transitToken)}`;

  const win = await browser.windows.create({
    url,
    type: "popup",
    height: POPUP_HEIGHT,
    width: POPUP_WIDTH,
  });

  const windowId = win.id;
  let watching = true;

  const handleRemoved = (closedWindowId) => {
    if (!watching || closedWindowId !== windowId) return;
    stopWatching();
    onCancel?.();
  };

  function stopWatching() {
    watching = false;
    browser.windows.onRemoved.removeListener(handleRemoved);
  }

  browser.windows.onRemoved.addListener(handleRemoved);

  return {
    // Call once the flow has succeeded so the popup's own window.close()
    // (in success.js) isn't mistaken for the user cancelling.
    stopWatching,
    close: () => browser.windows.remove(windowId).catch(() => {}),
  };
}

module.exports = { openTransitWindow };
