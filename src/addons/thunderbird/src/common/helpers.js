const { APP_NAME } = require("./index");

function applyAppName() {
  document.querySelectorAll("[data-app-name]").forEach((el) => {
    el.textContent = APP_NAME;
  });
}

module.exports = {
  applyAppName,
};
