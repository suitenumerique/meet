const { URLS } = require("./urls");

function getCsrfToken() {
  return document.cookie
    .split(";")
    .filter((cookie) => cookie.trim().startsWith("csrftoken="))
    .map((cookie) => cookie.split("=")[1])
    .pop();
}

function authHeaders(session) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Builds headers for CSRF-protected requests.
 *
 * Two CSRF flows coexist, same as the Outlook add-in:
 *
 * 1. Cookie-based (Django default): used by `exchange`, called from
 *    success.js — a page hosted by the backend itself, so `document.cookie`
 *    reliably has the `csrftoken` cookie Django's CSRF middleware set during
 *    the OAuth redirect. No `csrfToken` argument needed.
 * 2. Body-passed token: used by `init`/`poll`, called from the extension's
 *    background script — a `moz-extension://` origin, genuinely
 *    cross-origin from the backend, with no access to its cookies via
 *    `document.cookie` at all. `init` returns the CSRF token in its JSON
 *    response body instead, and callers pass it explicitly.
 *
 * The `csrfToken` parameter takes precedence when provided; falls back to
 * the cookie when omitted.
 */
function csrfHeaders(csrfToken) {
  const token = csrfToken || getCsrfToken();
  return {
    "Content-Type": "application/json",
    ...(token && { "X-CSRFToken": token }),
  };
}

async function request(path, { session, csrf, csrfToken, ...opts } = {}) {
  const headers = {
    ...(session && authHeaders(session)),
    ...(csrf && csrfHeaders(csrfToken)),
    ...opts.headers,
  };
  const res = await fetch(path, {
    ...opts,
    headers,
    // Every call the background script makes crosses origins (moz-extension://
    // vs the backend's https:// origin), unlike the Outlook add-in where
    // taskpane/commands pages are hosted same-origin with the backend. The
    // addonsSid cookie is already SameSite=None;Secure specifically to support
    // this, but the request still has to opt in with "include" or the browser
    // won't send or store it.
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  initSession: () => request(URLS.init, { method: "POST" }),
  pollSession: (csrfToken) =>
    request(URLS.poll, {
      method: "POST",
      csrf: true,
      csrfToken,
    }),
  exchangeSession: (transitToken) =>
    request(URLS.exchange, {
      method: "POST",
      csrf: true,
      body: JSON.stringify({ transit_token: transitToken }),
    }),
  createRoom: (session) =>
    request(URLS.rooms, {
      method: "POST",
      session,
    }),
};
