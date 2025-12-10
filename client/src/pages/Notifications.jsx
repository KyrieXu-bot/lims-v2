import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket.js';
import AddonRequestModal from '../components/AddonRequestModal.jsx';
import './Notifications.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [typeFilter, setTypeFilter] = useState('all'); // all, raw_data_upload, system, other
  const pageSize = 20;
  const navigate = useNavigate();
  const { socket } = useSocket(null);
  const [showAddonRequestModal, setShowAddonRequestModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  // 加载通知列表
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        navigate('/login');
        return;
      }

      let url = `/api/notifications?page=${page}&pageSize=${pageSize}`;
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
        setTotal(data.total || 0);
      } else if (response.status === 401) {
        navigate('/login');
      }
    } catch (error) {
      console.error('加载通知失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [page, filter, typeFilter]);

  // 监听WebSocket新通知
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = () => {
      // 如果当前显示未读或全部，刷新列表
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
  }, [socket, filter]);

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

      const response = await fetch('/api/notifications/read-all', {
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

  // 删除通知
  const deleteNotification = async (notificationId) => {
    if (!window.confirm('确定要删除这条通知吗？')) return;

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
        setTotal(prev => prev - 1);
      }
    } catch (error) {
      console.error('删除通知失败:', error);
    }
  };

  // 处理通知点击
  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }

    if (notification.related_order_id) {
      navigate('/commission-form', {
        state: {
          highlightOrderId: notification.related_order_id,
          highlightTestItemId: notification.related_test_item_id
        }
      });
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeLabel = (type) => {
    const typeMap = {
      'raw_data_upload': '原始数据上传',
      'addon_request': '加测申请',
      'system': '系统通知',
      'other': '其他'
    };
    return typeMap[type] || type;
  };

  const handleViewRequest = (notification) => {
    // 从通知中获取申请ID，优先使用 related_addon_request_id
    let requestId = notification.related_addon_request_id || notification.addon_request_id;
    
    // 如果数据库查询没有返回，尝试从content中解析
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

  // 获取申请状态显示文本
  const getRequestStatusText = (status) => {
    if (!status) return null;
    const statusMap = {
      'pending': { text: '待处理', className: 'status-pending' },
      'approved': { text: '已通过', className: 'status-approved' },
      'cancelled': { text: '已取消', className: 'status-cancelled' }
    };
    return statusMap[status] || null;
  };

  const handleRequestApproved = () => {
    // 刷新通知列表
    loadNotifications();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>消息通知</h1>
        <div className="notifications-actions">
          <button className="btn btn-primary" onClick={markAllAsRead}>
            全部标记为已读
          </button>
        </div>
      </div>

      <div className="notifications-filters">
        <div className="filter-group">
          <label>状态筛选：</label>
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => {
              setFilter('all');
              setPage(1);
            }}
          >
            全部
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => {
              setFilter('unread');
              setPage(1);
            }}
          >
            未读
          </button>
          <button
            className={`filter-btn ${filter === 'read' ? 'active' : ''}`}
            onClick={() => {
              setFilter('read');
              setPage(1);
            }}
          >
            已读
          </button>
        </div>

        <div className="filter-group">
          <label>类型筛选：</label>
          <button
            className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('all');
              setPage(1);
            }}
          >
            全部
          </button>
          <button
            className={`filter-btn ${typeFilter === 'raw_data_upload' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('raw_data_upload');
              setPage(1);
            }}
          >
            原始数据上传
          </button>
          <button
            className={`filter-btn ${typeFilter === 'addon_request' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('addon_request');
              setPage(1);
            }}
          >
            加测申请
          </button>
          <button
            className={`filter-btn ${typeFilter === 'system' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('system');
              setPage(1);
            }}
          >
            系统通知
          </button>
        </div>
      </div>

      {loading ? (
        <div className="notifications-loading">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="notifications-empty">暂无通知</div>
      ) : (
        <>
          <div className="notifications-list">
            {notifications.map(notification => (
              <div
                key={notification.notification_id}
                className={`notification-card ${!notification.is_read ? 'unread' : ''}`}
              >
                <div
                  className="notification-card-content"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-card-header">
                    <div className="notification-card-title">
                      {!notification.is_read && <span className="notification-dot"></span>}
                      <span>{notification.title}</span>
                      <span className="notification-type-badge">{getTypeLabel(notification.type)}</span>
                      {notification.type === 'addon_request' && notification.addon_request_status && (
                        <span className={`request-status-badge ${getRequestStatusText(notification.addon_request_status)?.className || ''}`}>
                          {getRequestStatusText(notification.addon_request_status)?.text || notification.addon_request_status}
                        </span>
                      )}
                    </div>
                    <div className="notification-card-actions">
                      {notification.type === 'addon_request' && notification.addon_request_status !== 'approved' && (
                        <button
                          className="btn-view-request"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewRequest(notification);
                          }}
                        >
                          查看申请
                        </button>
                      )}
                      {notification.type === 'addon_request' && notification.addon_request_status === 'approved' && (
                        <button
                          className="btn-view-request"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewRequest(notification);
                          }}
                        >
                          查看详情
                        </button>
                      )}
                      {!notification.is_read && (
                        <button
                          className="btn-mark-read"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.notification_id);
                          }}
                        >
                          标记已读
                        </button>
                      )}
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.notification_id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="notification-card-body">
                    <p>{notification.content}</p>
                    {notification.order_id_display && (
                      <div className="notification-meta">
                        <span>委托单号: {notification.order_id_display}</span>
                      </div>
                    )}
                    <div className="notification-time">{formatTime(notification.created_at)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="notifications-pagination">
              <button
                className="btn btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span className="pagination-info">
                第 {page} 页，共 {totalPages} 页（共 {total} 条）
              </span>
              <button
                className="btn btn-secondary"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {showAddonRequestModal && selectedRequestId && (
        <AddonRequestModal
          requestId={selectedRequestId}
          onClose={() => {
            setShowAddonRequestModal(false);
            setSelectedRequestId(null);
          }}
          onApprove={handleRequestApproved}
        />
      )}
    </div>
  );
};

export default Notifications;

