import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Profile() {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'password', 'users'
  
  // 修改密码相关状态
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 员工管理相关状态（管理员）
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const isAdmin = currentUser?.role === 'admin';

  // 加载当前用户信息
  useEffect(() => {
    async function loadUserInfo() {
      try {
        const info = await api.getCurrentUser();
        setUserInfo(info);
      } catch (e) {
        console.error('Failed to load user info:', e);
      } finally {
        setLoading(false);
      }
    }
    loadUserInfo();
  }, []);

  // 加载员工列表（管理员）
  useEffect(() => {
    if (isAdmin && activeTab === 'users') {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTab, searchQuery, filterActive]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await api.listAllUsers({ q: searchQuery, is_active: filterActive });
      setUsers(res);
    } catch (e) {
      alert(e.message || '加载员工列表失败');
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('请填写所有字段');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('新密码长度至少为6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    if (oldPassword === newPassword) {
      setPasswordError('新密码不能与旧密码相同');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changePassword({ oldPassword, newPassword });
      setPasswordSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordError(e.message || '修改密码失败');
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleToggleUserStatus(userId, currentStatus) {
    if (!confirm(`确定要${currentStatus ? '禁用' : '启用'}该员工吗？`)) {
      return;
    }

    try {
      await api.updateUserStatus(userId, !currentStatus);
      await loadUsers();
    } catch (e) {
      alert(e.message || '操作失败');
    }
  }

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto' }}>
      <h2>个人中心</h2>

      {/* 标签页导航 */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        borderBottom: '2px solid var(--gray-300)',
        marginBottom: 24
      }}>
        <button
          className={`btn ${activeTab === 'info' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('info')}
          style={{ borderRadius: '6px 6px 0 0', marginBottom: -2 }}
        >
          个人信息
        </button>
        <button
          className={`btn ${activeTab === 'password' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('password')}
          style={{ borderRadius: '6px 6px 0 0', marginBottom: -2 }}
        >
          修改密码
        </button>
        {isAdmin && (
          <button
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('users')}
            style={{ borderRadius: '6px 6px 0 0', marginBottom: -2 }}
          >
            员工管理
          </button>
        )}
      </div>

      {/* 个人信息板块 */}
      {activeTab === 'info' && userInfo && (
        <div style={{ 
          padding: 24, 
          backgroundColor: 'var(--white)', 
          borderRadius: 8,
          boxShadow: 'var(--shadow)'
        }}>
          <h3 style={{ marginBottom: 20 }}>员工个人信息</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                员工工号
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.user_id || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                登录账号
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.account || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                姓名
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.name || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                邮箱
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.email || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                手机号
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.phone || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                所属部门
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.department_name || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                所属小组
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.group_name || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                角色
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.roles?.map(r => r.role_name).join('、') || '-'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--gray-600)', fontSize: 14 }}>
                账户状态
              </label>
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--gray-100)', borderRadius: 4 }}>
                {userInfo.is_active ? (
                  <span className="badge badge-primary">启用</span>
                ) : (
                  <span className="badge" style={{ backgroundColor: 'var(--danger)' }}>禁用</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码板块 */}
      {activeTab === 'password' && (
        <div style={{ 
          padding: 24, 
          backgroundColor: 'var(--white)', 
          borderRadius: 8,
          boxShadow: 'var(--shadow)',
          maxWidth: 500
        }}>
          <h3 style={{ marginBottom: 20 }}>修改密码</h3>
          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                旧密码
              </label>
              <input
                className="input"
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="请输入当前密码"
                disabled={passwordLoading}
                autoComplete="current-password"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                新密码
              </label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少6位）"
                disabled={passwordLoading}
                autoComplete="new-password"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                确认新密码
              </label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                disabled={passwordLoading}
                autoComplete="new-password"
              />
            </div>

            {passwordError && (
              <div className="error" style={{ marginBottom: 16 }}>
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div style={{
                padding: 12,
                backgroundColor: '#d4edda',
                color: '#155724',
                borderRadius: 6,
                marginBottom: 16,
                border: '1px solid #c3e6cb'
              }}>
                密码修改成功！
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={passwordLoading}
            >
              {passwordLoading ? '修改中...' : '确认修改'}
            </button>
          </form>
        </div>
      )}

      {/* 员工管理板块（管理员） */}
      {activeTab === 'users' && isAdmin && (
        <div style={{ 
          padding: 24, 
          backgroundColor: 'var(--white)', 
          borderRadius: 8,
          boxShadow: 'var(--shadow)'
        }}>
          <h3 style={{ marginBottom: 20 }}>员工管理</h3>
          
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <input
              className="input"
              placeholder="搜索（工号、姓名、账号）..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <select
              className="input"
              style={{ maxWidth: 160 }}
              value={filterActive}
              onChange={e => setFilterActive(e.target.value)}
            >
              <option value="">所有状态</option>
              <option value="1">启用</option>
              <option value="0">禁用</option>
            </select>
          </div>

          {usersLoading ? (
            <div>加载中...</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>工号</th>
                  <th>姓名</th>
                  <th>账号</th>
                  <th>邮箱</th>
                  <th>手机号</th>
                  <th>部门</th>
                  <th>小组</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: 20 }}>
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user.user_id}>
                      <td>{user.user_id}</td>
                      <td>{user.name}</td>
                      <td>{user.account}</td>
                      <td>{user.email || '-'}</td>
                      <td>{user.phone || '-'}</td>
                      <td>{user.department_name || '-'}</td>
                      <td>{user.group_name || '-'}</td>
                      <td>
                        {user.roles?.map((r, idx) => (
                          <span key={idx} className="badge" style={{ marginRight: 4 }}>
                            {r.role_name}
                          </span>
                        )) || '-'}
                      </td>
                      <td>
                        {user.is_active ? (
                          <span className="badge badge-primary">启用</span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'var(--danger)' }}>禁用</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleToggleUserStatus(user.user_id, user.is_active)}
                        >
                          {user.is_active ? '禁用' : '启用'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

