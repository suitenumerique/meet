
const { BASE_URL, loadSession, saveSession, clearSession, buildMeetingMessage } = require("../common");

// ─── Views ────────────────────────────────────────────────────────────────

function showView(name) {
  document.getElementById("view-loading").style.display = "none";
  document.getElementById("view-unauth").style.display  = "none";
  document.getElementById("view-auth").style.display    = "none";
  document.getElementById(`view-${name}`).style.display = "block";
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// ─── Polling ──────────────────────────────────────────────────────────────

function startPolling(session_id, { onSuccess, onTimeout, onError }) {
  let pollCount = 0;
  const pollInterval = setInterval(() => {
    // ─── Timeout after 3 minutes ──────────────────────────────
    if (pollCount++ > 180) {
      clearInterval(pollInterval);
      onTimeout?.();
      return;
    }
    fetch(`${BASE_URL}/api/v1.0/addons/sessions/wip/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id }),
    })
      .then((res) => res.json())
      .then((sessionData) => {
        console.log("Polling:", sessionData);
        if (sessionData.state === "authenticated" && sessionData.access_token) {
          clearInterval(pollInterval);
          onSuccess?.(sessionData);
        }
      })
      .catch((err) => {
        clearInterval(pollInterval);
        onError?.(err);
      });
  }, 1000);

  return pollInterval;
}

// ─── Transit Dialog ───────────────────────────────────────────────────────

function openTransitDialog(transit_token, { onCancel, onError }) {
  const meetUrl = `${BASE_URL}/addons/transit/?transit_token=${transit_token}`;

  Office.context.ui.displayDialogAsync(
    meetUrl,
    { height: 60, width: 50, displayInIframe: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        onError?.(asyncResult.error);
        return;
      }

      const dialog = asyncResult.value;

      dialog.addEventHandler(Office.EventType.DialogMessageReceived, () => {
        onCancel?.();
        dialog.close();
      });

      dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
        if (arg.error === 12006) {
          setStatus("Dialog fermé. En attente d'authentification...");
        }
      });

      return dialog;
    }
  );
}

// ─── Auth Flow ────────────────────────────────────────────────────────────

function connect() {
  setStatus("Démarrage de la session...");

  fetch(`${BASE_URL}/api/v1.0/addons/sessions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => res.json())
    .then((data) => {
      const session_id = data.session_id;
      const transit_token = data.transit_token;
      setStatus("En attente d'authentification...");

      const pollInterval = startPolling(session_id, {
        onSuccess: (sessionData) => {
          saveSession(sessionData);
          setStatus("Connecté !");
          showView("auth");
        },
        onTimeout: () => {
          setStatus("Délai d'authentification dépassé. Veuillez réessayer.");
          showView("unauth");
        },
        onError: (err) => {
          setStatus(`Erreur de polling: ${err.message}`);
        },
      });

      openTransitDialog(transit_token, {
        onCancel: () => clearInterval(pollInterval),
        onError:  (err) => {
          clearInterval(pollInterval);
          setStatus(`Erreur dialog: ${err.message}`);
        },
      });
    })
    .catch((err) => {
      setStatus(`Erreur de connexion: ${err.message}`);
    });
}

function disconnect() {
  clearSession();
  setStatus("Déconnecté.");
  showView("unauth");
}

function generateMeetingLink() {
  const session = loadSession();
  if (!session?.access_token) {
    setStatus("Session introuvable. Veuillez vous reconnecter.");
    showView("unauth");
    return;
  }

  const btn = document.getElementById("btn-generate");
  btn.disabled    = true;
  btn.textContent = "Génération...";

  fetch(`${BASE_URL}/external-api/v1.0/rooms/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + session.access_token,
    },
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("Room created:", data);

      const { url, message } = buildMeetingMessage(data);
      const item = Office.context.mailbox.item;

      item.body.getAsync(Office.CoercionType.Html, (getResult) => {
        if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
          setStatus(`Erreur de lecture: ${getResult.error.message}`);
          btn.disabled    = false;
          btn.textContent = "Ajouter une réunion Visio";
          return;
        }

        item.body.setAsync(
          getResult.value + message,
          { coercionType: Office.CoercionType.Html },
          (setResult) => {
            if (setResult.status !== Office.AsyncResultStatus.Succeeded) {
              setStatus(`Erreur d'insertion: ${setResult.error.message}`);
              btn.disabled    = false;
              btn.textContent = "Ajouter une réunion Visio";
              return;
            }

            // ─── If calendar event, also set location ──────────────
            if (item.itemType === Office.MailboxEnums.ItemType.Appointment) {
              item.location.setAsync(url, (locationResult) => {
                btn.disabled    = false;
                btn.textContent = "Ajouter une réunion Visio";
                if (locationResult.status === Office.AsyncResultStatus.Succeeded) {
                  setStatus("Lien de réunion inséré !");
                } else {
                  setStatus(`Erreur de localisation: ${locationResult.error.message}`);
                }
              });
            } else {
              btn.disabled    = false;
              btn.textContent = "Ajouter une réunion Visio";
              setStatus("Lien de réunion inséré !");
            }
          }
        );
      });
    })
    .catch((err) => {
      btn.disabled    = false;
      btn.textContent = "Ajouter une réunion Visio";
      setStatus(`Erreur: ${err.message}`);
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────

Office.onReady((info) => {
  if (info.host === Office.HostType.Outlook) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display     = "flex";

    document.getElementById("btn-connect").onclick    = connect;
    document.getElementById("btn-disconnect").onclick = disconnect;
    document.getElementById("btn-generate").onclick   = generateMeetingLink;

    const session = loadSession();
    if (session?.state === "authenticated" && session?.access_token) {
      setStatus("Connecté.");
      showView("auth");
    } else {
      showView("unauth");
    }
  }
});
