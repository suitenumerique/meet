import { buildMeetingMessage } from "./lib/meeting-message.js";

console.log("[meeting-link] background loaded at", new Date().toISOString());

// Hardcoded for Spike 1. Spike 2 replaces this with a fetch() to your API.
const STUB_MEETING_DATA = {
  url: "https://meet.example.com/m/abc-123-xyz",
  telephony: {
    phone_number: "+33123456789",
    pin_code: "1234567890",
  },
};

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type === "GET_MEETING_MESSAGE") {
    try {
      const built = buildMeetingMessage(STUB_MEETING_DATA);
      return { ok: true, ...built };
    } catch (err) {
      console.error("[meeting-link] build failed", err);
      return { ok: false, error: String(err.message || err) };
    }
  }
});