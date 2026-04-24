var statusEl = document.getElementById('status');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

console.log('Success loaded');


try {
  var existingToken = sessionStorage.getItem('transitToken');
  // todo - delete it
  if (existingToken) {
    console.log('Existing transit token found in sessionStorage');
    setStatus('Token existant : ' + existingToken);
  }
} catch (err) {
  console.error('Failed to read transit token from sessionStorage:', err);
}

const getCsrfToken = () => {
  return document.cookie
    .split(';')
    .filter((cookie) => cookie.trim().startsWith('csrftoken='))
    .map((cookie) => cookie.split('=')[1])
    .pop()
}


const csrfToken= getCsrfToken()

// Call the API with cookie credentials
fetch('/api/v1.0/addons/sessions/exchange/', {
  method: 'POST',
  credentials: 'include', // sends cookies with the request
  headers: {
    'Content-Type': 'application/json',
    ...(!!csrfToken && { 'X-CSRFToken': csrfToken }),
  },
  body: JSON.stringify({
    transit_token: existingToken,
  })
})
  .then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  })
  .then(function (response) {
    if (response.status === 200) {
      return response.json().then(function (data) {
        setStatus('Succès : fermeture de la fenêtre...');
        // window.close();
        return data;
      });
    }
    throw new Error('HTTP ' + response.status);
  })
  .catch(function (err) {
    console.error('API call failed:', err);
    setStatus('Erreur : ' + err.message);
  });