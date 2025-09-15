import React from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Customers from './pages/customers/Customers.jsx';
import CustomerEdit from './pages/customers/CustomerEdit.jsx';
import Payers from './pages/payers/Payers.jsx';
import PayerEdit from './pages/payers/PayerEdit.jsx';
import Commissioners from './pages/commissioners/Commissioners.jsx';
import CommissionerEdit from './pages/commissioners/CommissionerEdit.jsx';
import PriceList from './pages/price/PriceList.jsx';
import PriceEdit from './pages/price/PriceEdit.jsx';
import TestItems from './pages/test_items/TestItems.jsx';
import TestItemEdit from './pages/test_items/TestItemEdit.jsx';
import './app.css';

function Layout({ children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  function logout() {
    localStorage.removeItem('lims_user');
    navigate('/login');
  }
  return (
    <>
      <header>
        <div><b>集萃实验室系统V2.0</b></div>
        <nav className="hstack">
          {user?.token ? (<>
            <NavLink to="/customers" className={({isActive})=>isActive?'active':''}>客户</NavLink>
            <NavLink to="/payers" className={({isActive})=>isActive?'active':''}>付款人</NavLink>
            <NavLink to="/commissioners" className={({isActive})=>isActive?'active':''}>委托人</NavLink>
            <NavLink to="/test-items" className={({isActive})=>isActive?'active':''}>检测项目处理</NavLink>
            <NavLink to="/price" className={({isActive})=>isActive?'active':''}>价目表</NavLink>
            <span style={{marginLeft:12,opacity:.8}}>用户: {user.username} ({user.role})</span>
            <button className="btn" onClick={logout}>登出</button>
          </>) : (
            <NavLink to="/login">Login</NavLink>
          )}
        </nav>
      </header>
      <div className="container">{children}</div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Layout><Login/></Layout>} />
      <Route path="/customers" element={<Layout><Customers/></Layout>} />
      <Route path="/customers/:id" element={<Layout><CustomerEdit/></Layout>} />
      <Route path="/payers" element={<Layout><Payers/></Layout>} />
      <Route path="/payers/:id" element={<Layout><PayerEdit/></Layout>} />
      <Route path="/commissioners" element={<Layout><Commissioners/></Layout>} />
      <Route path="/commissioners/:id" element={<Layout><CommissionerEdit/></Layout>} />
      <Route path="/price" element={<Layout><PriceList/></Layout>} />
      <Route path="/price/:id" element={<Layout><PriceEdit/></Layout>} />
      <Route path="/test-items" element={<Layout><TestItems/></Layout>} />
      <Route path="/test-items/:id" element={<Layout><TestItemEdit/></Layout>} />
      <Route path="*" element={<Layout><Login/></Layout>} />
    </Routes>
  )
}
