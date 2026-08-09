"use strict";

/* global ChromeUtils, ExtensionCommon */

// Chrome-privileged code — reviewed with the "make sure the integration is
// right in terms of security" requirement in mind. This file's whole job is
// DOM injection and reading/writing the Location field's *visible textbox*.
// It never makes a network request, never touches auth tokens, and never
// eval()s anything; all of that lives in the sandboxed background script
// (src/background/background.js), reached only through the narrow
// request/response surface below (onAddRequested / onJoinRequested /
// applyResult). Kept deliberately smaller than Thunderbird's own draft
// calendar Experiment API (thunderbird/webext-experiments) or
// gdata-provider's — no generic calendar CRUD surface, just this one job.
//
// Pattern follows gdata-provider (github.com/kewisch/gdata-provider), the
// most-installed Thunderbird calendar add-on, written by Thunderbird's own
// calendar maintainer: ExtensionSupport.registerWindowListener on the event
// dialog's chrome URL, reading window.mode/window.calendarItem, and
// injecting a row next to Location — which is what makes this work for a
// brand-new, unsaved event too (see the two DOM ids below; that's the part
// most likely to need adjusting per Thunderbird version — verify against
// chrome://calendar/content/calendar-event-dialog.xhtml on the target
// version before shipping).

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs",
);

const EVENT_DIALOG_URL =
  "chrome://calendar/content/calendar-event-dialog.xhtml";
const SUMMARY_DIALOG_URL =
  "chrome://calendar/content/calendar-summary-dialog.xhtml";

// Thunderbird internals — verify against the target version before shipping.
const LOCATION_ROW_ID = "event-grid-location-row";
const LOCATION_INPUT_ID = "item-location";
const SUMMARY_LOCATION_ROW_SELECTOR = ".location-row";

const ROW_ID = "lasuite-meeting-link-row";
const EVENT_LISTENER_NAME = "lasuite-meeting-link-event-dialog";
const SUMMARY_LISTENER_NAME = "lasuite-meeting-link-summary-dialog";

this.meetingLink = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    let baseUrl = "";
    let labels = {
      add: "Add a meeting link",
      adding: "Adding…",
      join: "Join",
      error: "Error — try again",
    };
    let fireAdd = null;
    let fireJoin = null;
    const pendingByRequestId = new Map();
    let requestCounter = 0;

    const isMeetingUrl = (value) =>
      Boolean(value && baseUrl && value.includes(baseUrl));

    const setButtonState = (button, locationValue) => {
      const linked = isMeetingUrl(locationValue);
      button.textContent = linked ? labels.join : labels.add;
      button.dataset.mode = linked ? "join" : "add";
      button.disabled = false;
    };

    const buildRow = (doc, locationInput, { readOnly }) => {
      const row = doc.createXULElement("hbox");
      row.id = ROW_ID;
      row.setAttribute("align", "center");
      row.classList.add("lasuite-meeting-link-row");

      const button = doc.createXULElement("button");
      button.classList.add("lasuite-meeting-link-button");
      row.appendChild(button);
      setButtonState(button, locationInput?.value);

      button.addEventListener("command", () => {
        if (button.dataset.mode === "join") {
          fireJoin?.async(locationInput.value);
          return;
        }
        if (readOnly || !locationInput) return;

        const requestId = String(++requestCounter);
        pendingByRequestId.set(requestId, { locationInput, button });
        button.disabled = true;
        button.textContent = labels.adding;
        fireAdd?.async(requestId);
      });

      if (!readOnly && locationInput) {
        locationInput.addEventListener("input", () =>
          setButtonState(button, locationInput.value),
        );
      }

      return row;
    };

    // New events (window.mode == "new") and existing/edit events both land
    // here — window.calendarItem exists for both (Thunderbird sets it in
    // calendar-event-dialog.js's onLoad regardless of mode), but we don't
    // even need it: writing the visible textbox is enough, since
    // Thunderbird's own Save reads the final DOM state. This is what
    // resolves the "new event" gap the May 2025 spike got stuck on — no
    // getCurrent()/item-property mutation needed for this path at all.
    const injectEventDialog = (window) => {
      const doc = window.document;
      const locationRow = doc.getElementById(LOCATION_ROW_ID);
      const locationInput = doc.getElementById(LOCATION_INPUT_ID);
      if (!locationRow || !locationInput || doc.getElementById(ROW_ID)) return;
      locationRow.after(buildRow(doc, locationInput, { readOnly: false }));
    };

    // Read-only summary/invite view: no Save step to piggyback on, so this
    // path only ever renders a Join button, sourced from the item's own
    // LOCATION property — never writes anything.
    const injectSummaryDialog = (window) => {
      const doc = window.document;
      const locationRow = doc.querySelector(SUMMARY_LOCATION_ROW_SELECTOR);
      if (!locationRow || doc.getElementById(ROW_ID)) return;

      const item = window.calendarItem;
      const location = item?.getProperty?.("LOCATION");
      if (!isMeetingUrl(location)) return;

      locationRow.after(buildRow(doc, { value: location }, { readOnly: true }));
    };

    ExtensionSupport.registerWindowListener(EVENT_LISTENER_NAME, {
      chromeURLs: [EVENT_DIALOG_URL],
      onLoadWindow: injectEventDialog,
    });

    ExtensionSupport.registerWindowListener(SUMMARY_LISTENER_NAME, {
      chromeURLs: [SUMMARY_DIALOG_URL],
      onLoadWindow: injectSummaryDialog,
    });

    return {
      meetingLink: {
        configure(options) {
          baseUrl = options?.baseUrl || "";
          if (options?.labels) {
            labels = { ...labels, ...options.labels };
          }
        },

        applyResult(requestId, result) {
          const pending = pendingByRequestId.get(requestId);
          pendingByRequestId.delete(requestId);
          if (!pending) return;

          const { locationInput, button } = pending;

          if (result?.ok && result.url) {
            locationInput.value = result.url;
            locationInput.dispatchEvent(
              new locationInput.ownerGlobal.Event("input", { bubbles: true }),
            );
            setButtonState(button, result.url);
          } else {
            button.disabled = false;
            button.textContent = labels.error;
            button.dataset.mode = "add";
          }
        },

        onAddRequested: new ExtensionCommon.EventManager({
          context,
          name: "meetingLink.onAddRequested",
          register: (fire) => {
            fireAdd = fire;
            return () => {
              fireAdd = null;
            };
          },
        }).api(),

        onJoinRequested: new ExtensionCommon.EventManager({
          context,
          name: "meetingLink.onJoinRequested",
          register: (fire) => {
            fireJoin = fire;
            return () => {
              fireJoin = null;
            };
          },
        }).api(),
      },
    };
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) return;
    ExtensionSupport.unregisterWindowListener(EVENT_LISTENER_NAME);
    ExtensionSupport.unregisterWindowListener(SUMMARY_LISTENER_NAME);
    for (const window of ExtensionSupport.openWindows) {
      window.document?.getElementById(ROW_ID)?.remove();
    }
  }
};
