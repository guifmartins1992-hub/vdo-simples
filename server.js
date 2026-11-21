const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || "*" } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), b => alphabet[b % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}
function publicMembers(room) {
  return [...room.members.values()].map(({ id, name, isHost }) => ({ id, name, isHost }));
}
function leaveRoom(socket, reason = "left") {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;

  if (room.hostId === socket.id) {
    io.to(code).emit("room:closed", { reason: "host-left" });
    for (const id of room.members.keys()) {
      const memberSocket = io.sockets.sockets.get(id);
      if (memberSocket) {
        memberSocket.leave(code);
        memberSocket.data.roomCode = null;
      }
    }
    rooms.delete(code);
    return;
  }

  room.members.delete(socket.id);
  if (room.activeScreen === socket.id) room.activeScreen = null;
  socket.leave(code);
  socket.to(code).emit("peer:left", { peerId: socket.id });
  io.to(code).emit("room:members", { members: publicMembers(room) });
  if (room.activeScreen === null) io.to(code).emit("screen:stopped", { peerId: socket.id });
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, ack = () => {}) => {
    if (socket.data.roomCode) leaveRoom(socket);
    const code = makeCode();
    const member = { id: socket.id, name: String(name || "Anfitrião").slice(0, 32), isHost: true };
    const room = { hostId: socket.id, members: new Map([[socket.id, member]]), activeScreen: null };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, code, selfId: socket.id, members: publicMembers(room), isHost: true });
  });

  socket.on("room:join", ({ code, name } = {}, ack = () => {}) => {
    const normalized = String(code || "").trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return ack({ ok: false, error: "Sala não encontrada ou já encerrada." });
    if (socket.data.roomCode) leaveRoom(socket);
    const member = { id: socket.id, name: String(name || "Participante").slice(0, 32), isHost: false };
    const existing = publicMembers(room);
    room.members.set(socket.id, member);
    socket.join(normalized);
    socket.data.roomCode = normalized;
    ack({ ok: true, code: normalized, selfId: socket.id, members: publicMembers(room), existing, isHost: false, activeScreen: room.activeScreen });
    socket.to(normalized).emit("room:members", { members: publicMembers(room) });
  });

  socket.on("peer:refresh", () => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (room && room.members.has(socket.id)) socket.to(code).emit("peer:refresh", { from: socket.id });
  });

  socket.on("signal", ({ to, description, candidate } = {}) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room || !room.members.has(socket.id) || !room.members.has(to)) return;
    io.to(to).emit("signal", { from: socket.id, description, candidate });
  });

  socket.on("screen:request", (_payload, ack = () => {}) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: "Sala inválida." });
    if (room.activeScreen && room.activeScreen !== socket.id) return ack({ ok: false, error: "Outra pessoa já está transmitindo." });
    room.activeScreen = socket.id;
    io.to(code).emit("screen:started", { peerId: socket.id });
    ack({ ok: true });
  });

  socket.on("screen:stop", () => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (room && room.activeScreen === socket.id) {
      room.activeScreen = null;
      io.to(code).emit("screen:stopped", { peerId: socket.id });
    }
  });

  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket, "disconnect"));
});

server.listen(PORT, () => console.log(`Vdo Simples rodando na porta ${PORT}`));