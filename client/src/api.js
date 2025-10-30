export const api = {
  // auth
  async login(username, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Login failed');
    return r.json();
  },
  async generateWHReport({ order_id, test_item_ids }) {
    const r = await fetch('/api/templates/generate-wh-report', {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ order_id, test_item_ids })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Export failed');
    const blob = await r.blob();
    return blob;
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
    const r = await fetch(`/api/customers?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async salesOptions() {
    const r = await fetch('/api/customers/sales-options', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async customersOptions() {
    const r = await fetch('/api/customers/options', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getCustomer(id) {
    const r = await fetch(`/api/customers/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async createCustomer(payload) {
    const r = await fetch('/api/customers', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
    return r.json();
  },
  async updateCustomer(id, payload) {
    const r = await fetch(`/api/customers/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async deleteCustomer(id) {
    const r = await fetch(`/api/customers/${id}`, { method:'DELETE', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  },

  // payers
  async listPayers({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`/api/payers?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async payersOptions() {
    const r = await fetch('/api/payers/options', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getPayer(id) {
    const r = await fetch(`/api/payers/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async createPayer(payload) {
    const r = await fetch('/api/payers', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
    return r.json();
  },
  async updatePayer(id, payload) {
    const r = await fetch(`/api/payers/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async deletePayer(id) {
    const r = await fetch(`/api/payers/${id}`, { method:'DELETE', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  },

  // commissioners
  async listCommissioners({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`/api/commissioners?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getCommissioner(id) {
    const r = await fetch(`/api/commissioners/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async createCommissioner(payload) {
    const r = await fetch('/api/commissioners', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
    return r.json();
  },
  async updateCommissioner(id, payload) {
    const r = await fetch(`/api/commissioners/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async deleteCommissioner(id) {
    const r = await fetch(`/api/commissioners/${id}`, { method:'DELETE', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  }
  ,
  // test items (检测项目处理)
  async listTestItems({ q = '', page = 1, pageSize = 20, status, order_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (status) params.set('status', status);
    if (order_id) params.set('order_id', order_id);
    const r = await fetch(`/api/test-items?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getTestItem(id) {
    const r = await fetch(`/api/test-items/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async createTestItem(payload) {
    const r = await fetch('/api/test-items', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
    return r.json();
  },
  async updateTestItem(id, payload) {
    const r = await fetch(`/api/test-items/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async deleteTestItem(id) {
    const r = await fetch(`/api/test-items/${id}`, { method:'DELETE', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  },
  async batchAssignTestItems(payload) {
    const r = await fetch('/api/test-items/batch-assign', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Batch assign failed');
    return r.json();
  },
  async cancelTestItem(id) {
    const r = await fetch(`/api/test-items/${id}/cancel`, { method:'POST', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Cancel failed');
    return r.json();
  },
  async getSupervisorsByDepartment(departmentId) {
    const r = await fetch(`/api/users/supervisors?department_id=${departmentId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getEmployeesByGroup(groupId) {
    const r = await fetch(`/api/users/employees?group_id=${groupId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getDepartmentIdByGroupId(groupId) {
    const r = await fetch(`/api/users/department-by-group?group_id=${groupId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getBusinessStaff({ q = '' } = {}) {
    const params = new URLSearchParams({ q });
    const r = await fetch(`/api/users/business-staff?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getAllSupervisors({ q = '' } = {}) {
    const params = new URLSearchParams({ q });
    const r = await fetch(`/api/users/all-supervisors?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getAllEmployees({ q = '' } = {}) {
    const params = new URLSearchParams({ q });
    const r = await fetch(`/api/users/all-employees?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // orders (委托单)
  async listOrders({ q = '', page = 1, pageSize = 20 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`/api/orders?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getOrder(id) {
    const r = await fetch(`/api/orders/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  // price (test items catalog)
  async listPrice({ q = '', page = 1, pageSize = 20, is_active } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') params.set('is_active', is_active);
    const r = await fetch(`/api/price?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getPrice(id) {
    const r = await fetch(`/api/price/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async createPrice(payload) {
    const r = await fetch('/api/price', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
    return r.json();
  },
  async updatePrice(id, payload) {
    const r = await fetch(`/api/price/${id}`, { method:'PUT', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async deletePrice(id) {
    const r = await fetch(`/api/price/${id}`, { method:'DELETE', headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  },

  // equipment
  async listEquipment({ q = '', page = 1, pageSize = 50, department_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`/api/equipment?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getEquipmentByDepartment(departmentId) {
    const r = await fetch(`/api/equipment/by-department?department_id=${departmentId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getEquipment(id) {
    const r = await fetch(`/api/equipment/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // sample tracking
  async listSampleTracking({ q = '', page = 1, pageSize = 20, status, lab_type, order_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (status) params.set('status', status);
    if (lab_type) params.set('lab_type', lab_type);
    if (order_id) params.set('order_id', order_id);
    const r = await fetch(`/api/sample-tracking?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async getSampleTrackingGrouped({ q = '', lab_type } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (lab_type) params.set('lab_type', lab_type);
    const r = await fetch(`/api/sample-tracking/grouped?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },
  async receiveSample(payload) {
    const r = await fetch('/api/sample-tracking/receive', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Receive failed');
    return r.json();
  },
  async completeTesting(payload) {
    const r = await fetch('/api/sample-tracking/testing-completed', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Complete testing failed');
    return r.json();
  },
  async returnSample(payload) {
    const r = await fetch('/api/sample-tracking/return', { method:'POST', headers: this.authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json()).error || 'Return failed');
    return r.json();
  },
  async getSampleTracking(id) {
    const r = await fetch(`/api/sample-tracking/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 委外管理API
  async getOutsourceItems() {
    const r = await fetch('/api/outsource', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  async updateOutsourceInfo(id, data) {
    const r = await fetch(`/api/outsource/${id}`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },

  async uploadOutsourceReport(id, reportPath) {
    const r = await fetch(`/api/outsource/${id}/report`, { 
      method: 'POST', 
      headers: this.authHeaders(),
      body: JSON.stringify({ report_path: reportPath })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Upload failed');
    return r.json();
  },

  async updateTrackingNumber(id, trackingNumber) {
    const r = await fetch(`/api/outsource/${id}/tracking`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify({ return_tracking_number: trackingNumber })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },

  async completeOutsource(id) {
    const r = await fetch(`/api/outsource/${id}/complete`, { 
      method: 'POST', 
      headers: this.authHeaders()
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Complete failed');
    return r.json();
  },

  // 委托单管理API
  async getOrders() {
    const r = await fetch('/api/orders', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  async getInternalOrderDetails(orderId) {
    const r = await fetch(`/api/orders/internal/${orderId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  async getOutsourceOrderDetails(orderId) {
    const r = await fetch(`/api/orders/outsource/${orderId}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  async updateSettlementStatus(orderId, status) {
    const r = await fetch(`/api/orders/${orderId}/settlement`, { 
      method: 'PUT', 
      headers: this.authHeaders(),
      body: JSON.stringify({ settlement_status: status })
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },

  async getOrderStats() {
    const r = await fetch('/api/orders/stats', { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 委托单登记表API
  async getCommissionFormData({ q = '', page = 1, pageSize = 100, status, order_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (status) params.set('status', status);
    if (order_id) params.set('order_id', order_id);
    const r = await fetch(`/api/commission-form/commission-form?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 平台设备清单API
  async getEquipmentListData({ q = '', page = 1, pageSize = 100, department_id } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`/api/commission-form/equipment-list?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 付款方API
  async listPayers({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`/api/payers?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  async getPayer(id) {
    const r = await fetch(`/api/payers/${id}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 部门API
  async listDepartments({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`/api/departments?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  },

  // 实验室组API
  async listLabGroups({ q = '', page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ q, page, pageSize });
    const r = await fetch(`/api/lab-groups?${params.toString()}`, { headers: this.authHeaders() });
    if (!r.ok) throw new Error((await r.json()).error || 'Fetch failed');
    return r.json();
  }
}
