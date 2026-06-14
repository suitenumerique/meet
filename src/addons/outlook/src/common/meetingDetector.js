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

function removeMeetingLink(item) {
  return Promise.all([_removeFromBody(item), _removeFromLocation(item)]);
}

function _removeFromBody(item) {
  return new Promise((resolve) => {
    item.body.getAsync(Office.CoercionType.Html, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        resolve();
        return;
      }
      const cleaned = _cleanBody(result.value || "");
      if (cleaned === null) {
        resolve();
        return;
      }
      item.body.setAsync(cleaned, { coercionType: Office.CoercionType.Html }, () => resolve());
    });
  });
}

function _removeFromLocation(item) {
  if (item.itemType !== Office.MailboxEnums.ItemType.Appointment) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    item.location.getAsync((result) => {
      if (
        result.status === Office.AsyncResultStatus.Succeeded &&
        _containsMeetingUrl(result.value)
      ) {
        item.location.setAsync("", () => resolve());
      } else {
        resolve();
      }
    });
  });
}

const SEPARATOR = /─{10,}/;

/**
 * Returns cleaned HTML, or null if no meeting block was found.
 */
function _cleanBody(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const hits = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (SEPARATOR.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
  }
  if (hits.length < 2) return null;

  const range = doc.createRange();
  range.setStartBefore(hits[0]);
  range.setEndAfter(hits[hits.length - 1]);
  range.deleteContents();

  return doc.documentElement.outerHTML;
}

module.exports = { isMeetingAlreadyAdded, removeMeetingLink };
