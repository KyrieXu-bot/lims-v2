// 统一的后端 API 根地址
// 优先级：环境变量 > 原生环境检测 > 根据当前页面协议 > 默认值

import { readApiJson, throwIfErrorOrReturnBlob, consumeLoginNotice } from './utils/sessionReauth.js';

export { consumeLoginNotice };

export function getApiBase() {
  // 1. 优先使用环境变量（支持 VITE_API_BASE 和 VITE_API_BASE_URL）
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. 检测是否是原生环境（通过检查全局对象）
  // 注意：在Capacitor中，window.location.host是localhost，所以需要检测Capacitor对象
  const isNative = typeof window !== 'undefined' 
    && window.Capacitor 
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();
  
  if (isNative) {
    // 原生应用使用 HTTPS 域名（支持外网访问）
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 3. 额外检查：如果host是localhost但存在Capacitor，说明是Capacitor环境但检测失败
  if (typeof window !== 'undefined' && window.location && window.location.host === 'localhost' && window.Capacitor) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 4. Web 环境
  if (import.meta.env.DEV) {
    // 开发环境使用本地
    return 'http://localhost:3001';
  }
  
  // 5. 生产环境 Web：使用相对路径，让浏览器自动处理协议和主机
  // 注意：只有在非Capacitor环境中才使用相对路径
  if (typeof window !== 'undefined' && window.location && !window.Capacitor) {
    // 使用相对路径，浏览器会自动使用当前页面的协议和主机
    return '';
  }
  
  // 6. 兜底：如果无法检测，使用 HTTP（生产环境后端通常是 HTTP）
  return 'http://192.168.9.46:3004';
}

// 注意：API_BASE在模块顶层计算，但getApiBase函数内部会进行运行时检测
// 如果Capacitor在模块加载时还未初始化，可能需要延迟初始化
// 但通常Capacitor会在应用启动时立即初始化，所以这里应该没问题
const API_BASE = getApiBase();
const platform = typeof window !== 'undefined' && window.Capacitor 
  ? window.Capacitor.getPlatform() 
  : 'web';
console.log('API Base URL:', API_BASE, 'Platform:', platform);

export const api = {
  // auth
  async login(username, password) {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return readApiJson(r, 'Login failed');
  },
  async changePassword({ oldPassword, newPassword }) {
    const r = await fetch(`${API_BASE}/api/users/change-password`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    return readApiJson(r, '修改密码失败');
  },
  async getCurrentUser() {
    const r = await fetch(`${API_BASE}/api/users/me`, { headers: this.authHeaders() });
    return readApiJson(r, '获取用户信息失败');
  },
  async listAllUsers({ q = '', is_active = '' } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (is_active !== '') params.set('is_active', is_active);
    const r = await fetch(`${API_BASE}/api/users/all?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, '获取员工列表失败');
  },
  async updateUserStatus(userId, isActive) {
    const r = await fetch(`${API_BASE}/api/users/${userId}/status`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({ is_active: isActive })
    });
    return readApiJson(r, '更新状态失败');
  },
  async generateWHReport({ order_id, test_item_ids }) {
    const r = await fetch(`${API_BASE}/api/templates/generate-wh-report`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ order_id, test_item_ids })
    });
    return throwIfErrorOrReturnBlob(r, 'Export failed');
  },

  // helper
  authHeaders() {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user) throw new Error('Not logged in');
    return { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' };
  },

  // customers
  async listCustomers({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`${API_BASE}/api/customers?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async salesOptions() {
    const r = await fetch(`${API_BASE}/api/customers/sales-options`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async customersOptions() {
    const r = await fetch(`${API_BASE}/api/customers/options`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getCustomer(id) {
    const r = await fetch(`${API_BASE}/api/customers/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createCustomer(payload) {
    const r = await fetch(`${API_BASE}/api/customers`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Create failed');
  },
  async updateCustomer(id, payload) {
    const r = await fetch(`${API_BASE}/api/customers/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Update failed');
  },
  async deleteCustomer(id) {
    const r = await fetch(`${API_BASE}/api/customers/${id}`, { method:'DELETE', headers: this.authHeaders() });
    return readApiJson(r, 'Delete failed');
  },

  // payers
  async listPayers({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`${API_BASE}/api/payers?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async payersOptions() {
    const r = await fetch(`${API_BASE}/api/payers/options`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getPayer(id) {
    const r = await fetch(`${API_BASE}/api/payers/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createPayer(payload) {
    const r = await fetch(`${API_BASE}/api/payers`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Create failed');
  },
  async updatePayer(id, payload) {
    const r = await fetch(`${API_BASE}/api/payers/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Update failed');
  },
  async deletePayer(id) {
    const r = await fetch(`${API_BASE}/api/payers/${id}`, { method:'DELETE', headers: this.authHeaders() });
    return readApiJson(r, 'Delete failed');
  },

  // commissioners
  async listCommissioners({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`${API_BASE}/api/commissioners?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getCommissioner(id) {
    const r = await fetch(`${API_BASE}/api/commissioners/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createCommissioner(payload) {
    const r = await fetch(`${API_BASE}/api/commissioners`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Create failed');
  },
  async updateCommissioner(id, payload) {
    const r = await fetch(`${API_BASE}/api/commissioners/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Update failed');
  },
  async deleteCommissioner(id) {
    const r = await fetch(`${API_BASE}/api/commissioners/${id}`, { method:'DELETE', headers: this.authHeaders() });
    return readApiJson(r, 'Delete failed');
  }
  ,
  // test items (检测项目处理)
  async listTestItems({ q = '', page = 1, pageSize = 20, status, order_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (status) params.set('status', status);
    if (order_id) params.set('order_id', order_id);
    const r = await fetch(`${API_BASE}/api/test-items?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  // 获取某个委托单下第一条检测项目的样品到达信息（不受列表权限过滤影响）
  async getFirstTestItemArrivalByOrder(orderId) {
    const r = await fetch(`${API_BASE}/api/test-items/first-arrival-by-order/${encodeURIComponent(orderId)}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getTestItem(id) {
    const r = await fetch(`${API_BASE}/api/test-items/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createTestItem(payload) {
    const r = await fetch(`${API_BASE}/api/test-items`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Create failed');
  },
  async updateTestItem(id, payload) {
    const r = await fetch(`${API_BASE}/api/test-items/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Update failed');
  },
  async deleteTestItem(id) {
    const r = await fetch(`${API_BASE}/api/test-items/${id}`, { method:'DELETE', headers: this.authHeaders() });
    return readApiJson(r, 'Delete failed');
  },
  async batchAssignTestItems(payload) {
    const r = await fetch(`${API_BASE}/api/test-items/batch-assign`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Batch assign failed');
  },
  async cancelTestItem(id) {
    const r = await fetch(`${API_BASE}/api/test-items/${id}/cancel`, { method:'POST', headers: this.authHeaders() });
    return readApiJson(r, 'Cancel failed');
  },
  async getSupervisorsByDepartment(departmentId) {
    const r = await fetch(`${API_BASE}/api/users/supervisors?department_id=${departmentId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getEmployeesByGroup(groupId) {
    const r = await fetch(`${API_BASE}/api/users/employees?group_id=${groupId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getSupervisorByGroup(groupId) {
    const r = await fetch(`${API_BASE}/api/users/group-supervisor?group_id=${groupId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getDepartmentIdByGroupId(groupId) {
    const r = await fetch(`${API_BASE}/api/users/department-by-group?group_id=${groupId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getBusinessStaff({ q = '' } = {}) {
    const params = new URLSearchParams({ q });
    const r = await fetch(`${API_BASE}/api/users/business-staff?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getAllSupervisors({ q = '', department_id } = {}) {
    const params = new URLSearchParams({ q });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`${API_BASE}/api/users/all-supervisors?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getAllEmployees({ q = '', department_id } = {}) {
    const params = new URLSearchParams({ q });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`${API_BASE}/api/users/all-employees?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // orders (委托单)
  async listOrders({ q = '', page = 1, pageSize = 20 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`${API_BASE}/api/orders?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getOrder(id) {
    const r = await fetch(`${API_BASE}/api/orders/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  // price (test items catalog)
  async listPrice({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`${API_BASE}/api/price?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getPrice(id) {
    const r = await fetch(`${API_BASE}/api/price/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createPrice(payload) {
    const r = await fetch(`${API_BASE}/api/price`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Create failed');
  },
  async updatePrice(id, payload) {
    const r = await fetch(`${API_BASE}/api/price/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Update failed');
  },
  async deletePrice(id) {
    const r = await fetch(`${API_BASE}/api/price/${id}`, { method:'DELETE', headers: this.authHeaders() });
    return readApiJson(r, 'Delete failed');
  },

  // equipment
  async listEquipment({ q = '', page = 1, pageSize = 50, department_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`${API_BASE}/api/equipment?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getEquipmentByDepartment(departmentId) {
    const r = await fetch(`${API_BASE}/api/equipment/by-department?department_id=${departmentId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getEquipment(id) {
    const r = await fetch(`${API_BASE}/api/equipment/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // sample tracking
  async listSampleTracking({ q = '', page = 1, pageSize = 20, status, lab_type, order_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (status) params.set('status', status);
    if (lab_type) params.set('lab_type', lab_type);
    if (order_id) params.set('order_id', order_id);
    const r = await fetch(`${API_BASE}/api/sample-tracking?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getSampleTrackingGrouped({ q = '', lab_type } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (lab_type) params.set('lab_type', lab_type);
    const r = await fetch(`${API_BASE}/api/sample-tracking/grouped?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async receiveSample(payload) {
    const r = await fetch(`${API_BASE}/api/sample-tracking/receive`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Receive failed');
  },
  async completeTesting(payload) {
    const r = await fetch(`${API_BASE}/api/sample-tracking/testing-completed`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Complete testing failed');
  },
  async returnSample(payload) {
    const r = await fetch(`${API_BASE}/api/sample-tracking/return`, { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    return readApiJson(r, 'Return failed');
  },
  async getSampleTracking(id) {
    const r = await fetch(`${API_BASE}/api/sample-tracking/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // 委外管理API
  async getOutsourceItems() {
    const r = await fetch(`${API_BASE}/api/outsource`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async updateOutsourceInfo(id, data) {
    const r = await fetch(`${API_BASE}/api/outsource/${id}`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify(data)
    });
    return readApiJson(r, 'Update failed');
  },

  async uploadOutsourceReport(id, reportPath) {
    const r = await fetch(`${API_BASE}/api/outsource/${id}/report`, { 
      method: 'POST', 
      headers: this.authHeaders(),
      body: JSON.stringify({ report_path: reportPath })
    });
    return readApiJson(r, 'Upload failed');
  },

  async updateTrackingNumber(id, trackingNumber) {
    const r = await fetch(`${API_BASE}/api/outsource/${id}/tracking`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify({ return_tracking_number: trackingNumber })
    });
    return readApiJson(r, 'Update failed');
  },

  async completeOutsource(id) {
    const r = await fetch(`${API_BASE}/api/outsource/${id}/complete`, { 
      method: 'POST', 
      headers: this.authHeaders()
    });
    return readApiJson(r, 'Complete failed');
  },

  // 委托单管理API
  async getOrders() {
    const r = await fetch(`${API_BASE}/api/orders`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async getInternalOrderDetails(orderId) {
    const r = await fetch(`${API_BASE}/api/orders/internal/${orderId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async getOutsourceOrderDetails(orderId) {
    const r = await fetch(`${API_BASE}/api/orders/outsource/${orderId}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async updateSettlementStatus(orderId, status) {
    const r = await fetch(`${API_BASE}/api/orders/${orderId}/settlement`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify({ settlement_status: status })
    });
    return readApiJson(r, 'Update failed');
  },

  async getOrderStats() {
    const r = await fetch(`${API_BASE}/api/orders/stats`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async deleteOrder(orderId) {
    const r = await fetch(`${API_BASE}/api/orders/${orderId}`, { 
      method: 'DELETE', 
      headers: this.authHeaders()
    });
    return readApiJson(r, 'Delete failed');
  },

  // 委托单登记表API
  async getCommissionFormData({ q = '', page = 1, pageSize = 100, status, order_id, month_filter, my_items } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    // 支持多个状态筛选（数组或单个值）
    if (status) {
      if (Array.isArray(status)) {
        status.forEach(s => params.append('status', s));
      } else {
        params.set('status', status);
      }
    }
    if (order_id) params.set('order_id', order_id);
    if (month_filter) params.set('month_filter', month_filter);
    if (my_items !== undefined) params.set('my_items', my_items ? 'true' : 'false');
    const r = await fetch(`${API_BASE}/api/commission-form/commission-form?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async getCommissionFormMonthOptions() {
    const r = await fetch(`${API_BASE}/api/commission-form/month-options`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // 平台设备清单API
  async getEquipmentListData({ q = '', page = 1, pageSize = 100, department_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`${API_BASE}/api/commission-form/equipment-list?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // 付款方API
  async listPayers({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`${API_BASE}/api/payers?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  async getPayer(id) {
    const r = await fetch(`${API_BASE}/api/payers/${id}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // 部门API
  async listDepartments({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`${API_BASE}/api/departments?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // 实验室组API
  async listLabGroups({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`${API_BASE}/api/lab-groups?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },

  // statistics
  async getStatisticsSummary({ from, to, jc_prefix } = {}) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (jc_prefix) params.set('jc_prefix', jc_prefix);
    const r = await fetch(`${API_BASE}/api/statistics/summary?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async getJCPrefixes() {
    const r = await fetch(`${API_BASE}/api/statistics/jc-prefixes`, { headers: this.authHeaders() });
    return readApiJson(r, '获取JC号前缀列表失败');
  },
  async exportStatistics({ from, to, jc_prefix } = {}) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (jc_prefix) params.set('jc_prefix', jc_prefix);
    const r = await fetch(`${API_BASE}/api/statistics/export?${params.toString()}`, { headers: this.authHeaders() });
    return throwIfErrorOrReturnBlob(r, 'Export failed');
  },

  // settlements
  async getSettlements() {
    const r = await fetch(`${API_BASE}/api/settlements`, { headers: this.authHeaders() });
    return readApiJson(r, '获取结算记录失败');
  },
  async createSettlement(data) {
    const r = await fetch(`${API_BASE}/api/settlements`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(data)
    });
    return readApiJson(r, '创建结算记录失败');
  },
  async searchCustomersForSettlement(q) {
    const params = new URLSearchParams({ q });
    const r = await fetch(`${API_BASE}/api/settlements/customers/search?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, '搜索客户失败');
  },
  async getSettlementAssignees() {
    const r = await fetch(`${API_BASE}/api/settlements/assignees`, { headers: this.authHeaders() });
    return readApiJson(r, '获取业务人员列表失败');
  },

  // 转单管理API
  async getOrderTransferChain(orderId) {
    const r = await fetch(`${API_BASE}/api/order-transfers/chain/${orderId}`, { headers: this.authHeaders() });
    return readApiJson(r, '获取转单链路失败');
  },

  async createOrderTransfer(data) {
    const r = await fetch(`${API_BASE}/api/order-transfers/create`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(data)
    });
    return readApiJson(r, '创建转单记录失败');
  },

  async searchRelatedOrders(orderId) {
    const r = await fetch(`${API_BASE}/api/order-transfers/search-related/${orderId}`, { headers: this.authHeaders() });
    return readApiJson(r, '搜索相关单号失败');
  }
}
