import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { connectRoom } from '../src/networkClient.js';
import { createGameServer } from '../server.js';

function waitForMessage(session, type) {
  return new Promise(resolve => {
    const unsubscribe = session.onMessage(message => {
      if (message.type === type) { unsubscribe(); resolve(message); }
    });
  });
}

test('browser session helper enforces guest input and host snapshot roles', async t => {
  const server = createGameServer({ port: 0 });
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = connectRoom({ url, action: 'create', WebSocketImpl: WebSocket });
  const hostRoom = await host.ready;
  assert.equal(hostRoom.role, 'host');
  const guestPeerMessage = waitForMessage(host, 'peer-joined');
  const guest = connectRoom({ url, action: 'join', roomCode: hostRoom.roomCode, WebSocketImpl: WebSocket });
  assert.equal((await guest.ready).role, 'guest');
  await guestPeerMessage;

  t.after(async () => {
    host.close(); guest.close();
    await new Promise(resolve => server.close(resolve));
  });

  assert.equal(host.sendInput({ forward: true }), false);
  assert.equal(guest.sendSnapshot({ score: 999 }), false);
  assert.equal(guest.sendStart(), false);

  const startSignal = waitForMessage(guest, 'start');
  assert.equal(host.sendStart(), true);
  await startSignal;

  const relayedInput = waitForMessage(host, 'input');
  assert.equal(guest.sendInput({ forward: true, yaw: 1.2 }), true);
  assert.deepEqual((await relayedInput).input, { forward: true, yaw: 1.2 });

  const relayedSnapshot = waitForMessage(guest, 'snapshot');
  assert.equal(host.sendSnapshot({ score: 10 }), true);
  assert.deepEqual((await relayedSnapshot).state, { score: 10 });
});

test('room helper rejects unknown actions and server room errors', async t => {
  assert.throws(() => connectRoom({ url: 'ws://127.0.0.1:1', action: 'delete' }), /Unsupported/);
  const server = createGameServer({ port: 0 });
  await once(server, 'listening');
  const guest = connectRoom({ url: `ws://127.0.0.1:${server.address().port}`, action: 'join', roomCode: 'ABC123', WebSocketImpl: WebSocket });
  t.after(async () => { guest.close(); await new Promise(resolve => server.close(resolve)); });
  await assert.rejects(guest.ready, /找不到/);
});
