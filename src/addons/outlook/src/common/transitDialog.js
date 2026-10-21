/* global Office */
const { URLS } = require("./urls");

const DIALOG_SIGNALS = {
  ready: "ready",
  done: "done",
  authenticated: "authenticated",
};

const DIALOG_HEIGHT = 60;
const DIALOG_WIDTH = 50;
const DIALOG_CLOSED_ERROR = 12006;

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
      let isAuthenticated = false;
      let isClosed = false;

      const handleClose = () => {
        if (isClosed) return;
        isClosed = true;
        if (!isAuthenticated) onCancel?.();
      };

      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        if (arg.message === DIALOG_SIGNALS.ready) {
          dialog.messageChild(transitToken);
          return;
        }
        if (arg.message === DIALOG_SIGNALS.done) {
          return;
        }
        if (arg.message === DIALOG_SIGNALS.authenticated) {
          isAuthenticated = true;
          return;
        }
        handleClose();
        dialog.close();
      });

      dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
        if (arg.error === DIALOG_CLOSED_ERROR) {
          handleClose();
          return;
        }
        onError?.(new Error(`Office dialog error: ${arg.error}`));
      });

      return dialog;
    }
  );
}

module.exports = {
  openTransitDialog,
  DIALOG_SIGNALS,
};
