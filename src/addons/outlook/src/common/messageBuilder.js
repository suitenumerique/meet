const { APP_NAME, ENABLE_SOURCE_TRACKING, BASE_URL } = require("./index");
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

function buildPolycomToken(sipNumber, isWeb, domain) {
  const polycomPayload = [
    "POLYCOM-AUDIONUMBER2=",
    "POLYCOM-AUDIONUMBER1=",
    "POLYCOM-STREAMMEETING=false",
    "POLYCOM-RECORDMEETING=false",
    "POLYCOM-RSSVMRNAME=",
    "POLYCOM-DIALINPREFIX=",
    "POLYCOM-INVITATIONLANGUAGE=",
    "POLYCOM-SIGNALINGPREFIX=sip",
    "POLYCOM-CHAIRPASSWORDREQUIRED=false",
    "POLYCOM-SIGNALINGPOSTFIX=",
    "POLYCOM-CHAIRPASSWORD=",
    `POLYCOM-VMRNUMBER=${sipNumber}@${domain}`,
    "POLYCOM-RECORDINGURI=",
    "POLYCOM-MEETINGPASSWORD=",
    "POLYCOM-VERSION=1",
    "POLYCOM-MEETING-URL="
  ].join("\r\n");

  let b64Token = "";
  if (typeof btoa !== 'undefined') {
    const bytes = new TextEncoder().encode(polycomPayload);
    const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
    b64Token = btoa(binString);
  } else if (typeof Buffer !== 'undefined') {
    b64Token = Buffer.from(polycomPayload).toString('base64');
  }

  const polycomRaw = `--=BEGIN POLYCOM VMR ENCODED TOKEN=--\n${b64Token}\n--=END POLYCOM VMR ENCODED TOKEN=--`;

  if (isWeb) {
    const style = "mso-hide:all;max-height:0;overflow:hidden;font-size:1px;line-height:1px";
    return `<div style='${style}'>${polycomRaw.replace(/\n/g, "<br>")}</div>`;
  }
  return polycomRaw;
}

// todo - escape html / link
function buildMeetingMessage(data, isWeb, polycomEnabled = false) {
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

  const sipFromPin = polycomEnabled && data.telephony?.pin_code ? String(data.telephony.pin_code).replace(/\s+/g, "") : "";
  const domain = new URL(BASE_URL).hostname;
  const polycomContent = sipFromPin ? buildPolycomToken(sipFromPin, isWeb, domain) : "";

  if (isWeb) {
    phoneLines = phone && pin ? [`<br><br>${phoneOnly}`, `<br>${phoneFr}`, `<br>${pinCode}`] : [];

    textLines = [
      "<br><br>────────────────────────────────────────",
      `<br>${join}`,
      `<br><br><a href="${url}" target="_blank">${url}</a>`,
      ...phoneLines,
      "<br>────────────────────────────────────────<br>",
      polycomContent
    ];

  } else {

    phoneLines = phone && pin ? [`\n\n${phoneOnly}`, `\n${phoneFr}`, `\n${pinCode}`] : [];

    textLines = [
      "\n\n────────────────────────────────────────",
      `\n${join}`,
      `\n\n${url}`,
      ...phoneLines,
      "\n────────────────────────────────────────\n",
      polycomContent
    ];
  }

  const text = textLines.join("");

  return { url, text };
}

module.exports = { buildMeetingMessage };
