/* global Office */

const BASE_URL = "https://meet.127.0.0.1.nip.io";

// ─── Session Storage ──────────────────────────────────────────────────────

function saveSession(data) {
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  const payload = JSON.stringify({
    ...data,
    expiresAt,
    savedAt: new Date().toISOString(),
  });

  localStorage.setItem("meetSession", payload);

  const rs = Office.context.roamingSettings;
  rs.set("meetSession", payload);
  rs.saveAsync((result) => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      console.error("RoamingSettings save failed:", result.error.message);
    }
  });
}

function loadSession() {
  let session = null;

  try {
    const stored = Office.context.roamingSettings.get("meetSession");
    if (stored) session = JSON.parse(stored);
  } catch (e) {
    console.warn("RoamingSettings read failed:", e);
  }

  if (!session) {
    try {
      const stored = localStorage.getItem("meetSession");
      if (stored) session = JSON.parse(stored);
    } catch (e) {
      console.warn("localStorage read failed:", e);
    }
  }

  if (!session) return null;

  if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
    console.warn("Token expired, clearing session.");
    clearSession();
    return null;
  }

  return session;
}

function clearSession() {
  localStorage.removeItem("meetSession");
  try {
    const rs = Office.context.roamingSettings;
    rs.remove("meetSession");
    rs.saveAsync(() => console.log("RoamingSettings cleared."));
  } catch (e) {
    console.warn("Could not clear RoamingSettings:", e);
  }
}

// ─── Meeting Message Builder ───────────────────────────────────────────────

function buildMeetingMessage(data) {
  const url   = data.url;
  const phone = data.telephony?.phone_number;
  const pin   = data.telephony?.pin_code;

  const formattedPin = pin
    ? pin.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3") + "#"
    : "";

  const formattedPhone = phone
    ? phone.replace(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "+33 $1 $2 $3 $4 $5")
    : phone;

  const message = `<pre style="font-family:inherit; font-size:inherit; border:none; background:none; margin:16px 0;">
────────────────────────────────────────
Rejoindre la réunion LaSuite Meet

<a href="${url}">${url}</a>

Ou appelez (audio uniquement)
(FR) ${formattedPhone}
Code : ${formattedPin}
────────────────────────────────────────</pre>`;

  return { url, message };
}
