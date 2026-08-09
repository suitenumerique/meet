// Renders manifest.json from manifest.template.json, substituting the backend
// origin this build targets. host_permissions must name a concrete origin
// (never <all_urls>) so the extension can only reach the LaSuite Meet
// deployment it was built for.
const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "https://meet.127.0.0.1.nip.io";

const baseUrl = (process.env.THUNDERBIRD_BASE_URL || DEFAULT_BASE_URL).replace(
  /\/+$/,
  "",
);

const templatePath = path.join(__dirname, "..", "manifest.template.json");
const outputPath = path.join(__dirname, "..", "manifest.json");

const template = fs.readFileSync(templatePath, "utf8");
const rendered = template.split("__BASE_URL__").join(baseUrl);

// Validate the result is well-formed before writing it out.
JSON.parse(rendered);

fs.writeFileSync(outputPath, rendered);
console.log(`Wrote ${outputPath} (host_permissions: ${baseUrl}/*)`);
