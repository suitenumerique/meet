// browser.storage.local is per-profile and never synced across devices —
// unlike the Outlook add-in's Office.context.roamingSettings, which
// Microsoft explicitly advises against using for secrets since it syncs via
// Exchange to every client the user signs into. This closes that gap rather
// than reproducing it.
const SESSION_KEY = "meetSession";

function saveSession(data) {
  if (!data || !data.access_token) {
    return Promise.reject(new Error("Missing access_token"));
  }

  const expiresInSeconds = Number(data.expires_in);
  const expiresAt =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

  return browser.storage.local.set({
    [SESSION_KEY]: {
      ...data,
      expiresAt,
      savedAt: new Date().toISOString(),
    },
  });
}

async function loadSession() {
  const stored = await browser.storage.local.get(SESSION_KEY);
  const session = stored[SESSION_KEY];

  if (!session) return null;

  // Fail closed if expiry is missing — backend is expected to send expires_in.
  if (!session.expiresAt) {
    await clearSession();
    return null;
  }

  const expiresTs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresTs) || Date.now() >= expiresTs) {
    await clearSession();
    return null;
  }

  return session;
}

function clearSession() {
  return browser.storage.local.remove(SESSION_KEY);
}

module.exports = {
  saveSession,
  loadSession,
  clearSession,
};
