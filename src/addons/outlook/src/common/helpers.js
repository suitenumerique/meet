const { APP_NAME } = require("./index");

function isOfficeReady() {
  return typeof Office !== "undefined" && Office?.context?.roamingSettings != null;
}

function applyAppName() {
  document.querySelectorAll("[data-app-name]").forEach((el) => {
    el.textContent = APP_NAME;
  });
}

/**
 * Resolves the actual body format of the item (HTML vs plain text) via
 * getTypeAsync, which returns a CoercionType ("html"/"text").
 */
function getIsHtmlBody(item) {
  return new Promise((resolve) => {
    item.body.getTypeAsync((result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        resolve(true);
        return;
      }
      resolve(result.value === Office.CoercionType.Html);
    });
  });
}

module.exports = {
  isOfficeReady,
  applyAppName,
  getIsHtmlBody,
};
