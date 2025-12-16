import React from 'react';
import { useNavigate } from 'react-router-dom';
import './MobileProfile.css';

const MobileProfile = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');

  const logout = () => {
    localStorage.removeItem('lims_user');
    navigate('/mobile/login');
  };

  if (!user) {
    navigate('/mobile/login');
    return null;
  }

  return (
    <div className="mobile-profile">
      <div className="mobile-profile-header">
        <div className="mobile-profile-avatar">
          {user.name ? user.name.charAt(0) : user.username.charAt(0)}
        </div>
        <div className="mobile-profile-info">
          <div className="mobile-profile-name">{user.name || user.username}</div>
          <div className="mobile-profile-role">{user.role_name}</div>
        </div>
      </div>

      <div className="mobile-profile-content">
        <div className="mobile-profile-section">
          <div className="mobile-profile-item">
            <span className="mobile-profile-label">用户名</span>
            <span className="mobile-profile-value">{user.username}</span>
          </div>
          {user.name && (
            <div className="mobile-profile-item">
              <span className="mobile-profile-label">姓名</span>
              <span className="mobile-profile-value">{user.name}</span>
            </div>
          )}
          <div className="mobile-profile-item">
            <span className="mobile-profile-label">角色</span>
            <span className="mobile-profile-value">{user.role_name}</span>
          </div>
        </div>

        <div className="mobile-profile-actions">
          <button className="mobile-profile-logout-btn" onClick={logout}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileProfile;





