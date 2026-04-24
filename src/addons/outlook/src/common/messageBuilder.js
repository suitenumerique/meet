const { APP_NAME } = require("./index");

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

// todo - escape html / link
function buildMeetingMessage(data) {
  if (!data?.url) {
    throw new Error("buildMeetingMessage: missing url in data");
  }

  const url = data.url;
  const phone = _formatPhone(data.telephony?.phone_number);
  const pin = _formatPin(data.telephony?.pin_code);

  const telephonyBlock =
    phone && pin
      ? `

Ou appelez (audio uniquement)
(FR) ${phone}
Code : ${pin}`
      : "";

  const message = `<pre style="font-family:inherit; font-size:inherit; border:none; background:none; margin:16px 0;">
────────────────────────────────────────
Rejoindre la réunion ${APP_NAME}

<a href="${url}">${url}</a>${telephonyBlock}
────────────────────────────────────────</pre>`;

  return { url, message };
}

module.exports = { buildMeetingMessage };
