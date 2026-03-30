import React, { useState } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import MobileScanSearchModal from './MobileScanSearchModal.jsx';
import './MobileLayout.css';

const MobileLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const [showMenu, setShowMenu] = useState(false);
  const [showScanSearch, setShowScanSearch] = useState(false);

  const logout = () => {
    localStorage.removeItem('lims_user');
    navigate('/mobile/login');
  };

  // 底部导航栏配置
  const bottomNavItems = [
    {
      path: '/mobile/commission-form',
      label: '委托单',
      icon: '📋'
    },
    {
      path: '/mobile/notifications',
      label: '通知',
      icon: '🔔',
      badge: true // 显示未读数量
    },
    {
      path: '/mobile/profile',
      label: '我的',
      icon: '👤'
    }
  ];

  // 如果未登录，不显示底部导航
  if (!user?.token) {
    return <div className="mobile-layout">{children}</div>;
  }

  return (
    <div className="mobile-layout">
      {/* 顶部标题栏 */}
      <header className="mobile-header">
        <div className="mobile-header-content">
          <h1 className="mobile-title">LIMS V2.0</h1>
          <div className="mobile-header-actions">
            <button
              type="button"
              className="mobile-scan-header-btn"
              onClick={() => {
                setShowMenu(false);
                setShowScanSearch(true);
              }}
              aria-label="扫码搜索"
              title="扫码搜索"
            >
              {/* 取景框四角 + 中间扫描线（常见「扫一扫」图标样式） */}
              <svg
                className="mobile-scan-header-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 10V5a1 1 0 0 1 1-1h5" />
                <path d="M14 4h5a1 1 0 0 1 1 1v5" />
                <path d="M20 14v5a1 1 0 0 1-1 1h-5" />
                <path d="M10 20H5a1 1 0 0 1-1-1v-5" />
                <path d="M8 12h8" strokeWidth="2.25" />
              </svg>
            </button>
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="菜单"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <MobileScanSearchModal
        open={showScanSearch}
        onClose={() => setShowScanSearch(false)}
        onDecoded={(text) => {
          const q = (text || '').trim();
          setShowScanSearch(false);
          if (!q) return;
          navigate(`/mobile/commission-form?q=${encodeURIComponent(q)}`, { replace: true });
        }}
      />

      {/* 侧边菜单 */}
      {showMenu && (
        <>
          <div 
            className="mobile-menu-overlay"
            onClick={() => setShowMenu(false)}
          />
          <div className="mobile-menu">
            <div className="mobile-menu-header">
              <div className="mobile-user-info">
                <div className="mobile-user-name">{user.name || user.username}</div>
                <div className="mobile-user-role">{user.role_name}</div>
              </div>
              <button 
                className="mobile-menu-close"
                onClick={() => setShowMenu(false)}
              >
                ✕
              </button>
            </div>
            <div className="mobile-menu-content">
              <NavLink 
                to="/mobile/commission-form"
                className="mobile-menu-item"
                onClick={() => setShowMenu(false)}
              >
                <span className="mobile-menu-icon">📋</span>
                <span>委托单登记表</span>
              </NavLink>
              <NavLink 
                to="/mobile/notifications"
                className="mobile-menu-item"
                onClick={() => setShowMenu(false)}
              >
                <span className="mobile-menu-icon">🔔</span>
                <span>消息通知</span>
              </NavLink>
              <NavLink 
                to="/mobile/profile"
                className="mobile-menu-item"
                onClick={() => setShowMenu(false)}
              >
                <span className="mobile-menu-icon">👤</span>
                <span>个人中心</span>
              </NavLink>
              <div className="mobile-menu-divider" />
              <button 
                className="mobile-menu-item mobile-menu-logout"
                onClick={logout}
              >
                <span className="mobile-menu-icon">🚪</span>
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* 主内容区 */}
      <main className="mobile-main">
        {children}
      </main>

      {/* 底部导航栏 */}
      <nav className="mobile-bottom-nav">
        {bottomNavItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="mobile-bottom-nav-icon">{item.icon}</span>
              <span className="mobile-bottom-nav-label">{item.label}</span>
              {item.badge && (
                <span className="mobile-bottom-nav-badge" id="notification-badge" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default MobileLayout;







