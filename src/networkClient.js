const ROOM_MESSAGES = {
  create: { type: 'room-create', response: 'room-created', role: 'host' },
  join: { type: 'room-join', response: 'room-joined', role: 'guest' },
};

export function connectRoom({ url, action, roomCode, WebSocketImpl = globalThis.WebSocket }) {
  const roomAction = ROOM_MESSAGES[action];
  if (!roomAction) throw new TypeError(`Unsupported room action: ${action}`);
  if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket is not available in this environment.');

  const socket = new WebSocketImpl(url);
  const listeners = new Set();
  let role = null;
  let joined = false;
  let settled = false;

  const ready = new Promise((resolve, reject) => {
    const onOpen = () => socket.send(JSON.stringify({ type: roomAction.type, ...(action === 'join' ? { roomCode } : {}) }));
    const onMessage = event => {
      let message;
      try { message = JSON.parse(event.data.toString()); }
      catch { return; }

      if (message.type === 'error' && !settled) {
        settled = true;
        reject(new Error(message.message || 'Unable to join the room.'));
        return;
      }
      if (message.type === roomAction.response && !settled) {
        settled = true;
        joined = true;
        role = roomAction.role;
        resolve(message);
        return;
      }
      for (const listener of listeners) listener(message);
    };
    const onError = () => {
      if (!settled) { settled = true; reject(new Error('Unable to connect to the co-op server.')); }
    };
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('close', () => {
      joined = false;
      for (const listener of listeners) listener({ type: 'disconnected' });
    }, { once: true });
  });

  function send(type, payload, allowedRole) {
    if (!joined || role !== allowedRole || socket.readyState !== WebSocketImpl.OPEN) return false;
    socket.send(JSON.stringify({ type, [payload.name]: payload.value }));
    return true;
  }

  return {
    ready,
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    sendInput(input) { return send('input', { name: 'input', value: input }, 'guest'); },
    sendSnapshot(state) { return send('snapshot', { name: 'state', value: state }, 'host'); },
    close() { socket.close(); },
  };
}
