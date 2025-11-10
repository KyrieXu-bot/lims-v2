import React from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Customers from './pages/customers/Customers.jsx';
import CustomerEdit from './pages/customers/CustomerEdit.jsx';
import CustomerIntegratedAdd from './pages/customers/CustomerIntegratedAdd.jsx';
import Payers from './pages/payers/Payers.jsx';
import PayerEdit from './pages/payers/PayerEdit.jsx';
import Commissioners from './pages/commissioners/Commissioners.jsx';
import CommissionerEdit from './pages/commissioners/CommissionerEdit.jsx';
import PriceList from './pages/price/PriceList.jsx';
import PriceEdit from './pages/price/PriceEdit.jsx';
import TestItems from './pages/test_items/TestItems.jsx';
import TestItemEdit from './pages/test_items/TestItemEdit.jsx';
import SampleManagement from './pages/sample_management/SampleManagement.jsx';
import SampleDetail from './pages/sample_management/SampleDetail.jsx';
import OutsourceManagement from './pages/outsource/OutsourceManagement.jsx';
import OrderManagement from './pages/orders/OrderManagement.jsx';
import OrderDelete from './pages/orders/OrderDelete.jsx';
import CommissionForm from './pages/commission/CommissionForm.jsx';
import EquipmentList from './pages/commission/EquipmentList.jsx';
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
        <div className="header-content">
          <h1>集萃实验室系统 V2.0</h1>
          <nav>
            {user?.token ? (<>
              {/* 管理员和业务员可以看到客户管理 */}
              {(user.role === 'admin' || user.role === 'sales') && (
                <>
                  <NavLink to="/customers" className={({isActive})=>isActive?'active':''}>客户管理</NavLink>
                  <NavLink to="/payers" className={({isActive})=>isActive?'active':''}>付款人</NavLink>
                  <NavLink to="/commissioners" className={({isActive})=>isActive?'active':''}>委托人</NavLink>
                </>
              )}
              {/* 所有角色都可以看到检测项目处理 */}
              {/* <NavLink to="/test-items" className={({isActive})=>isActive?'active':''}>检测项目处理</NavLink> */}
              {/* 样品管理 - 实验室相关人员可以看到 */}
              {(user.role === 'admin' || user.role === 'leader' || user.role === 'supervisor' || user.role === 'employee') && (
                <NavLink to="/sample-management" className={({isActive})=>isActive?'active':''}>样品管理</NavLink>
              )}
              {/* 委外管理 - 只有管理员和YWQXM可以看到 */}
              {/* {(user.role === 'admin' || user.user_id === 'YWQXM') && (
                <NavLink to="/outsource" className={({isActive})=>isActive?'active':''}>委外管理</NavLink>
              )} */}
              {/* 委托单管理 - 所有角色都可以看到 */}
              {/* <NavLink to="/orders" className={({isActive})=>isActive?'active':''}>委托单管理</NavLink> */}
              {/* 委托单登记表 - 所有角色都可以看到 */}
              <NavLink to="/commission-form" className={({isActive})=>isActive?'active':''}>委托单登记表</NavLink>
              {/* 平台设备清单 - 所有角色都可以看到 */}
              <NavLink to="/equipment-list" className={({isActive})=>isActive?'active':''}>平台设备清单</NavLink>
              {/* 管理员可以看到价目表 */}
              {user.role === 'admin' && (
                <NavLink to="/price" className={({isActive})=>isActive?'active':''}>价目表</NavLink>
              )}
              <div className="hstack" style={{marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid var(--gray-300)'}}>
                <span className="text-muted">用户: {user.name || user.username}</span>
                <span className="badge badge-primary">{user.role_name}</span>
                <button className="btn btn-secondary btn-sm" onClick={logout}>登出</button>
              </div>
            </>) : (
              <NavLink to="/login" className={({isActive})=>isActive?'active':''}>登录</NavLink>
            )}
          </nav>
        </div>
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
      <Route path="/customers/new" element={<Layout><CustomerIntegratedAdd/></Layout>} />
      <Route path="/customers/:id" element={<Layout><CustomerEdit/></Layout>} />
      <Route path="/payers" element={<Layout><Payers/></Layout>} />
      <Route path="/payers/:id" element={<Layout><PayerEdit/></Layout>} />
      <Route path="/commissioners" element={<Layout><Commissioners/></Layout>} />
      <Route path="/commissioners/:id" element={<Layout><CommissionerEdit/></Layout>} />
      <Route path="/price" element={<Layout><PriceList/></Layout>} />
      <Route path="/price/:id" element={<Layout><PriceEdit/></Layout>} />
      <Route path="/test-items" element={<Layout><TestItems/></Layout>} />
      <Route path="/test-items/:id" element={<Layout><TestItemEdit/></Layout>} />
      <Route path="/sample-management" element={<Layout><SampleManagement/></Layout>} />
      <Route path="/sample-tracking/:id" element={<Layout><SampleDetail/></Layout>} />
      <Route path="/outsource" element={<Layout><OutsourceManagement/></Layout>} />
      <Route path="/orders" element={<Layout><OrderManagement/></Layout>} />
      <Route path="/orders/delete" element={<Layout><OrderDelete/></Layout>} />
      <Route path="/commission-form" element={<Layout><CommissionForm/></Layout>} />
      <Route path="/equipment-list" element={<Layout><EquipmentList/></Layout>} />
      <Route path="/" element={<Layout><CommissionForm/></Layout>} />
      <Route path="*" element={<Layout><Login/></Layout>} />
    </Routes>
  )
}
