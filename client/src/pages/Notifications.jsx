import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket.js';
import AddonRequestModal from '../components/AddonRequestModal.jsx';
import OrderTransferRequestDetailModal from '../components/OrderTransferRequestDetailModal.jsx';
import './Notifications.css';

// 获取API基础URL（与api.js中的逻辑一致）
// 注意：必须在函数内部调用，不能在模块顶层，因为window.Capacitor可能还未初始化
function getApiBase() {
  // 1. 优先使用环境变量
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. 检查是否是原生环境（运行时检查）
  // 在Capacitor中，window.location.host是localhost，所以需要检测Capacitor对象
  const isNative = typeof window !== 'undefined' 
    && window.Capacitor 
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();
  
  if (isNative) {
    console.log('检测到原生环境，使用生产域名');
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 3. 开发环境
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  // 4. 生产环境Web：使用相对路径
  // 注意：在Capacitor中window.location.host是localhost，所以上面的检测应该已经处理了
  if (typeof window !== 'undefined' && window.location) {
    // 额外检查：如果host是localhost但存在Capacitor，说明是Capacitor环境但检测失败
    if (window.location.host === 'localhost' && window.Capacitor) {
      console.log('检测到Capacitor但isNativePlatform失败，使用生产域名');
      return 'https://jicuijiance.mat-jitri.cn';
    }
    // 普通Web环境使用相对路径
    return '';
  }
  
  // 5. 兜底
  return 'http://192.168.9.46:3004';
}

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
  const [showOrderTransferModal, setShowOrderTransferModal] = useState(false);
  const [selectedOrderTransferRequestId, setSelectedOrderTransferRequestId] = useState(null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lims_user') || 'null');
    } catch {
      return null;
    }
  });

  // 加载通知列表
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        navigate('/login');
        return;
      }

      // 每次调用时动态获取API_BASE，确保Capacitor已初始化
      const apiBase = getApiBase();
      let url = `${apiBase}/api/notifications?page=${page}&pageSize=${pageSize}`;
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

  // 删除通知
  const deleteNotification = async (notificationId) => {
    if (!window.confirm('确定要删除这条通知吗？')) return;

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) return;

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/notifications/${notificationId}`, {
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
      alert('无法获取转单申请ID，请刷新页面重试');
      return;
    }
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }
    setSelectedOrderTransferRequestId(rid);
    setShowOrderTransferModal(true);
  };

  // 处理通知点击
  const handleNotificationClick = (notification) => {
    if (notification.type === 'order_transfer_request') {
      openOrderTransferDetail(notification);
      return;
    }
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
      'cancel_request': '取消申请',
      'delete_request': '删除申请',
      'order_transfer_request': '转单申请',
      'system': '系统通知',
      'other': '其他'
    };
    return typeMap[type] || type;
  };

  // 获取检测项目显示名（category_name + detail_name）
  const getTestItemDisplayName = (notification) => {
    if (notification.type === 'addon_request' && (notification.addon_category_name || notification.addon_detail_name)) {
      return [notification.addon_category_name, notification.addon_detail_name].filter(Boolean).join(' - ');
    }
    if (notification.test_item_category_name != null || notification.test_item_detail_name != null) {
      return [notification.test_item_category_name, notification.test_item_detail_name].filter(Boolean).join(' - ');
    }
    return notification.test_item_display_name || null;
  };

  // 获取检测ID（优先 related_test_item_id，其次 test_item_display_id / test_item_id_display）
  const getTestItemDisplayId = (notification) => {
    return notification.related_test_item_id ?? notification.test_item_display_id ?? notification.test_item_id_display ?? null;
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

  const getOrderTransferStatusText = (notification) => {
    const status = notification.order_transfer_request_status;
    const step = notification.order_transfer_current_step;
    if (!status) return null;
    if (status === 'approved') return { text: '已通过', className: 'status-approved' };
    if (status === 'rejected') return { text: '已拒绝', className: 'status-cancelled' };
    if (status === 'pending') {
      if (step === 'supervisor_review') return { text: '待组长审批', className: 'status-pending' };
      if (step === 'leader_review') return { text: '待室主任审批', className: 'status-pending' };
      if (step === 'sales_review') return { text: '待业务审批', className: 'status-pending' };
      if (step === 'xwf_review') return { text: '待许文凤审批', className: 'status-pending' };
      return { text: '待处理', className: 'status-pending' };
    }
    return null;
  };

  const handleRequestApproved = () => {
    // 刷新通知列表
    loadNotifications();
  };

  const handleApproveOrderTransfer = async (notification) => {
    const rid = getOrderTransferRequestId(notification);
    if (!rid) {
      alert('无法获取申请ID');
      return;
    }
    try {
      const u = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!u?.token) {
        alert('请先登录');
        return;
      }
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/order-transfer-requests/${rid}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '操作失败');
      }
      alert(data.message || '已同意转单');
      loadNotifications();
    } catch (e) {
      alert(e.message || '操作失败');
    }
  };

  const handleRejectOrderTransfer = async (notification) => {
    if (!window.confirm('确定不同意该转单申请吗？')) return;
    const rid = getOrderTransferRequestId(notification);
    if (!rid) {
      alert('无法获取申请ID');
      return;
    }
    try {
      const u = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!u?.token) {
        alert('请先登录');
        return;
      }
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/order-transfer-requests/${rid}/reject`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '操作失败');
      }
      alert(data.message || '已拒绝');
      loadNotifications();
    } catch (e) {
      alert(e.message || '操作失败');
    }
  };

  // 处理取消/删除申请通过
  const handleApproveCancellationRequest = async (notification) => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        alert('请先登录');
        return;
      }

      // 从通知中获取申请ID，优先使用 related_cancellation_request_id
      let requestId = notification.related_cancellation_request_id;
      
      // 如果数据库查询没有返回，尝试从content中解析
      if (!requestId && notification.content) {
        const match = notification.content.match(/申请ID：(\d+)/);
        if (match) {
          requestId = parseInt(match[1]);
        }
      }
      
      if (!requestId) {
        alert('无法获取申请ID，请刷新页面重试');
        return;
      }

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/cancellation-requests/${requestId}/approve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || '申请已通过');
        loadNotifications();
      } else {
        const errorData = await response.json();
        alert(errorData.error || '操作失败');
      }
    } catch (error) {
      console.error('批准申请失败:', error);
      alert('操作失败：' + error.message);
    }
  };

  // 执行取消/删除操作
  const handleExecuteCancellation = async (notification) => {
    if (!window.confirm('确定要执行此操作吗？')) {
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        alert('请先登录');
        return;
      }

      // 从通知中获取申请ID，优先使用 related_cancellation_request_id
      let requestId = notification.related_cancellation_request_id;
      
      // 如果数据库查询没有返回，尝试从content中解析
      if (!requestId && notification.content) {
        const match = notification.content.match(/申请ID：(\d+)/);
        if (match) {
          requestId = parseInt(match[1]);
        }
      }
      
      if (!requestId) {
        alert('无法获取申请ID，请刷新页面重试');
        return;
      }

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/cancellation-requests/${requestId}/execute`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || '操作已执行');
        loadNotifications();
      } else {
        const errorData = await response.json();
        alert(errorData.error || '操作失败');
      }
    } catch (error) {
      console.error('执行操作失败:', error);
      alert('操作失败：' + error.message);
    }
  };

  // 撤回执行操作
  const handleRevertCancellation = async (notification) => {
    if (!window.confirm('确定要撤回执行操作吗？')) {
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        alert('请先登录');
        return;
      }

      // 从通知中获取申请ID，优先使用 related_cancellation_request_id
      let requestId = notification.related_cancellation_request_id;
      
      // 如果数据库查询没有返回，尝试从content中解析
      if (!requestId && notification.content) {
        const match = notification.content.match(/申请ID：(\d+)/);
        if (match) {
          requestId = parseInt(match[1]);
        }
      }
      
      if (!requestId) {
        alert('无法获取申请ID，请刷新页面重试');
        return;
      }

      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/cancellation-requests/${requestId}/revert`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || '操作已撤回');
        loadNotifications();
      } else {
        const errorData = await response.json();
        alert(errorData.error || '操作失败');
      }
    } catch (error) {
      console.error('撤回操作失败:', error);
      alert('操作失败：' + error.message);
    }
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
            className={`filter-btn ${typeFilter === 'cancel_request' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('cancel_request');
              setPage(1);
            }}
          >
            取消申请
          </button>
          <button
            className={`filter-btn ${typeFilter === 'delete_request' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('delete_request');
              setPage(1);
            }}
          >
            删除申请
          </button>
          <button
            className={`filter-btn ${typeFilter === 'order_transfer_request' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('order_transfer_request');
              setPage(1);
            }}
          >
            转单申请
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
                      {notification.type === 'order_transfer_request' &&
                        notification.order_transfer_request_status && (
                          <span className={`request-status-badge ${getOrderTransferStatusText(notification)?.className || ''}`}>
                            {getOrderTransferStatusText(notification)?.text || notification.order_transfer_request_status}
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
                      {/* 取消/删除申请：业务员可以批准（pending状态） */}
                      {notification.type === 'order_transfer_request' && (
                        <button
                          className="btn-view-request"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrderTransferDetail(notification);
                          }}
                        >
                          查看详情
                        </button>
                      )}
                      {notification.type === 'order_transfer_request' &&
                        notification.order_transfer_request_status === 'pending' &&
                        ((notification.order_transfer_current_step === 'leader_review' &&
                          (user?.role === 'leader' || user?.role === 'admin')) ||
                          (notification.order_transfer_current_step === 'supervisor_review' &&
                            (user?.user_id === notification.order_transfer_supervisor_id ||
                              user?.role === 'admin')) ||
                          (notification.order_transfer_current_step === 'xwf_review' &&
                            (user?.user_id === 'JC0092' || user?.role === 'admin')) ||
                          (notification.order_transfer_current_step === 'sales_review' &&
                            (user?.role === 'sales' || user?.role === 'admin'))) && (
                          <>
                            <button
                              className="btn-view-request"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveOrderTransfer(notification);
                              }}
                            >
                              同意转单
                            </button>
                            <button
                              className="btn-view-request btn-revert-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRejectOrderTransfer(notification);
                              }}
                            >
                              不同意转单
                            </button>
                          </>
                        )}
                      {(notification.type === 'cancel_request' || notification.type === 'delete_request') && 
                       notification.cancellation_request_status === 'pending' && 
                       (user?.role === 'sales' || user?.role === 'admin') && (
                        <button
                          className="btn-view-request"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveCancellationRequest(notification);
                          }}
                        >
                          申请通过
                        </button>
                      )}
                      {/* 取消/删除申请：开单员可以执行（approved状态） */}
                      {(notification.type === 'cancel_request' || notification.type === 'delete_request') && 
                       notification.cancellation_request_status === 'approved' && 
                       (user?.user_id === 'JC0089' || user?.role === 'admin') && (
                        <button
                          className="btn-view-request btn-execute-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExecuteCancellation(notification);
                          }}
                        >
                          {notification.type === 'cancel_request' ? '执行取消' : '执行删除'}
                        </button>
                      )}
                      {/* 取消/删除申请：开单员可以撤回执行（executed状态） */}
                      {(notification.type === 'cancel_request' || notification.type === 'delete_request') && 
                       notification.cancellation_request_status === 'executed' && 
                       (user?.user_id === 'JC0089' || user?.role === 'admin') && (
                        <button
                          className="btn-view-request btn-revert-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevertCancellation(notification);
                          }}
                        >
                          撤回
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
                          {notification.type === 'order_transfer_request' ? '已读' : '标记已读'}
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
                    {(notification.type === 'addon_request' ||
                      notification.type === 'cancel_request' ||
                      notification.type === 'delete_request' ||
                      notification.type === 'order_transfer_request') &&
                     (notification.order_id_display ||
                       getTestItemDisplayName(notification) ||
                       getTestItemDisplayId(notification) != null ||
                       notification.order_transfer_target_order_id) && (
                      <div className="notification-meta">
                        {notification.order_id_display && (
                          <span>委托单号: {notification.order_id_display}</span>
                        )}
                        {notification.type === 'order_transfer_request' &&
                          notification.order_transfer_target_order_id && (
                            <>
                              {notification.order_id_display && <span className="meta-sep">｜</span>}
                              <span>拟转新单号: {notification.order_transfer_target_order_id}</span>
                            </>
                          )}
                        {notification.type === 'order_transfer_request' &&
                          notification.order_transfer_reason && (
                            <>
                              {(notification.order_id_display || notification.order_transfer_target_order_id) && (
                                <span className="meta-sep">｜</span>
                              )}
                              <span>转单原因: {notification.order_transfer_reason}</span>
                            </>
                          )}
                        {(() => {
                          const displayName = getTestItemDisplayName(notification);
                          const displayId = getTestItemDisplayId(notification);
                          if (!displayName && displayId == null) return null;
                          return (
                            <>
                              {notification.order_id_display && (displayName || displayId != null) && <span className="meta-sep">｜</span>}
                              {displayName && <span>检测项目: {displayName}</span>}
                              {displayName && displayId != null && <span className="meta-sep">｜</span>}
                              {displayId != null && <span>检测ID: {displayId}</span>}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    {notification.order_id_display &&
                      !['addon_request', 'cancel_request', 'delete_request', 'order_transfer_request'].includes(
                        notification.type
                      ) && (
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

export default Notifications;

