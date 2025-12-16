import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { isMobile } from '../utils/isMobile.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('lims_user', JSON.stringify(res));
      
      // 根据路径判断跳转方向
      const isMobilePath = location.pathname.startsWith('/mobile');
      const isMobileDevice = isMobile();
      
      if (isMobilePath || isMobileDevice) {
        navigate('/mobile/commission-form');
      } else {
        navigate('/commission-form');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{maxWidth: 420}}>
      <h2>集萃实验室系统V2.0</h2>
      <form onSubmit={onSubmit}>
        <div>
          <label>用户名</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} />
        </div>
        <div>
          <label>密码</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit">登录</button>
      </form>
    </div>
  );
}
