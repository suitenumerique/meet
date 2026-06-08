const { applyAppName } = require("../common/helpers");
const { exchangeSession } = require("../common/api");
const { consume } = require("../common/transitToken");

applyAppName();

const transitToken = consume();

if (!transitToken) {
  console.error("Transit token not found in sessionStorage");
  window.close();
} else {
  exchangeSession(transitToken)
    .then(() => {
      document.querySelector(".spinner-container").style.display = "none";
      document.querySelector("#close-msg").style.display = "block";
    })
    .catch((e) => {
      console.error(`Error occured: ${e}`);
    })
    .finally(() => {
      // NOTE: doesn't work with the desktop client — the browser considers
      // this window wasn't opened by this script (it was opened externally),
      // so it blocks window.close() for security reasons. The "#close-msg"
      // shown above is the fallback for that case.g
      window.close();
    });
}
