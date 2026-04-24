const { pollSession } = require("./api");

const POLLING_INTERVAL_MS = 1000;
const POLLING_TIMEOUT_MS = 3 * 60 * 1000;
const POLLING_MAX_ATTEMPTS = POLLING_TIMEOUT_MS / POLLING_INTERVAL_MS;

function isPollAuthenticated(sessionData) {
  return sessionData.state === "authenticated" && sessionData.access_token;
}

function startPolling(csrfToken, { onSuccess, onTimeout, onError }) {
  let pollCount = 0;
  let timeoutId = null;
  let cancelled = false;

  const poll = () => {
    if (pollCount++ >= POLLING_MAX_ATTEMPTS) {
      onTimeout?.();
      return;
    }

    pollSession(csrfToken)
      .then((sessionData) => {
        if (cancelled) return;
        if (isPollAuthenticated(sessionData)) {
          onSuccess?.(sessionData);
          return;
        }
        timeoutId = setTimeout(poll, POLLING_INTERVAL_MS);
      })
      .catch((err) => {
        if (cancelled) return;
        onError?.(err);
      });
  };

  poll();

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}

module.exports = {
  startPolling,
};
