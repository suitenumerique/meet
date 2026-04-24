/* global Office */
const { createRoom, initSession } = require("../common/api");
const { startPolling } = require("../common/polling");
const { saveSession, loadSession } = require("../common/session");
const { openTransitDialog } = require("../common/transitDialog");
const { buildMeetingMessage } = require("../common/messageBuilder");
const { applyAppName } = require("../common/helpers");

Office.onReady(function (info) {
  if (info.host === Office.HostType.Outlook) {
    applyAppName();
  }
});

function notify(message, isError = false) {
  Office.context.mailbox.item.notificationMessages.replaceAsync("meetNotif", {
    type: isError
      ? Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage
      : Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
    message,
    persistent: false,
    icon: "Icon.16x16",
  });
}

function insertMeetingLink(event, session) {
  createRoom(session)
    .then((data) => {
      const { url, message } = buildMeetingMessage(data);
      const item = Office.context.mailbox.item;

      return new Promise((resolve, reject) => {
        item.body.getAsync(Office.CoercionType.Html, (getResult) => {
          if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
            notify(`Erreur de lecture : ${getResult.error.message}`, true);
            resolve();
            return;
          }

          const newBody = getResult.value + message;
          item.body.setAsync(newBody, { coercionType: Office.CoercionType.Html }, (setResult) => {
            if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
              notify(`Erreur d'insertion : ${setResult.error.message}`, true);
              resolve();
              return;
            }

            if (item.itemType !== Office.MailboxEnums.ItemType.Appointment) {
              notify("Lien de réunion inséré !");
              resolve();
              return;
            }

            item.location.setAsync(url, (locationResult) => {
              if (locationResult.status !== Office.AsyncResultStatus.Succeeded) {
                notify(`Erreur de localisation : ${locationResult.error.message}`, true);
              } else {
                notify("Lien de réunion inséré !");
              }
              resolve();
            });
          });
        });
      });
    })
    .catch((err) => {
      notify(`Erreur : ${err.message}`, true);
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
          saveSession(sessionData).then(() => insertMeetingLink(event));
        },
        onTimeout: () => {
          notify("Connexion expirée, veuillez réessayer.", true);
          event.completed();
        },
        onError: (err) => {
          notify("Une erreur est survenue, veuillez ré-essayer", true);
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
      notify(`Erreur : ${err.message}`, true);
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
