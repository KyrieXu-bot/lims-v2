import React from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
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
import Statistics from './pages/statistics/Statistics.jsx';
import SettlementManagement from './pages/settlements/SettlementManagement.jsx';
import Profile from './pages/Profile.jsx';
import Notifications from './pages/Notifications.jsx';
import NotificationIcon from './components/NotificationIcon.jsx';
// 移动端组件
import MobileLayout from './components/mobile/MobileLayout.jsx';
import MobileCommissionForm from './pages/mobile/MobileCommissionForm.jsx';
import MobileNotifications from './pages/mobile/MobileNotifications.jsx';
import MobileProfile from './pages/mobile/MobileProfile.jsx';
import { isMobile, isCapacitorNative } from './utils/isMobile.js';
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
              {(user.role === 'leader' || user.role === 'supervisor' || user.role === 'employee') && (
                <NavLink to="/statistics" className={({isActive})=>isActive?'active':''}>数据统计</NavLink>
              )}
              {/* 平台设备清单 - 所有角色都可以看到 */}
              <NavLink to="/equipment-list" className={({isActive})=>isActive?'active':''}>平台设备清单</NavLink>
              {/* 管理员可以看到价目表 */}
              {user.role === 'admin' && (
                <NavLink to="/price" className={({isActive})=>isActive?'active':''}>价目表</NavLink>
              )}
              {/* 费用结算 - 管理员和特定部门领导可以使用 */}
              {(user.role === 'admin' || (user.department_id === 5 && user.role === 'leader')) && (
                <NavLink to="/settlements" className={({isActive})=>isActive?'active':''}>费用结算</NavLink>
              )}
              <div className="hstack" style={{marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid var(--gray-300)', flexShrink: 0}}>
                <span className="text-muted" style={{whiteSpace: 'nowrap'}}>用户: {user.name || user.username}</span>
                <span className="badge badge-primary" style={{whiteSpace: 'nowrap'}}>{user.role_name}</span>
                <NotificationIcon />
                <NavLink to="/profile" className={({isActive})=>isActive?'active':''} style={{padding: '4px 12px', fontSize: '14px', whiteSpace: 'nowrap'}}>个人中心</NavLink>
                <button className="btn btn-secondary btn-sm" onClick={logout} style={{whiteSpace: 'nowrap'}}>登出</button>
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

// 移动端路由包装组件
function MobileRouteWrapper({ children }) {
  const location = useLocation();
  const isMobileDevice = isMobile();
  
  // 如果路径以 /mobile 开头或者是移动设备访问根路径，使用移动端布局
  if (location.pathname.startsWith('/mobile') || (isMobileDevice && location.pathname === '/')) {
    return <MobileLayout>{children}</MobileLayout>;
  }
  
  // 否则使用PC端布局
  return <Layout>{children}</Layout>;
}

// PC端路径到移动端路径的映射
const PC_TO_MOBILE_ROUTE_MAP = {
  '/login': '/mobile/login',
  '/commission-form': '/mobile/commission-form',
  '/notifications': '/mobile/notifications',
  '/profile': '/mobile/profile',
};

// PC端路由包装组件 - 在Capacitor原生环境中自动重定向到移动端
function PCRouteWrapper({ children }) {
  const location = useLocation();
  const isNative = isCapacitorNative();
  
  // 如果是原生平台，重定向到移动端
  if (isNative) {
    const mobilePath = PC_TO_MOBILE_ROUTE_MAP[location.pathname];
    if (mobilePath) {
      return <Navigate to={mobilePath} replace />;
    }
    // 如果没有对应的移动端路径，重定向到移动端首页
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (user?.token) {
      return <Navigate to="/mobile/commission-form" replace />;
    } else {
      return <Navigate to="/mobile/login" replace />;
    }
  }
  
  return <>{children}</>;
}

// 根路径重定向组件 - 根据设备类型重定向
function RootRedirect() {
  // 优先检测是否是原生平台
  const isNative = isCapacitorNative();
  const isMobileDevice = isMobile();
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  
  // 如果是原生平台，或者检测到是移动设备，都重定向到移动端
  if (isNative || isMobileDevice) {
    // 移动设备或原生应用
    if (user?.token) {
      // 已登录，重定向到移动端首页
      return <Navigate to="/mobile/commission-form" replace />;
    } else {
      // 未登录，重定向到移动端登录页
      return <Navigate to="/mobile/login" replace />;
    }
  } else {
    // PC设备
    if (user?.token) {
      // 已登录，重定向到PC端首页
      return <Navigate to="/commission-form" replace />;
    } else {
      // 未登录，重定向到PC端登录页
      return <Navigate to="/login" replace />;
    }
  }
}

export default function App() {
  return (
    <Routes>
      {/* 移动端路由 */}
      <Route path="/mobile/login" element={<MobileLayout><Login/></MobileLayout>} />
      <Route path="/mobile/commission-form" element={<MobileLayout><MobileCommissionForm/></MobileLayout>} />
      <Route path="/mobile/notifications" element={<MobileLayout><MobileNotifications/></MobileLayout>} />
      <Route path="/mobile/profile" element={<MobileLayout><MobileProfile/></MobileLayout>} />
      
      {/* PC端路由 - 在原生环境中会自动重定向到移动端 */}
      <Route path="/login" element={<PCRouteWrapper><Layout><Login/></Layout></PCRouteWrapper>} />
      <Route path="/customers" element={<PCRouteWrapper><Layout><Customers/></Layout></PCRouteWrapper>} />
      <Route path="/customers/new" element={<PCRouteWrapper><Layout><CustomerIntegratedAdd/></Layout></PCRouteWrapper>} />
      <Route path="/customers/:id" element={<PCRouteWrapper><Layout><CustomerEdit/></Layout></PCRouteWrapper>} />
      <Route path="/payers" element={<PCRouteWrapper><Layout><Payers/></Layout></PCRouteWrapper>} />
      <Route path="/payers/:id" element={<PCRouteWrapper><Layout><PayerEdit/></Layout></PCRouteWrapper>} />
      <Route path="/commissioners" element={<PCRouteWrapper><Layout><Commissioners/></Layout></PCRouteWrapper>} />
      <Route path="/commissioners/:id" element={<PCRouteWrapper><Layout><CommissionerEdit/></Layout></PCRouteWrapper>} />
      <Route path="/price" element={<PCRouteWrapper><Layout><PriceList/></Layout></PCRouteWrapper>} />
      <Route path="/price/:id" element={<PCRouteWrapper><Layout><PriceEdit/></Layout></PCRouteWrapper>} />
      <Route path="/test-items" element={<PCRouteWrapper><Layout><TestItems/></Layout></PCRouteWrapper>} />
      <Route path="/test-items/:id" element={<PCRouteWrapper><Layout><TestItemEdit/></Layout></PCRouteWrapper>} />
      <Route path="/sample-management" element={<PCRouteWrapper><Layout><SampleManagement/></Layout></PCRouteWrapper>} />
      <Route path="/sample-tracking/:id" element={<PCRouteWrapper><Layout><SampleDetail/></Layout></PCRouteWrapper>} />
      <Route path="/outsource" element={<PCRouteWrapper><Layout><OutsourceManagement/></Layout></PCRouteWrapper>} />
      <Route path="/orders" element={<PCRouteWrapper><Layout><OrderManagement/></Layout></PCRouteWrapper>} />
      <Route path="/orders/delete" element={<PCRouteWrapper><Layout><OrderDelete/></Layout></PCRouteWrapper>} />
      <Route path="/commission-form" element={<PCRouteWrapper><Layout><CommissionForm/></Layout></PCRouteWrapper>} />
      <Route path="/statistics" element={<PCRouteWrapper><Layout><Statistics/></Layout></PCRouteWrapper>} />
      <Route path="/settlements" element={<PCRouteWrapper><Layout><SettlementManagement/></Layout></PCRouteWrapper>} />
      <Route path="/equipment-list" element={<PCRouteWrapper><Layout><EquipmentList/></Layout></PCRouteWrapper>} />
      <Route path="/profile" element={<PCRouteWrapper><Layout><Profile/></Layout></PCRouteWrapper>} />
      <Route path="/notifications" element={<PCRouteWrapper><Layout><Notifications/></Layout></PCRouteWrapper>} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<MobileRouteWrapper><Login/></MobileRouteWrapper>} />
    </Routes>
  )
}
