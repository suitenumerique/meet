const { APP_NAME } = require("./index");

function isOfficeReady() {
  return typeof Office !== "undefined" && Office?.context?.roamingSettings != null;
}

function applyAppName() {
  document.querySelectorAll("[data-app-name]").forEach((el) => {
    el.textContent = APP_NAME;
  });
}

module.exports = {
  isOfficeReady,
  applyAppName,
};
