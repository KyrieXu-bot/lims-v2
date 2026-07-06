import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket.js';
import AddonRequestModal from './AddonRequestModal.jsx';
import OrderTransferRequestDetailModal from './OrderTransferRequestDetailModal.jsx';
import './NotificationIcon.css';

const NotificationIcon = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAddonRequestId, setSelectedAddonRequestId] = useState(null);
  const [selectedOrderTransferRequestId, setSelectedOrderTransferRequestId] = useState(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { socket } = useSocket(null);
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('lims_user') || 'null');
    } catch {
      return null;
    }
  })();

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

  const deleteNotification = async (notificationId) => {
    if (!window.confirm('确定要删除这条通知吗？')) return;
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user?.token) return;
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }
      const deleted = notifications.find(n => n.notification_id === notificationId);
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      alert(error.message || '删除失败');
    }
  };

  const getRequestId = (notification, fieldNames) => {
    for (const field of fieldNames) {
      if (notification[field]) return notification[field];
    }
    const match = notification.content?.match(/申请ID[：:]\s*(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const handleViewDetail = (notification) => {
    if (!notification.is_read) markAsRead(notification.notification_id);
    if (notification.type === 'addon_request') {
      const requestId = getRequestId(notification, ['related_addon_request_id', 'addon_request_id']);
      if (!requestId) return alert('无法获取加测申请ID，请刷新后重试');
      setSelectedAddonRequestId(requestId);
      setShowDropdown(false);
      return;
    }
    if (notification.type === 'order_transfer_request') {
      const requestId = getRequestId(notification, ['related_order_transfer_request_id']);
      if (!requestId) return alert('无法获取转单申请ID，请刷新后重试');
      setSelectedOrderTransferRequestId(requestId);
      setShowDropdown(false);
      return;
    }
    handleNotificationClick(notification);
  };

  const hasDetailAction = (notification) =>
    notification.type === 'addon_request' ||
    notification.type === 'order_transfer_request' ||
    Boolean(notification.related_order_id);

  const canReviewOrderTransfer = (notification) => {
    if (notification.type !== 'order_transfer_request' || notification.order_transfer_request_status !== 'pending') {
      return false;
    }
    const step = notification.order_transfer_current_step;
    return currentUser?.role === 'admin' ||
      (step === 'leader_review' && currentUser?.role === 'leader') ||
      (step === 'supervisor_review' && currentUser?.user_id === notification.order_transfer_supervisor_id) ||
      (step === 'sales_review' && currentUser?.role === 'sales') ||
      (step === 'xwf_review' && currentUser?.user_id === 'JC0092');
  };

  const reviewOrderTransfer = async (notification, action) => {
    if (action === 'reject' && !window.confirm('确定不同意该转单申请吗？')) return;
    const requestId = getRequestId(notification, ['related_order_transfer_request_id']);
    if (!requestId) return alert('无法获取转单申请ID，请刷新后重试');
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user?.token) return;
      const response = await fetch(`/api/order-transfer-requests/${requestId}/${action}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '操作失败');
      alert(data.message || (action === 'approve' ? '已同意转单' : '已拒绝转单'));
      await Promise.all([loadRecentNotifications(), loadUnreadCount()]);
    } catch (error) {
      alert(error.message || '操作失败');
    }
  };

  const canReviewCancellation = (notification) =>
    (notification.type === 'cancel_request' || notification.type === 'delete_request') &&
    notification.cancellation_request_status === 'pending' &&
    (currentUser?.role === 'sales' || currentUser?.role === 'admin');

  const reviewCancellation = async (notification, action) => {
    if (action === 'reject' && !window.confirm('确定要驳回此申请吗？')) return;
    const requestId = getRequestId(notification, ['related_cancellation_request_id']);
    if (!requestId) return alert('无法获取申请ID，请刷新后重试');
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user?.token) return;
      const response = await fetch(`/api/cancellation-requests/${requestId}/${action}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '操作失败');
      alert(data.message || (action === 'approve' ? '申请已通过' : '申请已驳回'));
      await Promise.all([loadRecentNotifications(), loadUnreadCount()]);
    } catch (error) {
      alert(error.message || '操作失败');
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
                    <div className="notification-item-header">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-quick-actions" onClick={(e) => e.stopPropagation()}>
                        {hasDetailAction(notification) && (
                          <button onClick={() => handleViewDetail(notification)}>详情</button>
                        )}
                        {canReviewOrderTransfer(notification) && (
                          <>
                            <button className="approve" onClick={() => reviewOrderTransfer(notification, 'approve')}>通过</button>
                            <button className="danger" onClick={() => reviewOrderTransfer(notification, 'reject')}>驳回</button>
                          </>
                        )}
                        {canReviewCancellation(notification) && (
                          <>
                            <button className="approve" onClick={() => reviewCancellation(notification, 'approve')}>通过</button>
                            <button className="danger" onClick={() => reviewCancellation(notification, 'reject')}>驳回</button>
                          </>
                        )}
                        {!notification.is_read && (
                          <button onClick={() => markAsRead(notification.notification_id)}>已读</button>
                        )}
                        <button className="danger" onClick={() => deleteNotification(notification.notification_id)}>删除</button>
                      </div>
                    </div>
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
      {selectedAddonRequestId && (
        <AddonRequestModal
          requestId={selectedAddonRequestId}
          onClose={() => setSelectedAddonRequestId(null)}
          onApprove={() => {
            setSelectedAddonRequestId(null);
            loadRecentNotifications();
            loadUnreadCount();
          }}
          onReject={() => {
            setSelectedAddonRequestId(null);
            loadRecentNotifications();
            loadUnreadCount();
          }}
        />
      )}
      {selectedOrderTransferRequestId && (
        <OrderTransferRequestDetailModal
          requestId={selectedOrderTransferRequestId}
          onClose={() => setSelectedOrderTransferRequestId(null)}
        />
      )}
    </div>
  );
};

export default NotificationIcon;
