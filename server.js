import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 2;
const MAX_PAYLOAD = 16 * 1024;

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function createRoomCode(rooms) {
  let code;
  do { code = randomBytes(4).toString('hex').slice(0, ROOM_CODE_LENGTH).toUpperCase(); }
  while (rooms.has(code));
  return code;
}

export function createGameServer({ host = '127.0.0.1', port = 1234 } = {}) {
  const rooms = new Map();
  const server = new WebSocketServer({ host, port, maxPayload: MAX_PAYLOAD });

  server.on('connection', socket => {
    socket.playerId = randomUUID();
    socket.roomCode = null;

    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); }
      catch { send(socket, { type: 'error', message: '訊息格式錯誤。' }); return; }

      if (!message || typeof message.type !== 'string') {
        send(socket, { type: 'error', message: '缺少訊息類型。' }); return;
      }

      if (message.type === 'room-create') {
        if (socket.roomCode) { send(socket, { type: 'error', message: '已在房間中。' }); return; }
        const code = createRoomCode(rooms);
        rooms.set(code, { code, host: socket, guest: null });
        socket.roomCode = code;
        socket.role = 'host';
        send(socket, { type: 'room-created', roomCode: code, playerId: socket.playerId });
        return;
      }

      if (message.type === 'room-join') {
        const code = typeof message.roomCode === 'string' ? message.roomCode.trim().toUpperCase() : '';
        if (!/^[A-F0-9]{6}$/.test(code)) { send(socket, { type: 'error', message: '房間代碼格式錯誤。' }); return; }
        const room = rooms.get(code);
        if (!room) { send(socket, { type: 'error', message: '找不到這個房間。' }); return; }
        if (room.guest || socket.roomCode) { send(socket, { type: 'error', message: '房間已滿或你已在房間中。' }); return; }
        room.guest = socket;
        socket.roomCode = code;
        socket.role = 'guest';
        send(socket, { type: 'room-joined', roomCode: code, playerId: socket.playerId, role: 'guest' });
        send(room.host, { type: 'peer-joined', playerId: socket.playerId });
        return;
      }

      const room = rooms.get(socket.roomCode);
      if (!room) { send(socket, { type: 'error', message: '請先建立或加入房間。' }); return; }

      if (message.type === 'input' && socket.role === 'guest') {
        send(room.host, { type: 'input', playerId: socket.playerId, input: message.input });
      } else if (message.type === 'start' && socket.role === 'host') {
        send(room.guest, { type: 'start' });
      } else if (message.type === 'snapshot' && socket.role === 'host') {
        send(room.guest, { type: 'snapshot', state: message.state });
      } else {
        send(socket, { type: 'error', message: '此角色不能傳送這種類型的訊息。' });
      }
    });

    socket.on('close', () => {
      const room = rooms.get(socket.roomCode);
      if (!room) return;
      if (socket.role === 'host') {
        rooms.delete(room.code);
        if (room.guest?.readyState === WebSocket.OPEN) room.guest.close(4000, '房主已離線');
      } else if (room.guest === socket) {
        room.guest = null;
        send(room.host, { type: 'peer-left', playerId: socket.playerId });
      }
    });
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 1234);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = createGameServer({ host, port });
  server.on('listening', () => console.log(`合作原型服務已啟動：ws://${host}:${port}`));
}
