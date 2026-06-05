// 统一的后端 API 根地址
// 优先级：环境变量 > 原生环境检测 > 根据当前页面协议 > 默认值

import { readApiJson, throwIfErrorOrReturnBlob, consumeLoginNotice, shouldReauthOn401, redirectToLoginAfter401 } from './utils/sessionReauth.js';

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

function formatByteLen(n) {
  if (n == null || Number.isNaN(n)) return '';
  const x = Number(n);
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toFixed(1)} MB`;
  return `${(x / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function createMicrographProgressJobId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function readMicrographProgressStream({ jobId, token, onProgress, signal }) {
  if (!jobId || !onProgress || typeof fetch !== 'function') return;
  const r = await fetch(`${getApiBase()}/api/templates/micrograph-word-progress/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!r.ok || !r.body) return;

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .find((part) => part.startsWith('data:'));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        onProgress({
          phase: 'server',
          serverPhase: ev.phase,
          percent: ev.percent ?? null,
          detail: ev.detail || '',
        });
      } catch {
        /* ignore malformed progress chunks */
      }
    }
  }
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

  /**
   * department_id=1：上传显微图片文件夹生成 Word。
   * @param {object} opts
   * @param {File[]} opts.files
   * @param {string} [opts.documentTitle]
   * @param {string} [opts.order_id]
   * @param {Array<string|number>} [opts.test_item_ids]
   * @param {AbortSignal} [opts.signal] 调用 abort() 可中断上传
   * @param {(ev: { phase: 'upload' | 'server'; percent: number | null; detail?: string }) => void} [opts.onProgress] 上传阶段有确定进度；进入服务器后为 server 阶段（无精确百分比）
   */
  generateMicrographWordUpload(opts) {
    const { files, documentTitle, order_id, test_item_ids, onProgress, signal } = opts || {};
    return new Promise((resolve, reject) => {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user?.token) {
        reject(new Error('Not logged in'));
        return;
      }
      const form = new FormData();
      const progressJobId = createMicrographProgressJobId();
      if (documentTitle) form.append('documentTitle', documentTitle);
      if (order_id) form.append('order_id', order_id);
      if (test_item_ids) form.append('test_item_ids', JSON.stringify(test_item_ids));
      form.append('progressJobId', progressJobId);
      for (const file of files) {
        const rel = file.webkitRelativePath || file.name;
        form.append('files', file, rel);
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getApiBase()}/api/templates/generate-micrograph-word-upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);
      xhr.responseType = 'blob';
      const progressAc = new AbortController();

      readMicrographProgressStream({
        jobId: progressJobId,
        token: user.token,
        onProgress,
        signal: progressAc.signal,
      }).catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('显微导出进度连接中断:', err);
        }
      });

      const detachAbort = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        progressAc.abort();
      };
      const onAbort = () => {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        progressAc.abort();
      };

      if (signal) {
        if (signal.aborted) {
          reject(new Error('已取消上传'));
          return;
        }
        signal.addEventListener('abort', onAbort);
      }

      xhr.upload.onprogress = (ev) => {
        if (!onProgress) return;
        if (ev.lengthComputable && ev.total > 0) {
          const percent = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
          onProgress({ phase: 'upload', percent, detail: `${formatByteLen(ev.loaded)} / ${formatByteLen(ev.total)}` });
        } else {
          onProgress({ phase: 'upload', percent: null, detail: '正在读取本地文件…' });
        }
      };

      xhr.upload.onload = () => {
        onProgress?.({ phase: 'server', percent: null, detail: '已上传完毕，服务器正在解析目录并生成 Word…' });
      };

      xhr.onload = () => {
        detachAbort();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
          return;
        }
        (async () => {
          let message = `导出显微报告失败 (${xhr.status})`;
          try {
            const text = xhr.response instanceof Blob ? await xhr.response.text() : '';
            if (text) {
              const data = JSON.parse(text);
              message = data.error || message;
              if (xhr.status === 401 && shouldReauthOn401(data)) {
                redirectToLoginAfter401(message);
              }
            }
          } catch {
            /* ignore */
          }
          reject(new Error(message));
        })();
      };

      xhr.onerror = () => {
        detachAbort();
        reject(new Error('网络错误，上传中断'));
      };
      xhr.onabort = () => {
        detachAbort();
        reject(new Error('已取消上传'));
      };

      onProgress?.({ phase: 'upload', percent: 0, detail: '准备上传…' });
      xhr.send(form);
    });
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

  // equipment bookings
  async listBookingDepartments() {
    const r = await fetch(`${API_BASE}/api/equipment-bookings/departments`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async listBookingEquipment({ q = '', department_id = '' } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (department_id) params.set('department_id', department_id);
    const r = await fetch(`${API_BASE}/api/equipment-bookings/equipment?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async listEquipmentBookings({ from = '', to = '', equipment_id = '', department_id = '', mine = false } = {}) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (equipment_id) params.set('equipment_id', equipment_id);
    if (department_id) params.set('department_id', department_id);
    if (mine) params.set('mine', 'true');
    const r = await fetch(`${API_BASE}/api/equipment-bookings?${params.toString()}`, { headers: this.authHeaders() });
    return readApiJson(r, 'Fetch failed');
  },
  async createEquipmentBooking(payload) {
    const r = await fetch(`${API_BASE}/api/equipment-bookings`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
    return readApiJson(r, 'Create failed');
  },
  async updateEquipmentBooking(id, payload) {
    const r = await fetch(`${API_BASE}/api/equipment-bookings/${id}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
    return readApiJson(r, 'Update failed');
  },
  async cancelEquipmentBooking(id) {
    const r = await fetch(`${API_BASE}/api/equipment-bookings/${id}/cancel`, {
      method: 'POST',
      headers: this.authHeaders()
    });
    return readApiJson(r, 'Cancel failed');
  },
  async getBookingOrderTestItems(orderId) {
    const r = await fetch(`${API_BASE}/api/equipment-bookings/order/${encodeURIComponent(orderId)}/test-items`, { headers: this.authHeaders() });
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
  async getCommissionFormData({ q = '', page = 1, pageSize = 100, status, order_id, order_ids, month_filter, my_items } = {}) {
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
    if (Array.isArray(order_ids)) {
      order_ids.forEach(id => params.append('order_ids', id));
    }
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
  },

  /** 报告管理（管理员 / 只读 viewer） */
  async listReportsManagement({ q = '', page = 1, pageSize = 20, seal = [], report_type = [] } = {}) {
    const params = new URLSearchParams();
    params.set('q', q);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    const sealArr = Array.isArray(seal) ? seal : seal ? [seal] : [];
    sealArr.forEach((s) => params.append('seal', s));
    const typeArr = Array.isArray(report_type) ? report_type : report_type ? [report_type] : [];
    typeArr.forEach((t) => params.append('report_type', String(t)));
    const r = await fetch(`${API_BASE}/api/reports-management?${params.toString()}`, { headers: this.authHeaders() });
    const data = await readApiJson(r, '获取报告列表失败');
    // 生产环境若 /api 未代理到 Node，常返回 200 + index.html；readApiJson 会得到 { error: '<!DOCTYPE...' }，易误判为「暂无数据」
    if (!Array.isArray(data.data)) {
      const errStr = typeof data.error === 'string' ? data.error : '';
      const looksLikeHtml =
        errStr.includes('<!DOCTYPE') || errStr.includes('<html') || errStr.includes('<HTML');
      if (looksLikeHtml) {
        throw new Error(
          '接口返回了网页而非 JSON，无法加载报告列表。请检查：① Nginx/网关是否将 /api 反向代理到 Node 服务；② 生产 Node 是否已部署含「报告管理」接口的最新代码并已重启；③ 在 Network 中点开该请求查看 Response 是否为 JSON。'
        );
      }
      throw new Error(data.error || '报告列表接口返回格式异常（缺少 data 数组）');
    }
    return data;
  },

  async updateReportManagement(orderId, payload) {
    const r = await fetch(`${API_BASE}/api/reports-management/${encodeURIComponent(orderId)}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    });
    return readApiJson(r, '更新报告信息失败');
  }
}
