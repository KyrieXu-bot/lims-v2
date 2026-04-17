import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket.js';
import AddonRequestModal from '../../components/AddonRequestModal.jsx';
import OrderTransferRequestDetailModal from '../../components/OrderTransferRequestDetailModal.jsx';
import { requestNotificationPermission, showLocalNotification, checkNotificationPermission } from '../../utils/notificationService.js';
import './MobileNotifications.css';

// 获取API基础URL（与api.js中的逻辑一致）
function getApiBase() {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  const isNative = typeof window !== 'undefined' 
    && window.Capacitor 
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();
  
  if (isNative) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  if (typeof window !== 'undefined' && window.location && window.location.host === 'localhost' && window.Capacitor) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  if (typeof window !== 'undefined' && window.location && !window.Capacitor) {
    return '';
  }
  
  return 'http://192.168.9.46:3004';
}

const MobileNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [typeFilter, setTypeFilter] = useState('all');
  const navigate = useNavigate();
  const { socket } = useSocket(null);
  const [showAddonRequestModal, setShowAddonRequestModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [showOrderTransferModal, setShowOrderTransferModal] = useState(false);
  const [selectedOrderTransferRequestId, setSelectedOrderTransferRequestId] = useState(null);

  // 加载通知列表
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        navigate('/mobile/login');
        return;
      }

      // 使用api.js中的getApiBase逻辑，确保在Capacitor中使用完整URL
      const apiBase = getApiBase();
      let url = `${apiBase}/api/notifications?page=1&pageSize=50`;
      if (filter === 'unread') {
        url += '&is_read=0';
      } else if (filter === 'read') {
        url += '&is_read=1';
      }
      if (typeFilter !== 'all') {
        url += `&type=${typeFilter}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data || []);
      } else if (response.status === 401) {
        navigate('/mobile/login');
      }
    } catch (error) {
      console.error('加载通知失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始化通知权限
  useEffect(() => {
    const initNotifications = async () => {
      const hasPermission = await checkNotificationPermission();
      if (!hasPermission) {
        // 首次加载时请求权限
        await requestNotificationPermission();
      }
    };
    initNotifications();
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [filter, typeFilter]);

  // 监听WebSocket新通知
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = async (notificationData) => {
      // 显示本地推送通知
      if (notificationData) {
        await showLocalNotification({
          title: notificationData.title || '新通知',
          body: notificationData.content || '您有一条新消息',
          id: notificationData.notification_id
        });
      } else {
        // 如果没有详细数据，只显示通用通知
        await showLocalNotification({
          title: '新通知',
          body: '您有一条新消息',
        });
      }

      // 刷新通知列表
      if (filter === 'all' || filter === 'unread') {
        loadNotifications();
      }
    };

    socket.on('new-notification', handleNewNotification);

    return () => {
      if (socket) {
        socket.off('new-notification', handleNewNotification);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, filter]);

  // 标记为已读
  const markAsRead = async (notificationId) => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        setNotifications(prev =>
          prev.map(n =>
            n.notification_id === notificationId
              ? { ...n, is_read: 1, read_at: new Date().toISOString() }
              : n
          )
        );
      }
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  // 全部标记为已读
  const markAllAsRead = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        loadNotifications();
      }
    } catch (error) {
      console.error('全部标记已读失败:', error);
    }
  };

  const getOrderTransferRequestId = (notification) => {
    if (notification.related_order_transfer_request_id) {
      return notification.related_order_transfer_request_id;
    }
    if (notification.content) {
      const match = notification.content.match(/申请ID：(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  };

  const openOrderTransferDetail = (notification) => {
    const rid = getOrderTransferRequestId(notification);
    if (!rid) {
      alert('无法获取转单申请ID');
      return;
    }
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }
    setSelectedOrderTransferRequestId(rid);
    setShowOrderTransferModal(true);
  };

  // 处理通知点击（移动端逻辑：统一跳转到委托单页面并搜索）
  const handleNotificationClick = async (notification) => {
    if (notification.type === 'order_transfer_request') {
      openOrderTransferDetail(notification);
      return;
    }
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }

    // 如果是加测申请，打开申请详情
    if (notification.type === 'addon_request') {
      handleViewRequest(notification);
      return;
    }

    // 统一处理：如果有关联的委托单，跳转到委托单页面并自动搜索
    // 使用 order_id_display（委托单号）进行搜索，和网页端保持一致
    // 在Android环境中，使用URL参数和sessionStorage双重保障，确保搜索关键词不会丢失
    if (notification.related_order_id || notification.order_id_display) {
      const orderIdToSearch = notification.order_id_display || notification.related_order_id;
      
      // 保存到sessionStorage（在Android环境中更可靠）
      sessionStorage.setItem('mobile_commission_notification_search', orderIdToSearch);
      
      // 使用URL参数传递搜索关键词（在Android环境中更可靠）
      navigate(`/mobile/commission-form?q=${encodeURIComponent(orderIdToSearch)}`, {
        state: {
          searchQuery: orderIdToSearch, // 同时传递state作为备用
          highlightOrderId: notification.related_order_id,
          highlightTestItemId: notification.related_test_item_id
        }
      });
    }
  };

  const handleViewRequest = (notification) => {
    let requestId = notification.related_addon_request_id || notification.addon_request_id;
    
    if (!requestId && notification.content) {
      const match = notification.content.match(/申请ID：(\d+)/);
      if (match) {
        requestId = parseInt(match[1]);
      }
    }
    
    if (requestId) {
      setSelectedRequestId(requestId);
      setShowAddonRequestModal(true);
    } else {
      alert('无法获取申请ID，请刷新页面重试');
    }
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

  const getTypeLabel = (type) => {
    const typeMap = {
      'raw_data_upload': '原始数据上传',
      'addon_request': '加测申请',
      'order_transfer_request': '转单申请',
      'system': '系统通知',
      'other': '其他'
    };
    return typeMap[type] || type;
  };

  const getTypeIcon = (type) => {
    const iconMap = {
      'raw_data_upload': '📄',
      'addon_request': '➕',
      'order_transfer_request': '🔀',
      'system': '🔔',
      'other': '📌'
    };
    return iconMap[type] || '📌';
  };

  return (
    <div className="mobile-notifications">
      {/* 筛选栏 */}
      <div className="mobile-notifications-filters">
        <div className="mobile-filter-group">
          <button
            className={`mobile-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
          <button
            className={`mobile-filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            未读
          </button>
          <button
            className={`mobile-filter-btn ${filter === 'read' ? 'active' : ''}`}
            onClick={() => setFilter('read')}
          >
            已读
          </button>
        </div>
        <div className="mobile-filter-group">
          <button
            className={`mobile-filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            全部类型
          </button>
          <button
            className={`mobile-filter-btn ${typeFilter === 'raw_data_upload' ? 'active' : ''}`}
            onClick={() => setTypeFilter('raw_data_upload')}
          >
            原始数据
          </button>
          <button
            className={`mobile-filter-btn ${typeFilter === 'addon_request' ? 'active' : ''}`}
            onClick={() => setTypeFilter('addon_request')}
          >
            加测申请
          </button>
          <button
            className={`mobile-filter-btn ${typeFilter === 'order_transfer_request' ? 'active' : ''}`}
            onClick={() => setTypeFilter('order_transfer_request')}
          >
            转单申请
          </button>
        </div>
        <button className="mobile-mark-all-read-btn" onClick={markAllAsRead}>
          全部已读
        </button>
      </div>

      {/* 提示说明 */}
      {!loading && notifications.length > 0 && (
        <div className="mobile-notifications-tip">
          <span className="mobile-tip-icon">💡</span>
          <span className="mobile-tip-text">点击通知卡片可跳转到委托单详情</span>
        </div>
      )}

      {/* 通知列表 */}
      {loading ? (
        <div className="mobile-loading">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="mobile-empty">暂无通知</div>
      ) : (
        <div className="mobile-notifications-list">
          {notifications.map(notification => (
            <div
              key={notification.notification_id}
              className={`mobile-notification-card ${!notification.is_read ? 'unread' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="mobile-notification-icon">
                {getTypeIcon(notification.type)}
              </div>
              <div className="mobile-notification-content">
                <div className="mobile-notification-header">
                  <div className="mobile-notification-title">
                    {!notification.is_read && <span className="mobile-notification-dot"></span>}
                    <span>{notification.title}</span>
                    <span className="mobile-notification-type">{getTypeLabel(notification.type)}</span>
                  </div>
                  {/* 点击提示 - 仅在非加测申请类型显示 */}
                  {notification.type !== 'addon_request' &&
                    notification.type !== 'order_transfer_request' &&
                    (notification.related_order_id || notification.order_id_display) && (
                    <div className="mobile-notification-hint">
                      <span className="mobile-hint-text">点击查看</span>
                      <span className="mobile-hint-arrow">→</span>
                    </div>
                  )}
                </div>
                <div className="mobile-notification-body">
                  <p>{notification.content}</p>
                  {notification.order_id_display && (
                    <div className="mobile-notification-meta">
                      委托单: {notification.order_id_display}
                    </div>
                  )}
                  <div className="mobile-notification-time">{formatTime(notification.created_at)}</div>
                </div>
                {notification.type === 'addon_request' && (
                  <div className="mobile-notification-action">
                    <button
                      className="mobile-view-request-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewRequest(notification);
                      }}
                    >
                      查看申请
                    </button>
                  </div>
                )}
                {notification.type === 'order_transfer_request' && (
                  <div className="mobile-notification-action">
                    <button
                      className="mobile-view-request-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openOrderTransferDetail(notification);
                      }}
                    >
                      查看详情
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 加测申请模态框 */}
      {showAddonRequestModal && selectedRequestId && (
        <AddonRequestModal
          requestId={selectedRequestId}
          onClose={() => {
            setShowAddonRequestModal(false);
            setSelectedRequestId(null);
          }}
          onApprove={() => {
            loadNotifications();
          }}
        />
      )}

      {showOrderTransferModal && selectedOrderTransferRequestId != null && (
        <OrderTransferRequestDetailModal
          requestId={selectedOrderTransferRequestId}
          apiBase={getApiBase()}
          onClose={() => {
            setShowOrderTransferModal(false);
            setSelectedOrderTransferRequestId(null);
          }}
        />
      )}
    </div>
  );
};

export default MobileNotifications;







