const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

global.window = { __APP_CONFIG__: {} };
const { DIALOG_SIGNALS, openTransitDialog } = require("../src/common/transitDialog");
delete global.window;

const DIALOG_CLOSED_ERROR = 12006;

function openDialog(callbacks) {
  const handlers = new Map();
  const dialog = {
    addEventHandler: (event, handler) => handlers.set(event, handler),
    close: () => handlers.get("dialog")?.({ error: DIALOG_CLOSED_ERROR }),
    messageChild: () => {},
  };

  global.Office = {
    AsyncResultStatus: { Failed: "failed", Succeeded: "succeeded" },
    EventType: {
      DialogEventReceived: "dialog",
      DialogMessageReceived: "message",
    },
    context: {
      ui: {
        displayDialogAsync: (_url, _options, callback) =>
          callback({ status: "succeeded", value: dialog }),
      },
    },
  };

  openTransitDialog("transit-token", callbacks);

  return {
    close: () => handlers.get("dialog")({ error: DIALOG_CLOSED_ERROR }),
    emitError: (error) => handlers.get("dialog")({ error }),
    sendMessage: (message) => handlers.get("message")({ message }),
  };
}

afterEach(() => {
  delete global.Office;
});

test("closing the dialog before authentication reports cancellation once", () => {
  let cancelCount = 0;
  const dialog = openDialog({ onCancel: () => cancelCount++ });

  dialog.sendMessage(DIALOG_SIGNALS.done);
  dialog.close();
  dialog.close();

  assert.equal(cancelCount, 1);
});

test("closing the dialog after authentication does not report cancellation", () => {
  let cancelCount = 0;
  const dialog = openDialog({ onCancel: () => cancelCount++ });

  dialog.sendMessage(DIALOG_SIGNALS.authenticated);
  dialog.close();

  assert.equal(cancelCount, 0);
});

test("other dialog errors are reported", () => {
  let reportedError;
  const dialog = openDialog({ onError: (error) => (reportedError = error) });

  dialog.emitError(12002);

  assert.equal(reportedError.message, "Office dialog error: 12002");
});
