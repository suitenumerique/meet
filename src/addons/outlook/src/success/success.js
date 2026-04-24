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
    .catch((e) => {
      console.error(`Error occured: ${e}`);
    })
    .finally(() => {
      window.close();
    });
}
