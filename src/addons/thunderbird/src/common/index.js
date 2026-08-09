// Two config sources feed this module, matching who's asking:
//
// - transit.html / success.html are hosted by the backend (nginx), just like
//   the Outlook add-in's own pages, and read `window.__APP_CONFIG__` — a
//   small script injected per-deployment by Helm. One built Docker image can
//   then serve many differently-configured environments without a rebuild.
// - background.js ships *inside* the installed .xpi. There is no server to
//   fetch a runtime config from before it knows which server to talk to, so
//   its values are baked in at build time by webpack.DefinePlugin (see
//   webpack.config.js), sourced from THUNDERBIRD_BASE_URL and friends.
const runtimeConfig =
  (typeof window !== "undefined" && window.__APP_CONFIG__) || null;

const BASE_URL = runtimeConfig?.BASE_URL || process.env.THUNDERBIRD_BASE_URL;
const APP_NAME =
  runtimeConfig?.APP_NAME || process.env.THUNDERBIRD_APP_NAME || "LaSuite Meet";
const ENABLE_SOURCE_TRACKING =
  (runtimeConfig?.ENABLE_SOURCE_TRACKING ??
    process.env.THUNDERBIRD_ENABLE_SOURCE_TRACKING) === "true";
const FEEDBACK_FORM =
  runtimeConfig?.FEEDBACK_FORM || process.env.THUNDERBIRD_FEEDBACK_FORM || null;

module.exports = {
  BASE_URL,
  APP_NAME,
  ENABLE_SOURCE_TRACKING,
  FEEDBACK_FORM,
};
