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
 * Two CSRF flows coexist in this addon:
 *
 * 1. Cookie-based (Django default): used by `exchange`, called from the
 *    OAuth success page in a normal browser context. Django's CSRF
 *    middleware has already set the `csrftoken` cookie via the auth
 *    redirect, so we read it from `document.cookie` and echo it back
 *    as `X-CSRFToken`. The middleware verifies the header matches the
 *    cookie. No `csrfToken` argument needed — `getCsrfToken()` handles it.
 *
 * 2. Body-passed token: used by `poll`, called from the Office dialog /
 *    taskpane iframe. Cookie access inside Office iframes is unreliable
 *    across Outlook clients, so we can't depend on `document.cookie`
 *    being populated. Instead, `init` returns the CSRF token in its JSON
 *    response body, and callers pass it explicitly to subsequent calls.
 *    The token still travels as `X-CSRFToken` — only its source differs.
 *
 * The `csrfToken` parameter takes precedence when provided; falls back
 * to the cookie when omitted.
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
    credentials: csrf ? "include" : opts.credentials,
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
