import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket.js';
import './NotificationIcon.css';

const NotificationIcon = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { socket } = useSocket(null);

  // 加载未读通知数量
  const loadUnreadCount = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const response = await fetch('/api/notifications/unread-count', {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count || 0);
      }
    } catch (error) {
      console.error('加载未读通知数量失败:', error);
    }
  };

  // 加载最近的通知
  const loadRecentNotifications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const response = await fetch('/api/notifications?page=1&pageSize=5', {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data || []);
      }
    } catch (error) {
      console.error('加载通知失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadUnreadCount();
    loadRecentNotifications();
  }, []);

  // 监听WebSocket通知
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (data) => {
      setUnreadCount(data.unread_count || 0);
      // 如果下拉框打开，刷新通知列表
      if (showDropdown) {
        loadRecentNotifications();
      } else {
        // 否则只更新未读数量
        loadUnreadCount();
      }
    };

    socket.on('new-notification', handleNewNotification);

    return () => {
      if (socket) {
        socket.off('new-notification', handleNewNotification);
      }
    };
  }, [socket, showDropdown]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      loadRecentNotifications();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // 标记为已读
  const markAsRead = async (notificationId) => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        // 更新本地状态
        setNotifications(prev => 
          prev.map(n => 
            n.notification_id === notificationId 
              ? { ...n, is_read: 1, read_at: new Date().toISOString() }
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  // 处理通知点击
  const handleNotificationClick = (notification) => {
    // 标记为已读
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }

    // 关闭下拉框
    setShowDropdown(false);

    // 根据通知类型跳转
    if (notification.related_order_id) {
      navigate('/commission-form', { 
        state: { 
          highlightOrderId: notification.related_order_id,
          highlightTestItemId: notification.related_test_item_id 
        } 
      });
    }
  };

  // 跳转到通知页面
  const handleViewAll = () => {
    setShowDropdown(false);
    navigate('/notifications');
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="notification-icon-container" ref={dropdownRef}>
      <button
        className="notification-icon-button"
        onClick={() => setShowDropdown(!showDropdown)}
        title="消息通知"
      >
        <span className="notification-icon">✉️</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h3>消息通知</h3>
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={async () => {
                  try {
                    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
                    if (!user || !user.token) return;

                    const response = await fetch('/api/notifications/read-all', {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${user.token}`
                      }
                    });

                    if (response.ok) {
                      setUnreadCount(0);
                      loadRecentNotifications();
                    }
                  } catch (error) {
                    console.error('全部标记已读失败:', error);
                  }
                }}
              >
                全部已读
              </button>
            )}
          </div>
          <div className="notification-list">
            {loading ? (
              <div className="notification-loading">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.notification_id}
                  className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-text">{notification.content}</div>
                    <div className="notification-time">{formatTime(notification.created_at)}</div>
                  </div>
                  {!notification.is_read && <div className="notification-dot"></div>}
                </div>
              ))
            )}
          </div>
          <div className="notification-dropdown-footer">
            <button className="view-all-btn" onClick={handleViewAll}>
              查看全部
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationIcon;

