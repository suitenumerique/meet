const insertBtn = document.getElementById("insert");
const statusEl = document.getElementById("status");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

insertBtn.addEventListener("click", async () => {
  insertBtn.disabled = true;
  setStatus("Generating link…");

  try {
    // 1. Find the compose tab this popup belongs to.
    //    A compose_action popup is anchored to a compose window, so the
    //    "active tab in the current window" is the compose tab itself.
    const [composeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!composeTab) throw new Error("No compose tab found");

    // 2. Read the current compose state — we need to know if we're
    //    in HTML mode or plain-text mode, and we need the existing body
    //    so we can append rather than overwrite.
    const details = await browser.compose.getComposeDetails(composeTab.id);

    // 3. Ask the background to produce the meeting message.
    const reply = await browser.runtime.sendMessage({
      type: "GET_MEETING_MESSAGE",
    });
    if (!reply?.ok) throw new Error(reply?.error || "Background error");

    // 4. Append to the existing body in the right format.
    if (details.isPlainText) {
      const newBody = (details.plainTextBody || "") + "\n\n" + reply.text;
      await browser.compose.setComposeDetails(composeTab.id, {
        plainTextBody: newBody,
      });
    } else {
      const newBody = appendHtmlBeforeBodyEnd(details.body || "", reply.html);
      await browser.compose.setComposeDetails(composeTab.id, {
        body: newBody,
      });
    }

    setStatus("Inserted ✓");
    setTimeout(() => window.close(), 600);
  } catch (err) {
    console.error("[meeting-link] popup insert failed", err);
    setStatus("Failed: " + (err.message || err), true);
    insertBtn.disabled = false;
  }
});

/**
 * Append HTML right before </body>, or fall back to concatenation if no
 * </body> tag is present (Thunderbird's compose body is usually a full
 * HTML document, but be defensive).
 */
function appendHtmlBeforeBodyEnd(currentHtml, fragment) {
  const idx = currentHtml.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return currentHtml + fragment;
  return currentHtml.slice(0, idx) + fragment + currentHtml.slice(idx);
}