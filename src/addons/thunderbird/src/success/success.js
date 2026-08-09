const { applyAppName } = require("../common/helpers");
const { exchangeSession } = require("../common/api");
const { consume } = require("../common/transitToken");
const { initI18n, translateUI } = require("../common/i18n");

(async () => {
  await initI18n();

  applyAppName();
  translateUI();

  const transitToken = consume();

  if (!transitToken) {
    console.error("Transit token not found in sessionStorage");
    window.close();
    return;
  }

  try {
    await exchangeSession(transitToken);
    document.querySelector(".spinner-container").style.display = "none";
    document.querySelector("#close-msg").style.display = "block";
  } catch (err) {
    console.error(`Error occurred: ${err}`);
  } finally {
    window.close();
  }
})();
