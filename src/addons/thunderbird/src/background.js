console.log("[meeting-link] background loaded at", new Date().toISOString());

browser.runtime.onMessage.addListener((msg, sender) => {
  console.log("[meeting-link] background received bite:", msg);
  return Promise.resolve({ ok: true });
});
