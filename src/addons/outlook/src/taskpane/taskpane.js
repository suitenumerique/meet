/* global Office */
const { APP_NAME } = require("../common");
const { applyAppName } = require("../common/helpers");
const { initSession, createRoom } = require("../common/api");
const { startPolling } = require("../common/polling");
const { openTransitDialog } = require("../common/transitDialog");
const { loadSession, saveSession, clearSession } = require("../common/session");
const { buildMeetingMessage } = require("../common/messageBuilder");
const { initI18n, t, translateUI } = require("../common/i18n");
const { isMeetingAlreadyAdded, removeMeetingLink } = require("../common/meetingDetector");

// ── Views ────────────────────────────────────────────────────

function showView(name) {
  document.getElementById("view-loading").style.display = "none";
  document.getElementById("view-unauth").style.display = "none";
  document.getElementById("view-auth").style.display = "none";
  document.getElementById(`view-${name}`).style.display = "block";

  if (name === "auth") {
    _refreshMeetingButtonState();
  }
}

// ── Button state ─────────────────────────────────────────────

function _showAddButton() {
  document.getElementById("btn-generate").style.display = "block";
  document.getElementById("btn-remove").style.display = "none";
}

function _showRemoveButton() {
  document.getElementById("btn-generate").style.display = "none";
  document.getElementById("btn-remove").style.display = "block";
}

function _setButtonLoading() {
  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = t("meeting.generating");
}

function _setButtonIdle() {
  const btn = document.getElementById("btn-generate");
  btn.disabled = false;
  btn.textContent = t("meeting.add_meeting", { app_name: APP_NAME });
}

function _setRemoveLoading() {
  const btn = document.getElementById("btn-remove");
  btn.disabled = true;
  btn.textContent = t("meeting.removing");
}

function _setRemoveIdle() {
  const btn = document.getElementById("btn-remove");
  btn.disabled = false;
  btn.textContent = t("meeting.remove_meeting", { app_name: APP_NAME });
}

function _refreshMeetingButtonState() {
  const item = Office.context.mailbox.item;
  if (!item) return;
  isMeetingAlreadyAdded(item).then((alreadyAdded) => {
    if (alreadyAdded) {
      _showRemoveButton();
    } else {
      _showAddButton();
    }
  });
}

// ── Auth ─────────────────────────────────────────────────────

function connect() {
  initSession()
    .then((data) => {
      const stopPolling = startPolling(data.csrf_token, {
        onSuccess: (sessionData) => {
          saveSession(sessionData).then(() => showView("auth"));
        },
        onTimeout: () => {
          showView("unauth");
        },
        onError: (err) => {
          console.error(err);
        },
      });
      openTransitDialog(data.transit_token, {
        onCancel: () => stopPolling(),
        onError: (err) => {
          stopPolling();
        },
      });
    })
    .catch((err) => {
      console.error(err);
    });
}

function disconnect() {
  clearSession().finally(() => showView("unauth"));
}

// ── Meeting ──────────────────────────────────────────────────

function generateMeetingLink() {
  const session = loadSession();
  if (!session?.access_token) {
    showView("unauth");
    return;
  }

  _setButtonLoading();

  createRoom(session)
    .then((data) => {
      const isWeb = Office.context.diagnostics.platform === "OfficeOnline";
      const { url, text } = buildMeetingMessage(data, isWeb);
      const item = Office.context.mailbox.item;
      const coercionType = isWeb ? Office.CoercionType.Html : Office.CoercionType.Text;

      return new Promise((resolve, reject) => {
        item.body.setSelectedDataAsync(text, { coercionType }, (setResult) => {
          if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
            reject(setResult.error);
            return;
          }
          if (item.itemType === Office.MailboxEnums.ItemType.Appointment) {
            item.location.setAsync(url, () => resolve());
            return;
          }
          resolve();
        });
      });
    })
    .then(() => {
      _showRemoveButton();
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      _setButtonIdle();
    });
}

function removeMeetingLinkFromItem() {
  const session = loadSession();
  if (!session?.access_token) {
    showView("unauth");
    return;
  }

  _setRemoveLoading();

  const item = Office.context.mailbox.item;

  removeMeetingLink(item)
    .then(() => {
      _showAddButton();
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      _setRemoveIdle();
    });
}

// ── Init ─────────────────────────────────────────────────────

Office.onReady(async (info) => {
  await initI18n();
  translateUI();

  if (info.host === Office.HostType.Outlook) {
    applyAppName();
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("btn-connect").onclick = connect;
    document.getElementById("btn-disconnect").onclick = disconnect;
    document.getElementById("btn-generate").onclick = generateMeetingLink;
    document.getElementById("btn-remove").onclick = removeMeetingLinkFromItem;

    const session = loadSession();
    if (session?.state === "authenticated" && session?.access_token) {
      showView("auth"); // this already calls _refreshMeetingButtonState internally
    } else {
      showView("unauth");
    }
  }
});
