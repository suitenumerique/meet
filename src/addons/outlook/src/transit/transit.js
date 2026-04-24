const { applyAppName } = require("../common/helpers");
const { URLS } = require("../common/urls");
const { save } = require("../common/transitToken");
const { DIALOG_SIGNALS } = require("../common/transitDialog");

// Initiate the authentication flow, then return to the success page
function getAuthenticateUrl() {
  const url = new URL(URLS.authenticate);
  url.searchParams.set("returnTo", URLS.successPage);
  return url.toString();
}

Office.onReady(function (info) {
  if (info.host === Office.HostType.Outlook) {
    applyAppName();
  }

  Office.context.ui.addHandlerAsync(
    Office.EventType.DialogParentMessageReceived,
    function (arg) {
      const transitToken = arg.message;

      if (typeof transitToken !== "string" || transitToken.trim() === "") {
        console.error("Invalid transit token received from parent dialog.");
        return;
      }

      // Runs inside the dialog window.
      // Flow:
      // transit.html saves token → navigates to /authenticate → OAuth redirect →
      // success.html. sessionStorage survives because it's per-window-per-origin
      // and the dialog window persists across same-origin navigations.
      // Fragile: if the IdP opens the redirect in a new tab/window, this breaks
      // silently.
      // An alternative could be to pass the token via the OAuth `state` param
      // and read it back from the redirect URL.
      try {
        save(transitToken);
        Office.context.ui.messageParent(DIALOG_SIGNALS.done);
        window.location.href = getAuthenticateUrl();
      } catch (err) {
        console.error("Failed to store transit token:", err);
      }
    },
    function (result) {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        console.error("Failed to register DialogParentMessageReceived handler.", result.error);
        return;
      }
      Office.context.ui.messageParent(DIALOG_SIGNALS.ready);
    }
  );
});
