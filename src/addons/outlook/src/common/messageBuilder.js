const { APP_NAME, ENABLE_SOURCE_TRACKING } = require("./index");
const { t } = require("./i18n");

function _formatPin(pin) {
  if (!pin) return "";
  const clean = String(pin).replace(/\s+/g, "");
  if (!clean) return "";
  if (/^\d{10}$/.test(clean)) {
    return clean.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3") + "#";
  }
  return clean + "#";
}

// todo - support international format
function _formatPhone(phone) {
  if (!phone) return "";
  const clean = String(phone).replace(/\s+/g, "");
  if (/^\+33\d{9}$/.test(clean)) {
    return clean.replace(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "+33 $1 $2 $3 $4 $5");
  }
  return clean;
}

function _appendTrackingParams(url) {
  if (!ENABLE_SOURCE_TRACKING) return url;
  const u = new URL(url);
  u.searchParams.set("from", "outlook-addin");
  return u.toString();
}


// todo - escape html / link
function buildMeetingMessage(data, isWeb) {
  if (!data?.url) {
    throw new Error("buildMeetingMessage: missing url in data");
  }

  const url = _appendTrackingParams(data.url);
  const phone = _formatPhone(data.telephony?.phone_number);
  const pin = _formatPin(data.telephony?.pin_code);

  let textLines = "";
  let phoneLines = [];

  const join = t("meeting_message.join", { app_name: APP_NAME });
  const phoneOnly = t("meeting_message.phone_only");
  const phoneFr = t("meeting_message.phone_fr", { phone });
  const pinCode = t("meeting_message.pin_code", { pin });

  if (isWeb) {
    phoneLines = phone && pin ? [`<br><br>${phoneOnly}`, `<br>${phoneFr}`, `<br>${pinCode}`] : [];

    textLines = [
      "<br><br>────────────────────────────────────────",
      `<br>${join}`,
      `<br><br><a href="${url}" target="_blank">${url}</a>`,
      ...phoneLines,
      "<br>────────────────────────────────────────<br>",
    ];

  } else {

    phoneLines = phone && pin ? [`\n\n${phoneOnly}`, `\n${phoneFr}`, `\n${pinCode}`] : [];

    textLines = [
      "\n\n────────────────────────────────────────",
      `\n${join}`,
      `\n\n${url}`,
      ...phoneLines,
      "\n────────────────────────────────────────\n",
    ];
  }

  const text = textLines.join("");

  return { url, text };
}

module.exports = { buildMeetingMessage };
