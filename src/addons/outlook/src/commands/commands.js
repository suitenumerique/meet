/* global Office */
const { createRoom, initSession } = require("../common/api");
const { startPolling } = require("../common/polling");
const { saveSession, loadSession } = require("../common/session");
const { openTransitDialog } = require("../common/transitDialog");
const { buildMeetingMessage } = require("../common/messageBuilder");
const { applyAppName } = require("../common/helpers");
const { initI18n, t } = require("../common/i18n");

Office.onReady(async function (info) {

  await initI18n()

  if (info.host === Office.HostType.Outlook) {
    applyAppName();
  }
});

function notify(message) {
  Office.context.mailbox.item.notificationMessages.replaceAsync("meetNotif", {
    type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
    message,
    persistent: false,
    icon: "Icon.16x16",
  });
}

function insertMeetingLink(event, session) {
  createRoom(session)
    .then((data) => {
      const isWeb = Office.context.diagnostics.platform === "OfficeOnline";
      const { url, text } = buildMeetingMessage(data, isWeb);
      const item = Office.context.mailbox.item;
      const coercionType = isWeb ? Office.CoercionType.Html : Office.CoercionType.Text;

      return new Promise((resolve, reject) => {
        item.body.setSelectedDataAsync(text, { coercionType }, (setResult) => {
          if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
            notify(t('meeting.error.details', { message: setResult.error.message }));
            resolve();
            return;
          }

          if (item.itemType !== Office.MailboxEnums.ItemType.Appointment) {
            notify(t("meeting.link_inserted"));
            resolve();
            return;
          }

          item.location.setAsync(url, (locationResult) => {
            if (locationResult.status !== Office.AsyncResultStatus.Succeeded) {
              notify(t("meeting.error.details", { message: locationResult.error.message }));
            } else {
              notify(t("meeting.link_inserted"));
            }
            resolve();
          });
        });
      });
    })
    .catch((err) => {
      notify(`Erreur : ${err.message}`);
    })
    .finally(() => {
      event.completed();
    });
}

function connect(event) {
  initSession()
    .then((data) => {
      const stopPolling = startPolling(data.csrf_token, {
        onSuccess: (sessionData) => {
          saveSession(sessionData).then(() => {
            insertMeetingLink(event, sessionData);
          });
        },
        onTimeout: () => {
          notify(t("meeting.error.auth"));
          event.completed();
        },
        onError: (err) => {
          notify(t("meeting.error.retry"));
          event.completed();
        },
      });
      openTransitDialog(data.transit_token, {
        onCancel: () => {
          stopPolling();
          event.completed();
        },
        onError: (err) => {
          stopPolling();
          event.completed();
        },
      });
    })
    .catch((err) => {
      notify(t("meeting.error.details", { message: err.message }));
      event.completed();
    });
}

function generateMeetingLink(event) {
  const session = loadSession();
  if (session?.access_token) {
    insertMeetingLink(event, session);
  } else {
    connect(event);
  }
}

Office.actions.associate("generateMeetingLinkFromCalendar", generateMeetingLink);
Office.actions.associate("generateMeetingLinkFromMail", generateMeetingLink);
