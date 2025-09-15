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
  }
}
