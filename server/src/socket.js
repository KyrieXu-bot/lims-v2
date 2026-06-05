import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const onlineUsers = new Map();
const roomUsers = new Map();

let io;

export function getIO() {
  return io;
}

export function setupSocket(server) {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.user_id;
      socket.userName = decoded.name || decoded.username;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    onlineUsers.set(socket.userId, {
      id: socket.userId,
      name: socket.userName,
      role: socket.userRole,
      socketId: socket.id,
      lastSeen: new Date()
    });

    joinTrackedRoom(socket, 'commission-form');
    joinTrackedRoom(socket, 'equipment-list');
    joinTrackedRoom(socket, 'equipment-booking');
    socket.join(`user-${socket.userId}`);

    socket.on('join-room', (room) => {
      if (typeof room !== 'string' || !room.trim()) return;
      joinTrackedRoom(socket, room.trim());
    });

    socket.on('leave-room', (room) => {
      if (typeof room !== 'string' || !room.trim()) return;
      socket.leave(room.trim());
      updateRoomUsers(room.trim());
    });

    socket.on('data-update', (data) => {
      const { room, field, value, testItemId, userId, userName } = data || {};
      if (!room) return;
      socket.to(room).emit('data-updated', {
        field,
        value,
        testItemId,
        userId,
        userName,
        timestamp: new Date()
      });
    });

    socket.on('user-editing', (data) => {
      const { room, field, testItemId, isEditing } = data || {};
      if (!room) return;
      socket.to(room).emit('user-editing-update', {
        field,
        testItemId,
        userId: socket.userId,
        userName: socket.userName,
        isEditing,
        timestamp: new Date()
      });
    });

    socket.on('user-stop-editing', (data) => {
      const { room, field, testItemId } = data || {};
      if (!room) return;
      socket.to(room).emit('user-stop-editing-update', {
        field,
        testItemId,
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date()
      });
    });

    socket.on('get-online-users', (room) => {
      socket.emit('online-users', getRoomUsers(room));
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.userId);
      for (const room of socket.rooms || []) {
        updateRoomUsers(room);
      }
      updateRoomUsers('commission-form');
      updateRoomUsers('equipment-list');
      updateRoomUsers('equipment-booking');
    });
  });

  return io;
}

function joinTrackedRoom(socket, room) {
  socket.join(room);
  updateRoomUsers(room);
}

function updateRoomUsers(room) {
  if (!io || !room) return;
  const users = Array.from(onlineUsers.values()).filter((user) =>
    user.socketId && io.sockets.sockets.get(user.socketId)?.rooms.has(room)
  );

  roomUsers.set(room, users);
  io.to(room).emit('online-users', users);
}

function getRoomUsers(room) {
  return roomUsers.get(room) || [];
}

export function getOnlineUserCount() {
  return onlineUsers.size;
}

export function getRoomUserCount(room) {
  return roomUsers.get(room)?.length || 0;
}
