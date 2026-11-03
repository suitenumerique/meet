import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_IDLE_TIMEOUT_MS = 1000 * 60 * 30; // 30 minutes

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;
const MESSAGE_QUERY_AWARENESS = 3;

/**
 * @typedef {Object} Room
 * @property {Y.Doc} doc
 * @property {awarenessProtocol.Awareness} awareness
 * @property {Map<WebSocket, Set<number>>} conns
 * @property {NodeJS.Timeout|null} idleTimer
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * Extract room name from request path.
 * Supports:
 *   /room-id
 *   /collab/room-id
 *   /collab/room-id/
 * @param {string|undefined} urlPath
 * @returns {string|null}
 */
export function getRoomNameFromUrl(urlPath) {
  if (!urlPath) return null;
  const cleanPath = urlPath.split('?')[0];
  const match = cleanPath.match(/^(?:\/collab)?\/([^/]+)/);
  if (!match || !match[1]) return null;
  return decodeURIComponent(match[1]);
}

/**
 * Get or create a collaborative room.
 * @param {string} roomName
 * @returns {Room}
 */
export function getOrCreateRoom(roomName) {
  let room = rooms.get(roomName);
  if (room) {
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    return room;
  }

  const doc = new Y.Doc({ gc: true });
  const awareness = new awarenessProtocol.Awareness(doc);
  /** @type {Map<WebSocket, Set<number>>} */
  const conns = new Map();

  room = {
    doc,
    awareness,
    conns,
    idleTimer: null,
  };

  // Broadcast doc updates to all other peers in the room
  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    room.conns.forEach((_, conn) => {
      if (conn !== origin) {
        send(conn, message);
      }
    });
  });

  // Broadcast awareness changes to all peers in the room
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);

    // Track client IDs associated with origin socket
    if (origin instanceof WebSocket) {
      const controlled = room.conns.get(origin);
      if (controlled) {
        added.concat(updated).forEach((id) => controlled.add(id));
        removed.forEach((id) => controlled.delete(id));
      }
    }

    room.conns.forEach((_, conn) => {
      send(conn, message);
    });
  });

  rooms.set(roomName, room);
  return room;
}

/**
 * Safely send binary message to a WebSocket client.
 * @param {WebSocket} conn
 * @param {Uint8Array} message
 */
function send(conn, message) {
  if (conn.readyState === WebSocket.OPEN) {
    try {
      conn.send(message);
    } catch (err) {
      console.error('[Collab] Failed to send message:', err);
    }
  }
}

/**
 * Handle new WebSocket connection to a specific room.
 * @param {WebSocket} conn
 * @param {string} roomName
 */
export function setupWSConnection(conn, roomName) {
  conn.binaryType = 'arraybuffer';
  conn.isAlive = true;

  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());

  conn.on('pong', () => {
    conn.isAlive = true;
  });

  conn.on('message', (data) => {
    try {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
          if (encoding.length(encoder) > 1) {
            send(conn, encoding.toUint8Array(encoder));
          }
          break;
        }

        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            conn
          );
          break;
        }

        case MESSAGE_QUERY_AWARENESS: {
          const states = room.awareness.getStates();
          if (states.size > 0) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
              encoder,
              awarenessProtocol.encodeAwarenessUpdate(
                room.awareness,
                Array.from(states.keys())
              )
            );
            send(conn, encoding.toUint8Array(encoder));
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error(`[Collab] Error processing message in room "${roomName}":`, err);
    }
  });

  conn.on('close', () => {
    const controlledIds = room.conns.get(conn);
    room.conns.delete(conn);

    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(controlledIds),
        null
      );
    }

    if (room.conns.size === 0) {
      room.idleTimer = setTimeout(() => {
        if (room.conns.size === 0) {
          room.awareness.destroy();
          room.doc.destroy();
          rooms.delete(roomName);
        }
      }, ROOM_IDLE_TIMEOUT_MS);
      room.idleTimer.unref();
    }
  });

  conn.on('error', (err) => {
    console.error(`[Collab] Connection error in room "${roomName}":`, err);
  });

  // Step 1: Send sync step 1
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, room.doc);
  send(conn, encoding.toUint8Array(syncEncoder));

  // Step 2: Send current awareness states
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    send(conn, encoding.toUint8Array(awarenessEncoder));
  }
}

/**
 * Create HTTP server and attach WebSocket upgrade handler.
 * @returns {http.Server}
 */
export function createServer() {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] || '';

    if (url === '/health' || url === '/healthz' || url === '/collab/health') {
      let totalConns = 0;
      rooms.forEach((r) => {
        totalConns += r.conns.size;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          activeRooms: rooms.size,
          connections: totalConns,
          uptime: process.uptime(),
        })
      );
      return;
    }

    if (url === '/' || url === '/collab' || url === '/collab/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Whiteboard Collaboration Service is running.\n');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const roomName = getRoomNameFromUrl(req.url);
    if (!roomName || roomName === 'health' || roomName === 'healthz') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      setupWSConnection(ws, roomName);
    });
  });

  // Keep-alive heartbeat
  const pingInterval = setInterval(() => {
    rooms.forEach((room) => {
      room.conns.forEach((_, ws) => {
        if (ws.isAlive === false) {
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    });
  }, 30000);
  pingInterval.unref();

  server.on('close', () => {
    clearInterval(pingInterval);
    rooms.forEach((room) => {
      if (room.idleTimer) clearTimeout(room.idleTimer);
      room.awareness.destroy();
      room.doc.destroy();
    });
    rooms.clear();
  });

  return server;
}

// Start standalone server if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`[Collab] Whiteboard collaboration service listening on ${HOST}:${PORT}`);
  });
}
