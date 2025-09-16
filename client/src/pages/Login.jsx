import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('lims_user', JSON.stringify(res));
      
      // 根据角色跳转到不同页面
      if (res.role === 'admin' || res.role === 'sales') {
        navigate('/customers');
      } else {
        navigate('/test-items');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{maxWidth: 420}}>
      <h2>Login</h2>
      <form onSubmit={onSubmit}>
        <div>
          <label>Username</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} />
        </div>
        <div>
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit">Sign in</button>
      </form>
    </div>
  );
}
