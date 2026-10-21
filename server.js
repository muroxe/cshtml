const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const players = {};
let roundTime = 120;
let tWins = 0;
let ctWins = 0;

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    const team = (data && data.team === 'CT') ? 'CT' : 'T';
    players[socket.id] = {
      id: socket.id,
      nick: (data && data.nick) ? String(data.nick).slice(0, 16) : 'Player',
      team,
      map: (data && data.map) || 'dust2_mini',
      x: 0,
      y: 1.7,
      z: team === 'T' ? 24 : -24,
      yaw: 0,
      hp: 100
    };
  });

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p) return;
    p.x = Number(data.x) || 0;
    p.y = Number(data.y) || 1.7;
    p.z = Number(data.z) || 0;
    p.yaw = Number(data.yaw) || 0;
  });

  socket.on('shootTracer', (tracerData) => {
    socket.broadcast.emit('remoteTracer', tracerData);
  });

  socket.on('playerHit', ({ targetId, damage }) => {
    const attacker = players[socket.id];
    const victim = players[targetId];
    if (!attacker || !victim) return;
    if (attacker.team === victim.team) return; // Запрет урона по своим

    const cleanDmg = Math.max(1, Math.min(120, Number(damage) || 25));
    victim.hp -= cleanDmg;

    if (victim.hp <= 0) {
      io.to(targetId).emit('damaged', { hp: 0, attackerNick: attacker.nick });
      io.to(socket.id).emit('killConfirmed', { victimNick: victim.nick });
      victim.hp = 100;
    } else {
      io.to(targetId).emit('damaged', { hp: victim.hp, attackerNick: attacker.nick });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// Таймер раунда на сервере
setInterval(() => {
  roundTime--;
  if (roundTime <= 0) {
    roundTime = 120;
    ctWins++;
    Object.values(players).forEach(p => { p.hp = 100; });
    io.emit('roundEnded', { winner: 'CT' });
  }
}, 1000);

// Рассылка состояния 20 раз в секунду
setInterval(() => {
  io.emit('stateUpdate', {
    players,
    roundTime,
    tWins,
    ctWins
  });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CS2 Mobile Full Server running on port ${PORT}`);
});
