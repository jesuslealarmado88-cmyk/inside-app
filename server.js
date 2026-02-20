const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const rooms = {};

function getRoom(code) {
  if (!rooms[code]) rooms[code] = { messages: [], users: {} };
  return rooms[code];
}

const server = http.createServer((req, res) => {
  const file = path.resolve(__dirname, 'public', 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function broadcast(room, data, exclude) {
  const str = JSON.stringify(data);
  Object.values(room.users).forEach(ws => {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(str);
  });
}

function broadcastAll(room, data) {
  const str = JSON.stringify(data);
  Object.values(room.users).forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(str);
  });
}

wss.on('connection', ws => {
  let name = null, code = null;

  ws.on('message', raw => {
    let d;
    try { d = JSON.parse(raw); } catch { return; }

    if (d.type === 'join') {
      name = d.name;
      code = d.room;
      const room = getRoom(code);
      room.users[name] = ws;
      ws.send(JSON.stringify({ type: 'history', messages: room.messages }));
      broadcastAll(room, { type: 'presence', online: Object.keys(room.users) });
    }

    else if (d.type === 'message' && code) {
      const room = getRoom(code);
      const msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        sender: name,
        text: d.text,
        ts: Date.now()
      };
      room.messages.push(msg);
      if (room.messages.length > 300) room.messages.shift();
      broadcastAll(room, { type: 'message', msg });
    }

    else if (d.type === 'typing' && code) {
      const room = getRoom(code);
      broadcast(room, { type: 'typing', name, active: d.active }, ws);
    }
  });

  ws.on('close', () => {
    if (!code || !name) return;
    const room = getRoom(code);
    delete room.users[name];
    broadcast(room, { type: 'presence', online: Object.keys(room.users) });
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log('Inside running on port ' + PORT);
});
