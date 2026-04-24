var statusEl = document.getElementById('status');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

console.log('Transit loaded');

Office.onReady(function (info) {
  setStatus('Office prêt. En attente du parent…');

  // 1) Register handler for messages from the parent FIRST,
  //    so we don't miss a message sent right after 'ready'.
  Office.context.ui.addHandlerAsync(
    Office.EventType.DialogParentMessageReceived,
    function (arg) {
      console.log('Transit received message from parent: ', arg);

      var message = arg.message;
      setStatus('Message reçu du parent : ' + message);

      try {
        sessionStorage.setItem('transitToken', message);
        console.log('Transit token stored in sessionStorage');
        Office.context.ui.messageParent('done');
        window.location.href = 'https://meet.127.0.0.1.nip.io/api/v1.0/authenticate/?returnTo=https://meet.127.0.0.1.nip.io/addons/outlook/success.html';
      } catch (err) {
        console.error('Failed to store transit token:', err);
      }

      // `message` is always a string. If the parent sent JSON,
      // parse it here:
      // var data = JSON.parse(message);

      // Example: once we have the transit token, do the work,
      // then notify the parent we're done.
      //
    },
    function (result) {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        console.log('Failed to register handler: ', result);

        setStatus(
          'Impossible d’écouter le parent : ' + result.error.message
        );
        return;
      }

      // 2) Only now tell the parent we're ready to receive.
      Office.context.ui.messageParent('ready');
      setStatus('Prêt. Signal envoyé au parent.');
    }
  );
});