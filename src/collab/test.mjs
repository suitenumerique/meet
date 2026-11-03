import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createServer, getRoomNameFromUrl } from './server.mjs';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

async function runTests() {
  console.log('--- Testing getRoomNameFromUrl ---');
  assert.equal(getRoomNameFromUrl('/collab/room-123'), 'room-123');
  assert.equal(getRoomNameFromUrl('/collab/room-123/'), 'room-123');
  assert.equal(getRoomNameFromUrl('/collab/room-123?token=abc'), 'room-123');
  assert.equal(getRoomNameFromUrl('/room-456'), 'room-456');
  assert.equal(getRoomNameFromUrl('/room-456/'), 'room-456');
  assert.equal(getRoomNameFromUrl('/'), null);
  assert.equal(getRoomNameFromUrl('/health'), 'health'); // Filtered in upgrade handler
  console.log('✓ getRoomNameFromUrl tests passed');

  console.log('--- Testing HTTP Server & /health ---');
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const healthRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
      res.on('error', reject);
    });
  });

  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.body.status, 'ok');
  assert.equal(healthRes.body.activeRooms, 0);
  console.log('✓ Health endpoint test passed');

  console.log('--- Testing WebSocket Sync & Awareness Protocol ---');
  function createTestClient(roomName) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/${roomName}`);
    ws.binaryType = 'arraybuffer';
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    doc.on('update', (update, origin) => {
      if (origin !== 'remote' && ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        ws.send(encoding.toUint8Array(encoder));
      }
    });

    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin !== 'remote' && ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed))
        );
        ws.send(encoding.toUint8Array(encoder));
      }
    });

    ws.on('message', (data) => {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, 'remote');
        if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
          ws.send(encoding.toUint8Array(encoder));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          'remote'
        );
      }
    });

    const readyPromise = new Promise((resolve) => ws.on('open', resolve));

    return { ws, doc, awareness, readyPromise };
  }

  const client1 = createTestClient('room-alpha');
  const client2 = createTestClient('room-alpha');
  const clientOther = createTestClient('room-beta');

  await Promise.all([client1.readyPromise, client2.readyPromise, clientOther.readyPromise]);

  // Test sync
  client1.doc.getMap('elements').set('shape-1', { type: 'rectangle', x: 100, y: 100 });

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(client2.doc.getMap('elements').get('shape-1'), { type: 'rectangle', x: 100, y: 100 });
  assert.equal(clientOther.doc.getMap('elements').get('shape-1'), undefined, 'Room isolation verified');
  console.log('✓ Document synchronization and room isolation verified');

  // Test awareness
  client1.awareness.setLocalStateField('user', { name: 'Alice', color: '#ff0000' });

  await new Promise((resolve) => setTimeout(resolve, 100));

  const states = Array.from(client2.awareness.getStates().values());
  const aliceState = states.find((s) => s.user?.name === 'Alice');
  assert.ok(aliceState, 'Alice awareness received by client2');
  assert.equal(aliceState.user.color, '#ff0000');
  console.log('✓ Awareness state broadcast verified');

  // Cleanup
  client1.ws.close();
  client2.ws.close();
  clientOther.ws.close();
  client1.awareness.destroy();
  client2.awareness.destroy();
  clientOther.awareness.destroy();
  client1.doc.destroy();
  client2.doc.destroy();
  clientOther.doc.destroy();

  await new Promise((resolve) => server.close(resolve));
  console.log('✓ Server shut down cleanly');
  console.log('All collaboration tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
