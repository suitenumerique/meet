const { BASE_URL } = require("./index");

const ADDONS_BASE_URL = `${BASE_URL}/api/v1.0/addons/sessions`;

const URLS = {
  authenticate: `${BASE_URL}/api/v1.0/authenticate/`,
  successPage: `${BASE_URL}/addons/outlook/success.html`,
  transitDialog: `${BASE_URL}/addons/outlook/transit.html`,
  init: `${ADDONS_BASE_URL}/init/`,
  poll: `${ADDONS_BASE_URL}/poll/`,
  exchange: `${ADDONS_BASE_URL}/exchange/`,
  rooms: `${BASE_URL}/external-api/v1.0/rooms/`,
};

module.exports = { URLS };
