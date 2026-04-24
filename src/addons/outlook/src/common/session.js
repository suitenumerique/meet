const { isOfficeReady } = require("./helpers");

const SESSION_KEY = "meetSession";

// DEV NOTE:
// Office.context.roamingSettings persists data in the user's mailbox and
// synchronizes it via Exchange across all Outlook clients (desktop, web, mobile)
// where the user signs in. This means anything stored here (including tokens)
// leaves the local device boundary and is replicated across environments.
//
// Microsoft guidance explicitly advises NOT storing secrets (e.g., OAuth access
// tokens, refresh tokens, or other sensitive credentials) in roamingSettings,
// as it is not a secure storage mechanism and lacks OS-level protections.
//
// That said, for the current alpha version we accept this trade-off for simplicity,
// with the expectation that a more secure approach (e.g., in-memory tokens) will replace this.
function saveSession(data) {
  if (!isOfficeReady()) {
    return Promise.reject(new Error("Office not ready"));
  }

  if (!data || !data.access_token) {
    return Promise.reject(new Error("Missing access_token"));
  }

  const expiresInSeconds = Number(data.expires_in);
  const expiresAt =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

  const payload = JSON.stringify({
    ...data,
    expiresAt,
    savedAt: new Date().toISOString(),
  });

  return new Promise((resolve, reject) => {
    const rs = Office.context.roamingSettings;
    rs.set(SESSION_KEY, payload);
    rs.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve();
      } else {
        reject(new Error(result.error?.message || "saveAsync failed"));
      }
    });
  });
}

function loadSession() {
  if (!isOfficeReady()) {
    return null;
  }

  let session = null;
  try {
    const stored = Office.context.roamingSettings.get(SESSION_KEY);
    if (stored) session = JSON.parse(stored);
  } catch (e) {
    clearSession();
    return null;
  }

  if (!session) return null;

  // Fail closed if expiry is missing — backend is expected to send expires_in.
  if (!session.expiresAt) {
    clearSession();
    return null;
  }

  const expiresTs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresTs) || Date.now() >= expiresTs) {
    clearSession();
    return null;
  }

  return session;
}

function clearSession() {
  if (!isOfficeReady()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const rs = Office.context.roamingSettings;
      rs.remove(SESSION_KEY);
      rs.saveAsync((result) => {
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

module.exports = {
  saveSession,
  loadSession,
  clearSession,
};
