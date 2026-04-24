const { APP_NAME } = require("../common");

const { applyAppName } = require("../common/helpers");
const { initSession, createRoom } = require("../common/api");
const { startPolling } = require("../common/polling");
const { openTransitDialog } = require("../common/transitDialog");
const { loadSession, saveSession, clearSession } = require("../common/session");

const { buildMeetingMessage } = require("../common/messageBuilder");

// todo - support loading view while polling
// todo - support error view
function showView(name) {
  document.getElementById("view-loading").style.display = "none";
  document.getElementById("view-unauth").style.display = "none";
  document.getElementById("view-auth").style.display = "none";
  document.getElementById(`view-${name}`).style.display = "block";
}

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

function _setButtonLoading() {
  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "Génération...";
}

function _setButtonIdle() {
  const btn = document.getElementById("btn-generate");
  btn.disabled = false;
  btn.textContent = `Ajouter une réunion ${APP_NAME}`;
}

function generateMeetingLink() {
  const session = loadSession();
  if (!session?.access_token) {
    console.error("Session introuvable. Veuillez vous reconnecter.");
    showView("unauth");
    return;
  }

  _setButtonLoading();

  createRoom(session)
    .then((data) => {
      const { url, message } = buildMeetingMessage(data);
      const item = Office.context.mailbox.item;
      return new Promise((resolve, reject) => {
        item.body.getAsync(Office.CoercionType.Html, (getResult) => {
          if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
            reject(getResult.error);
            return;
          }

          item.body.setAsync(
            getResult.value + message,
            { coercionType: Office.CoercionType.Html },
            (setResult) => {
              if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
                reject(setResult.error);
                return;
              }

              // ─── If calendar event, also set location ──────────────
              if (item.itemType === Office.MailboxEnums.ItemType.Appointment) {
                item.location.setAsync(url, () => resolve());
                return;
              }

              resolve();
            }
          );
        });
      });
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      _setButtonIdle();
    });
}

Office.onReady((info) => {
  if (info.host === Office.HostType.Outlook) {
    applyAppName();
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("btn-connect").onclick = connect;
    document.getElementById("btn-disconnect").onclick = disconnect;
    document.getElementById("btn-generate").onclick = generateMeetingLink;

    const session = loadSession();
    if (session?.state === "authenticated" && session?.access_token) {
      showView("auth");
    } else {
      showView("unauth");
    }
  }
});
