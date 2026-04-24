/* global Office */
const { loadSession, buildMeetingMessage, BASE_URL } = require("../common");

Office.onReady(() => {});

function generateMeetingLinkFromCalendar(event) {
  const session = loadSession();

  if (!session?.access_token) {
    Office.context.mailbox.item.notificationMessages.replaceAsync("meetNotif", {
      type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
      message: "Vous n'êtes pas connecté. Ouvrez les paramètres pour vous connecter.",
    });
    event.completed();
    return;
  }

  fetch(`${BASE_URL}/external-api/v1.0/rooms/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + session.access_token,
    },
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("Room created:", data);

      const { url, message } = buildMeetingMessage(data);
      const item = Office.context.mailbox.item;

      item.body.getAsync(Office.CoercionType.Html, (getResult) => {
        if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
          item.notificationMessages.replaceAsync("meetNotif", {
            type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
            message: `Erreur de lecture: ${getResult.error.message}`,
          });
          event.completed();
          return;
        }

        item.body.setAsync(getResult.value + message, { coercionType: Office.CoercionType.Html }, (setResult) => {
          if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
            item.notificationMessages.replaceAsync("meetNotif", {
              type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
              message: `Erreur d'insertion: ${setResult.error.message}`,
            });
            event.completed();
            return;
          }

          item.location.setAsync(url, (locationResult) => {
            if (locationResult.status === Office.AsyncResultStatus.Succeeded) {
              item.notificationMessages.replaceAsync("meetNotif", {
                type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
                message: "Lien de réunion inséré !",
                icon: "Icon.80x80",
                persistent: false,
              });
            } else {
              item.notificationMessages.replaceAsync("meetNotif", {
                type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
                message: `Erreur de localisation: ${locationResult.error.message}`,
              });
            }
            event.completed();
          });
        });
      });
    })
    .catch((err) => {
      Office.context.mailbox.item.notificationMessages.replaceAsync("meetNotif", {
        type: Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage,
        message: `Erreur: ${err.message}`,
      });
      event.completed();
    });
}

Office.actions.associate("generateMeetingLinkFromCalendar", generateMeetingLinkFromCalendar);