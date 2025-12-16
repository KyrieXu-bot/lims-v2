import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export const useSocket = (room) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [editingUsers, setEditingUsers] = useState(new Map());
  const socketRef = useRef(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || !user.token) return;

    // 获取Socket.IO服务器地址
    // 使用环境变量或根据环境选择
    let socketUrl = import.meta.env.VITE_SOCKET_URL;
    
    if (!socketUrl) {
      if (import.meta.env.DEV) {
        // 开发环境使用本地服务器
        socketUrl = 'http://localhost:3001';
      } else {
        // 生产环境使用 HTTPS 域名
        socketUrl = 'https://jicuijiance.mat-jitri.cn';
      }
    }
    
    // 创建Socket连接
    const newSocket = io(socketUrl, {
      auth: {
        token: user.token
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    // 连接成功
    newSocket.on('connect', () => {
      console.log('WebSocket连接成功');
      setIsConnected(true);
      
      // 加入指定房间
      if (room) {
        newSocket.emit('join-room', room);
      }
    });

    // 连接断开
    newSocket.on('disconnect', () => {
      console.log('WebSocket连接断开');
      setIsConnected(false);
    });

    // 接收在线用户列表
    newSocket.on('online-users', (users) => {
      setOnlineUsers(users);
    });

    // 接收数据更新
    newSocket.on('data-updated', (data) => {
      console.log('收到数据更新:', data);
      // 通过自定义事件通知组件
      window.dispatchEvent(new CustomEvent('realtime-data-update', { detail: data }));
    });

    // 接收用户编辑状态更新
    newSocket.on('user-editing-update', (data) => {
      setEditingUsers(prev => {
        const newMap = new Map(prev);
        if (data.isEditing) {
          newMap.set(`${data.field}-${data.testItemId}`, {
            userId: data.userId,
            userName: data.userName,
            field: data.field,
            testItemId: data.testItemId,
            timestamp: data.timestamp
          });
        } else {
          newMap.delete(`${data.field}-${data.testItemId}`);
        }
        return newMap;
      });
    });

    // 接收用户停止编辑状态更新
    newSocket.on('user-stop-editing-update', (data) => {
      setEditingUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(`${data.field}-${data.testItemId}`);
        return newMap;
      });
    });

    // 清理函数
    return () => {
      newSocket.close();
    };
  }, [room]);

  // 发送数据更新
  const emitDataUpdate = (field, value, testItemId) => {
    if (socket && isConnected) {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      socket.emit('data-update', {
        room,
        field,
        value,
        testItemId,
        userId: user.user_id,
        userName: user.name || user.username
      });
    }
  };

  // 发送用户编辑状态
  const emitUserEditing = (field, testItemId, isEditing) => {
    if (socket && isConnected) {
      socket.emit('user-editing', {
        room,
        field,
        testItemId,
        isEditing
      });
    }
  };

  // 发送用户停止编辑状态
  const emitUserStopEditing = (field, testItemId) => {
    if (socket && isConnected) {
      socket.emit('user-stop-editing', {
        room,
        field,
        testItemId
      });
    }
  };

  // 获取在线用户数量
  const getOnlineUserCount = () => {
    return onlineUsers.length;
  };

  // 检查是否有其他用户在编辑特定字段
  const isFieldBeingEdited = (field, testItemId) => {
    return editingUsers.has(`${field}-${testItemId}`);
  };

  // 获取编辑特定字段的用户信息
  const getEditingUser = (field, testItemId) => {
    return editingUsers.get(`${field}-${testItemId}`);
  };

  return {
    socket,
    isConnected,
    onlineUsers,
    editingUsers,
    emitDataUpdate,
    emitUserEditing,
    emitUserStopEditing,
    getOnlineUserCount,
    isFieldBeingEdited,
    getEditingUser
  };
};
