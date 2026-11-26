import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createGameServer } from '../server.js';

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for a server message')); }, 3000);
    const onMessage = data => { cleanup(); resolve(JSON.parse(data.toString())); };
    const onClose = () => { cleanup(); reject(new Error('Socket closed before a message arrived')); };
    const onError = error => { cleanup(); reject(error); };
    function cleanup() {
      clearTimeout(timer); socket.off('message', onMessage); socket.off('close', onClose); socket.off('error', onError);
    }
    socket.on('message', onMessage); socket.once('close', onClose); socket.once('error', onError);
  });
}

test('two-player rooms relay guest input and host snapshots, then close cleanly', async t => {
  const server = createGameServer({ port: 0 });
  await once(server, 'listening');
  const address = server.address();
  const url = `ws://127.0.0.1:${address.port}`;
  const host = new WebSocket(url);
  await once(host, 'open');
  let guest;

  t.after(async () => {
    if (guest?.readyState === WebSocket.OPEN) guest.close();
    if (host.readyState === WebSocket.OPEN) host.close();
    await new Promise(resolve => server.close(resolve));
  });

  const createdMessage = nextMessage(host);
  host.send(JSON.stringify({ type: 'room-create' }));
  const created = await createdMessage;
  assert.equal(created.type, 'room-created');
  assert.match(created.roomCode, /^[A-F0-9]{6}$/);

  guest = new WebSocket(url);
  await once(guest, 'open');
  const peerJoinedMessage = nextMessage(host);
  const joinedMessage = nextMessage(guest);
  guest.send(JSON.stringify({ type: 'room-join', roomCode: created.roomCode.toLowerCase() }));
  const [peerJoined, joined] = await Promise.all([peerJoinedMessage, joinedMessage]);
  assert.equal(peerJoined.type, 'peer-joined');
  assert.equal(joined.type, 'room-joined');
  assert.equal(joined.role, 'guest');

  const forwardedInputMessage = nextMessage(host);
  guest.send(JSON.stringify({ type: 'input', input: { forward: true } }));
  assert.deepEqual(await forwardedInputMessage, { type: 'input', playerId: joined.playerId, input: { forward: true } });

  const forwardedInteractionMessage = nextMessage(host);
  guest.send(JSON.stringify({ type: 'interact' }));
  assert.deepEqual(await forwardedInteractionMessage, { type: 'interact', playerId: joined.playerId });

  const snapshotMessage = nextMessage(guest);
  host.send(JSON.stringify({ type: 'snapshot', state: { score: 10 } }));
  assert.deepEqual(await snapshotMessage, { type: 'snapshot', state: { score: 10 } });

  const peerLeftMessage = nextMessage(host);
  guest.close();
  assert.equal((await peerLeftMessage).type, 'peer-left');
});

test('room rejects a third player and does not allow guests to publish authority snapshots', async t => {
  const server = createGameServer({ port: 0 });
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = new WebSocket(url);
  await once(host, 'open');
  const guest = new WebSocket(url);
  await once(guest, 'open');
  const third = new WebSocket(url);
  await once(third, 'open');

  t.after(async () => {
    for (const socket of [host, guest, third]) if (socket.readyState === WebSocket.OPEN) socket.close();
    await new Promise(resolve => server.close(resolve));
  });

  const createdMessage = nextMessage(host);
  host.send(JSON.stringify({ type: 'room-create' }));
  const created = await createdMessage;
  const joinedMessage = nextMessage(guest);
  guest.send(JSON.stringify({ type: 'room-join', roomCode: created.roomCode }));
  await joinedMessage;

  const deniedSnapshotMessage = nextMessage(guest);
  guest.send(JSON.stringify({ type: 'snapshot', state: { score: 999 } }));
  assert.equal((await deniedSnapshotMessage).type, 'error');

  const fullRoomMessage = nextMessage(third);
  third.send(JSON.stringify({ type: 'room-join', roomCode: created.roomCode }));
  assert.match((await fullRoomMessage).message, /已滿/);
});

test('host disconnect closes the room and tells the guest why', async t => {
  const server = createGameServer({ port: 0 });
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = new WebSocket(url);
  await once(host, 'open');
  const guest = new WebSocket(url);
  await once(guest, 'open');

  t.after(async () => {
    for (const socket of [host, guest]) if (socket.readyState === WebSocket.OPEN) socket.close();
    await new Promise(resolve => server.close(resolve));
  });

  const createdMessage = nextMessage(host);
  host.send(JSON.stringify({ type: 'room-create' }));
  const created = await createdMessage;
  const joinedMessage = nextMessage(guest);
  guest.send(JSON.stringify({ type: 'room-join', roomCode: created.roomCode }));
  await joinedMessage;

  const guestClosed = once(guest, 'close');
  host.close();
  const [code, reason] = await guestClosed;
  assert.equal(code, 4000);
  assert.equal(reason.toString(), '房主已離線');

  const reconnect = new WebSocket(url);
  await once(reconnect, 'open');
  const missingRoomMessage = nextMessage(reconnect);
  reconnect.send(JSON.stringify({ type: 'room-join', roomCode: created.roomCode }));
  assert.match((await missingRoomMessage).message, /找不到/);
  reconnect.close();
});
