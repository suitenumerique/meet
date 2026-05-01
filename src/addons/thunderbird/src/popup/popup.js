document.getElementById("go").addEventListener("click", async () => {
  console.log("[meeting-link] popup button clicked");
  const reply = await browser.runtime.sendMessage({ type: "PING" });
  document.getElementById("status").textContent =
    "background replied: " + JSON.stringify(reply);
});
