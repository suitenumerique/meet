const { BASE_URL } = require("./index");

/**
 * Returns a promise that resolves to true if a meeting link is already present
 */
function isMeetingAlreadyAdded(item) {
  return Promise.all([_checkBody(item), _checkLocation(item)]).then(
    ([inBody, inLocation]) => inBody || inLocation
  );
}

function _checkBody(item) {
  return new Promise((resolve) => {
    item.body.getAsync(Office.CoercionType.Text, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        resolve(false);
        return;
      }
      resolve(_containsMeetingUrl(result.value));
    });
  });
}

function _checkLocation(item) {
  // Location only exists on appointments
  if (item.itemType !== Office.MailboxEnums.ItemType.Appointment) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    item.location.getAsync((result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        resolve(false);
        return;
      }
      resolve(_containsMeetingUrl(result.value));
    });
  });
}

function _containsMeetingUrl(text) {
  if (!text) return false;
  return text.includes(BASE_URL);
}

module.exports = { isMeetingAlreadyAdded };
