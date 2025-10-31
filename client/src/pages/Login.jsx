import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('lims_user', JSON.stringify(res));
      
      // 所有角色都跳转到委托单登记表
      navigate('/commission-form');
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
