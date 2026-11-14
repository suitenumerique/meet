// Mermaid diagrams render in a closed shadow root, out of the lightbox's reach. A click
// moves the diagram into a full-screen overlay, scaled to fit; a click or Escape puts it back.
function openDiagram(diagram) {
  if (diagram.closest(".mermaid-overlay")) return
  const box = diagram.getBoundingClientRect()
  const slot = document.createComment("diagram")
  const overlay = document.createElement("div")
  overlay.className = "mermaid-overlay"
  diagram.replaceWith(slot)
  overlay.append(diagram)
  const scale = Math.min((innerWidth * 0.95) / box.width, (innerHeight * 0.95) / box.height)
  diagram.style.width = `${box.width}px`
  diagram.style.transform = `scale(${scale})`
  document.body.append(overlay)
  const onKey = (event) => event.key === "Escape" && close()
  const close = () => {
    overlay.remove()
    diagram.style.width = ""
    diagram.style.transform = ""
    slot.replaceWith(diagram)
    removeEventListener("keydown", onKey)
  }
  overlay.addEventListener("click", close)
  addEventListener("keydown", onKey)
}

// Diagrams render after the page loads, so one listener on the document catches them all.
document.addEventListener("click", (event) => {
  const diagram = event.target.closest?.("div.mermaid")
  if (diagram) openDiagram(diagram)
})
