const { URLS } = require("./urls");

const DIALOG_SIGNALS = {
  ready: "ready",
  done: "done",
};

const DIALOG_HEIGHT = 60;
const DIALOG_WIDTH = 50;

function openTransitDialog(transitToken, { onCancel, onError }) {
  Office.context.ui.displayDialogAsync(
    URLS.transitDialog,
    { height: DIALOG_HEIGHT, width: DIALOG_WIDTH, displayInIframe: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        onError?.(asyncResult.error);
        return;
      }

      const dialog = asyncResult.value;

      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        if (arg.message === DIALOG_SIGNALS.ready) {
          dialog.messageChild(transitToken);
          return;
        }
        if (arg.message === DIALOG_SIGNALS.done) {
          return;
        }
        onCancel?.();
        dialog.close();
      });

      return dialog;
    }
  );
}

module.exports = {
  openTransitDialog,
  DIALOG_SIGNALS,
};
