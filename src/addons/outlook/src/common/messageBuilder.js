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
function buildMeetingMessage(data, isWeb) {
  if (!data?.url) {
    throw new Error("buildMeetingMessage: missing url in data");
  }

  const url = data.url;
  const phone = _formatPhone(data.telephony?.phone_number);
  const pin = _formatPin(data.telephony?.pin_code);

  let textLines = "";
  let phoneLines = [];

    phoneLines = phone &&
      pin && [
        "<br><br>Ou appelez (audio uniquement)",
        `<br>(FR) ${phone}`,
        `<br>Code ${pin}`
      ];

    textLines = [
      "<br><br>────────────────────────────────────────",
      `<br>Rejoindre la réunion ${APP_NAME}`,
      `<br><br><a href="${url}" target="_blank">${url}</a>`,
      ...phoneLines,
      "<br>────────────────────────────────────────<br>",
    ];

  } else {

    phoneLines = phone &&
      pin && [
        "\n\nOu appelez (audio uniquement)",
        `\n(FR) ${phone}`,
        `\nCode ${pin}`
      ];

    textLines = [
      "\n\n────────────────────────────────────────",
      `\nRejoindre la réunion ${APP_NAME}`,
      `\n\n${url}`,
      ...phoneLines,
      "\n────────────────────────────────────────\n",
    ];
  }

  const text = textLines.join("");

  return { url, text };
}

module.exports = { buildMeetingMessage };
