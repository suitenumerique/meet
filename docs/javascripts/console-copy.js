// The copy button of a terminal block copies its commands alone: no $ prompt, no output.
// The text is built at the click, so a page the preview reloaded copies what it shows.
function consoleCommands(code) {
  const commands = []
  for (const line of code.textContent.split("\n")) {
    if (line.startsWith("$ ")) commands.push(line.slice(2))
  }
  return commands.join("\n")
}

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest("[data-clipboard-target]")
    if (!button) return
    const code = document.querySelector(button.getAttribute("data-clipboard-target"))
    const commands = code?.querySelector(".gp") && consoleCommands(code)
    if (commands) code.closest("pre").setAttribute("data-copy", commands)
  },
  true,
)
