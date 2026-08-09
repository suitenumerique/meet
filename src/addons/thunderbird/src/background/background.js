const { BASE_URL } = require("../common");
const { initSession, createRoom } = require("../common/api");
const { startPolling } = require("../common/polling");
const { saveSession, loadSession } = require("../common/session");
const { openTransitWindow } = require("../common/transitWindow");
const { buildLocationValue } = require("../common/meetingLink");
const { initI18n, t } = require("../common/i18n");

function connect() {
  return new Promise((resolve, reject) => {
    let transitWindow = null;

    initSession()
      .then((data) => {
        const stopPolling = startPolling(data.csrf_token, {
          onSuccess: (sessionData) => {
            transitWindow?.stopWatching();
            saveSession(sessionData).then(() => resolve(sessionData));
          },
          onTimeout: () => reject(new Error(t("meeting.error.auth"))),
          onError: () => reject(new Error(t("meeting.error.retry"))),
        });

        openTransitWindow(data.transit_token, {
          onCancel: () => {
            stopPolling();
            reject(new Error(t("meeting.error.auth")));
          },
        }).then((win) => {
          transitWindow = win;
        });
      })
      .catch(reject);
  });
}

async function getSession() {
  const existing = await loadSession();
  if (existing) return existing;
  return connect();
}

async function requestMeetingLink() {
  const session = await getSession();
  const room = await createRoom(session);
  return buildLocationValue(room);
}

function isTrustedMeetingUrl(url) {
  try {
    return new URL(url).origin === new URL(BASE_URL).origin;
  } catch {
    return false;
  }
}

async function handleAddRequested(requestId) {
  try {
    const url = await requestMeetingLink();
    await browser.meetingLink.applyResult(requestId, { ok: true, url });
  } catch (err) {
    console.error("Failed to generate meeting link:", err);
    await browser.meetingLink.applyResult(requestId, {
      ok: false,
      error: err.message,
    });
  }
}

function handleJoinRequested(url) {
  if (!isTrustedMeetingUrl(url)) {
    console.error("Refusing to open untrusted meeting URL:", url);
    return;
  }
  browser.tabs.create({ url });
}

(async () => {
  await initI18n();

  browser.meetingLink.configure({
    baseUrl: BASE_URL,
    labels: {
      add: t("meeting.add_link"),
      adding: t("meeting.generating"),
      join: t("meeting.join"),
      error: t("meeting.error.retry"),
    },
  });

  browser.meetingLink.onAddRequested.addListener(handleAddRequested);
  browser.meetingLink.onJoinRequested.addListener(handleJoinRequested);
})();
