const { APP_NAME } = require("../common");

const i18nextModule = require("i18next");
const i18next = i18nextModule.default || i18nextModule;

const fr = require("../locales/fr/translation.json");
const en = require("../locales/en/translation.json");
const de = require("../locales/de/translation.json");

async function initI18n() {
  const lng = typeof Office !== "undefined" ? Office.context.displayLanguage : navigator.language;

  await i18next.init({
    lng,
    fallbackLng: "fr",
    interpolation: { escapeValue: false },
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      de: { translation: de },
    },
  });
}

function t(key, vars) {
  return i18next.t(key, vars);
}

function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key, { app_name: APP_NAME });
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const pairs = el.getAttribute("data-i18n-attr").split(",");
    pairs.forEach((pair) => {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr, t(key, { app_name: APP_NAME }));
    });
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
}

module.exports = { initI18n, t, translateUI };
