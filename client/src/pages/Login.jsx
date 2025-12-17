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
  const isMobilePath = location.pathname.startsWith('/mobile');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('lims_user', JSON.stringify(res));
      
      // 根据路径判断跳转方向
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

  // 手机端样式
  const mobileStyles = isMobilePath ? {
    container: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px',
      boxSizing: 'border-box'
    },
    formWrapper: {
      width: '100%',
      maxWidth: '320px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    title: {
      textAlign: 'center',
      marginBottom: '32px',
      fontSize: '20px',
      color: '#2c5aa0'
    },
    form: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px'
    },
    inputWrapper: {
      width: '280px',
      display: 'flex',
      flexDirection: 'column'
    },
    input: {
      width: '280px',
      boxSizing: 'border-box'
    },
    button: {
      width: '280px',
      boxSizing: 'border-box'
    },
    error: {
      width: '280px',
      textAlign: 'center',
      color: '#dc3545',
      fontSize: '14px',
      padding: '8px',
      backgroundColor: '#f8d7da',
      border: '1px solid #f5c6cb',
      borderRadius: '6px',
      boxSizing: 'border-box'
    }
  } : {
    container: {
      maxWidth: 420
    },
    formWrapper: {},
    title: {},
    form: {},
    inputWrapper: {},
    input: {},
    button: {},
    error: {}
  };

  return (
    <div style={mobileStyles.container}>
      <div style={mobileStyles.formWrapper}>
        <h2 style={mobileStyles.title}>集萃实验室系统V2.0</h2>
        <form onSubmit={onSubmit} style={mobileStyles.form}>
          <div style={mobileStyles.inputWrapper}>
            <label>用户名</label>
            <input 
              className="input" 
              value={username} 
              onChange={e=>setUsername(e.target.value)}
              style={mobileStyles.input}
            />
          </div>
          <div style={mobileStyles.inputWrapper}>
            <label>密码</label>
            <input 
              className="input" 
              type="password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)}
              style={mobileStyles.input}
            />
          </div>
          {error && <div className="error" style={mobileStyles.error}>{error}</div>}
          <button className="btn btn-primary" type="submit" style={mobileStyles.button}>登录</button>
        </form>
      </div>
    </div>
  );
}
