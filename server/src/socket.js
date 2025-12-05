import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 存储在线用户
const onlineUsers = new Map();
// 存储房间中的用户
const roomUsers = new Map();

let io; // 将io声明为模块级变量

// 导出获取io的函数
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

  // 身份验证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.user_id;
      socket.userName = decoded.name || decoded.username;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {

    // 用户加入在线列表
    onlineUsers.set(socket.userId, {
      id: socket.userId,
      name: socket.userName,
      role: socket.userRole,
      socketId: socket.id,
      lastSeen: new Date()
    });

    // 加入委托单登记表房间
    socket.join('commission-form');
    updateRoomUsers('commission-form');

    // 加入设备清单房间
    socket.join('equipment-list');
    updateRoomUsers('equipment-list');

    // 加入个人通知房间（用于接收个人通知）
    socket.join(`user-${socket.userId}`);

    // 处理数据更新事件
    socket.on('data-update', (data) => {
      const { room, field, value, testItemId, userId, userName } = data;
      
      // 广播给房间内的其他用户
      socket.to(room).emit('data-updated', {
        field,
        value,
        testItemId,
        userId,
        userName,
        timestamp: new Date()
      });

    });

    // 处理用户正在编辑事件
    socket.on('user-editing', (data) => {
      const { room, field, testItemId, isEditing } = data;
      
      socket.to(room).emit('user-editing-update', {
        field,
        testItemId,
        userId: socket.userId,
        userName: socket.userName,
        isEditing,
        timestamp: new Date()
      });
    });

    // 处理用户离开编辑事件
    socket.on('user-stop-editing', (data) => {
      const { room, field, testItemId } = data;
      
      socket.to(room).emit('user-stop-editing-update', {
        field,
        testItemId,
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date()
      });
    });

    // 处理获取在线用户请求
    socket.on('get-online-users', (room) => {
      const users = getRoomUsers(room);
      socket.emit('online-users', users);
    });

    // 处理断开连接
    socket.on('disconnect', () => {
      
      // 从在线用户列表中移除
      onlineUsers.delete(socket.userId);
      
      // 更新房间用户列表
      updateRoomUsers('commission-form');
      updateRoomUsers('equipment-list');
    });
  });

  return io;
}

// 更新房间用户列表
function updateRoomUsers(room) {
  const users = Array.from(onlineUsers.values()).filter(user => 
    user.socketId && io.sockets.sockets.get(user.socketId)?.rooms.has(room)
  );
  
  roomUsers.set(room, users);
  
  // 广播给房间内的所有用户
  io.to(room).emit('online-users', users);
}

// 获取房间用户列表
function getRoomUsers(room) {
  return roomUsers.get(room) || [];
}

// 获取在线用户数量
export function getOnlineUserCount() {
  return onlineUsers.size;
}

// 获取房间用户数量
export function getRoomUserCount(room) {
  return roomUsers.get(room)?.length || 0;
}
