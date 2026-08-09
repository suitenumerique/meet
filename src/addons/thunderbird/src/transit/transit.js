const { applyAppName } = require("../common/helpers");
const { URLS } = require("../common/urls");
const { save } = require("../common/transitToken");
const { initI18n, translateUI } = require("../common/i18n");

// Initiate the authentication flow, then return to the success page.
function getAuthenticateUrl() {
  const url = new URL(URLS.authenticate);
  url.searchParams.set("returnTo", URLS.successPage);
  return url.toString();
}

(async () => {
  await initI18n();
  applyAppName();
  translateUI();

  const transitToken = decodeURIComponent(window.location.hash.slice(1));

  // Drop the fragment immediately so the token doesn't linger in this tab's
  // session history.
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );

  if (!transitToken) {
    console.error("Transit token missing from the popup URL.");
    return;
  }

  // sessionStorage survives because it's per-window-per-origin and this
  // window persists across the same-origin OAuth round trip that follows.
  try {
    save(transitToken);
    window.location.href = getAuthenticateUrl();
  } catch (err) {
    console.error("Failed to store transit token:", err);
  }
})();
