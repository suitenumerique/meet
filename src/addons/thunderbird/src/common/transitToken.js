const TRANSIT_TOKEN_KEY = "transitToken";

function save(token) {
  sessionStorage.setItem(TRANSIT_TOKEN_KEY, token);
}

function consume() {
  try {
    const token = sessionStorage.getItem(TRANSIT_TOKEN_KEY);
    sessionStorage.removeItem(TRANSIT_TOKEN_KEY);
    return token;
  } catch (err) {
    console.error("Failed to read transit token:", err);
    return null;
  }
}

module.exports = { save, consume };
