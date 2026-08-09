const { BASE_URL, ENABLE_SOURCE_TRACKING } = require("./index");

function appendTrackingParams(url) {
  if (!ENABLE_SOURCE_TRACKING) return url;
  const u = new URL(url);
  u.searchParams.set("from", "thunderbird-addon");
  return u.toString();
}

// The addon only ever writes into the event's Location field (that's the
// whole ask — no description/body block like the Outlook add-in builds),
// so all we need out of the created room is its URL.
function buildLocationValue(room) {
  if (!room?.url) {
    throw new Error("buildLocationValue: missing url in room data");
  }
  return appendTrackingParams(room.url);
}

// Used to decide whether the dialog shows "Add a meeting link" or "Join" —
// same origin-substring check the Outlook add-in uses.
function isMeetingUrl(value) {
  if (!value) return false;
  return value.includes(BASE_URL);
}

module.exports = { buildLocationValue, isMeetingUrl };
