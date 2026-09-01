import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
const VIEW_ROLES = ['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer'];
const TERMINAL_ACTIONS = new Set(['stored', 'returned', 'disposed']);
const EVENT_TYPES = new Set(['received', 'transferred', ...TERMINAL_ACTIONS]);

router.use(requireAuth, requireAnyRole(VIEW_ROLES));

function normalizeToken(value) {
  const token = String(value || '').trim();
  return /^SF_[A-Za-z0-9_-]{12,60}$/.test(token) ? token : '';
}

function canOperate(user) {
  const roles = new Set([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])]);
  return roles.has('admin') || roles.has('leader');
}

function isAdmin(user) {
  return user?.role === 'admin' || user?.roles?.includes?.('admin');
}

function normalizeDepartmentId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getRequestByToken(conn, token) {
  const [rows] = await conn.query(
    `SELECT request_id, status AS request_status, approved_order_id AS order_id,
            sample_flow_token, updated_at AS request_updated_at
       FROM order_requests
      WHERE sample_flow_token = ?`,
    [token]
  );
  return rows[0] || null;
}

async function getItems(conn, orderId) {
  const [rows] = await conn.query(
    `SELECT ti.test_item_id, ti.category_name, ti.detail_name, ti.sample_name,
            ti.material, ti.original_no, ti.quantity, ti.unit, ti.department_id,
            d.department_name, ti.seq_no
       FROM test_items ti
       LEFT JOIN departments d ON d.department_id = ti.department_id
      WHERE ti.order_id = ? AND ti.status <> 'cancelled'
      ORDER BY COALESCE(ti.seq_no, 2147483647), ti.test_item_id`,
    [orderId]
  );
  return rows;
}

async function getFlow(conn, token) {
  const [rows] = await conn.query(
    `SELECT sf.*, d.department_name AS current_department_name
       FROM sample_flows sf
       LEFT JOIN departments d ON d.department_id = sf.current_department_id
      WHERE sf.sample_flow_token = ?`,
    [token]
  );
  return rows[0] || null;
}

async function getEvents(conn, flowId) {
  if (!flowId) return [];
  const [rows] = await conn.query(
    `SELECT sfe.event_id, sfe.sequence_no, sfe.event_type, sfe.department_id,
            d.department_name, sfe.operator_id,
            COALESCE(u.name, sfe.operator_id) AS operator_name,
            sfe.notes, sfe.created_at
       FROM sample_flow_events sfe
       LEFT JOIN departments d ON d.department_id = sfe.department_id
       LEFT JOIN users u ON u.user_id = sfe.operator_id
      WHERE sfe.flow_id = ?
      ORDER BY sfe.sequence_no`,
    [flowId]
  );
  return rows;
}

function buildPayload({ request, items, flow, events, user }) {
  const departments = [];
  const seen = new Set();
  for (const item of items) {
    const departmentId = normalizeDepartmentId(item.department_id);
    if (!departmentId || seen.has(departmentId)) continue;
    seen.add(departmentId);
    departments.push({
      department_id: departmentId,
      department_name: item.department_name || `部门 ${departmentId}`,
      item_count: items.filter((candidate) => Number(candidate.department_id) === departmentId).length,
    });
  }

  const visitedIds = new Set(
    events
      .filter((event) => event.event_type === 'received' || event.event_type === 'transferred')
      .map((event) => normalizeDepartmentId(event.department_id))
      .filter(Boolean)
  );
  const pendingDepartments = departments.filter((department) => !visitedIds.has(department.department_id));
  const status = flow?.current_status || 'pending';

  return {
    token: request.sample_flow_token,
    request_id: request.request_id,
    order_id: request.order_id,
    request_status: request.request_status,
    status,
    current_department_id: flow?.current_department_id || null,
    current_department_name: flow?.current_department_name || null,
    item_count: items.length,
    items,
    required_departments: departments,
    visited_department_ids: [...visitedIds],
    pending_departments: pendingDepartments,
    terminal_ready: events.length > 0 && pendingDepartments.length === 0 && !TERMINAL_ACTIONS.has(status),
    events,
    permissions: {
      can_operate: canOperate(user),
      is_admin: isAdmin(user),
      user_department_id: normalizeDepartmentId(user?.department_id),
    },
  };
}

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));
  const filters = ["r.status = 'approved'", 'r.sample_flow_token IS NOT NULL'];
  const params = [];
  if (q) {
    filters.push('(r.approved_order_id LIKE ? OR r.sample_flow_token LIKE ? OR EXISTS (SELECT 1 FROM test_items tiq WHERE tiq.order_id = r.approved_order_id AND (tiq.sample_name LIKE ? OR tiq.original_no LIKE ?)))');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    if (status === 'pending') filters.push("COALESCE(sf.current_status, 'pending') = 'pending'");
    else {
      filters.push('sf.current_status = ?');
      params.push(status);
    }
  }
  const where = filters.join(' AND ');
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT r.sample_flow_token AS token, r.approved_order_id AS order_id,
              COALESCE(sf.current_status, 'pending') AS status,
              sf.current_department_id, d.department_name AS current_department_name,
              sf.updated_at,
              (SELECT COUNT(*) FROM test_items ti WHERE ti.order_id = r.approved_order_id AND ti.status <> 'cancelled') AS item_count,
              (SELECT COUNT(*) FROM sample_flow_events sfe WHERE sfe.flow_id = sf.flow_id) AS event_count
         FROM order_requests r
         LEFT JOIN sample_flows sf ON sf.sample_flow_token = r.sample_flow_token
         LEFT JOIN departments d ON d.department_id = sf.current_department_id
        WHERE ${where}
        ORDER BY COALESCE(sf.updated_at, r.updated_at) DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM order_requests r
         LEFT JOIN sample_flows sf ON sf.sample_flow_token = r.sample_flow_token
        WHERE ${where}`,
      params
    );
    res.json({ data: rows, total: Number(countRows[0]?.total || 0), page, pageSize });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:token', async (req, res) => {
  const token = normalizeToken(req.params.token);
  if (!token) return res.status(400).json({ error: '样品流转 token 格式不正确' });
  const pool = await getPool();
  try {
    const request = await getRequestByToken(pool, token);
    if (!request) return res.status(404).json({ error: '未找到该二维码对应的委托单' });
    if (request.request_status !== 'approved' || !request.order_id) {
      return res.status(409).json({ error: '该委托单尚未完成审批，暂不能登记样品流转' });
    }
    const [items, flow] = await Promise.all([getItems(pool, request.order_id), getFlow(pool, token)]);
    if (!items.length) return res.status(409).json({ error: '该委托单没有可流转的检测项目' });
    const events = await getEvents(pool, flow?.flow_id);
    res.json(buildPayload({ request, items, flow, events, user: req.user }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:token/events', async (req, res) => {
  const token = normalizeToken(req.params.token);
  const eventType = String(req.body?.event_type || '').trim();
  const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;
  if (!token) return res.status(400).json({ error: '样品流转 token 格式不正确' });
  if (!EVENT_TYPES.has(eventType)) return res.status(400).json({ error: '不支持的流转操作' });
  if (!canOperate(req.user)) return res.status(403).json({ error: '只有室主任或管理员可以登记样品流转' });

  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const request = await getRequestByToken(conn, token);
    if (!request || request.request_status !== 'approved' || !request.order_id) {
      await conn.rollback();
      return res.status(404).json({ error: '未找到可流转的正式委托单' });
    }
    const items = await getItems(conn, request.order_id);
    if (!items.length) {
      await conn.rollback();
      return res.status(409).json({ error: '该委托单没有可流转的检测项目' });
    }

    let departmentId = isAdmin(req.user)
      ? normalizeDepartmentId(req.body?.department_id)
      : normalizeDepartmentId(req.user?.department_id);
    const requiredDepartmentIds = new Set(items.map((item) => normalizeDepartmentId(item.department_id)).filter(Boolean));
    if ((eventType === 'received' || eventType === 'transferred') && !departmentId) {
      await conn.rollback();
      return res.status(400).json({ error: '无法确定本次扫码所属实验室' });
    }
    if ((eventType === 'received' || eventType === 'transferred') && !requiredDepartmentIds.has(departmentId)) {
      await conn.rollback();
      return res.status(403).json({ error: '该委托单没有属于当前实验室的检测项目' });
    }

    await conn.query(
      `INSERT INTO sample_flows
        (sample_flow_token, request_id, order_id, current_status, current_department_id)
       VALUES (?, ?, ?, 'pending', NULL)
       ON DUPLICATE KEY UPDATE flow_id = LAST_INSERT_ID(flow_id)`,
      [token, request.request_id, request.order_id]
    );
    const [flowRows] = await conn.query('SELECT * FROM sample_flows WHERE sample_flow_token = ? FOR UPDATE', [token]);
    const flow = flowRows[0];
    const events = await getEvents(conn, flow.flow_id);
    const terminal = TERMINAL_ACTIONS.has(flow.current_status);
    if (terminal) {
      await conn.rollback();
      return res.status(409).json({ error: '该样品流转已经结束，不能继续登记' });
    }
    if (eventType === 'received' && events.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: '该样品已经完成收样，请登记后续流转' });
    }
    if (eventType !== 'received' && events.length === 0) {
      await conn.rollback();
      return res.status(409).json({ error: '请先完成收样登记' });
    }

    const visitedDepartmentIds = new Set(
      events
        .filter((event) => event.event_type === 'received' || event.event_type === 'transferred')
        .map((event) => normalizeDepartmentId(event.department_id))
        .filter(Boolean)
    );
    if (eventType === 'transferred' && visitedDepartmentIds.has(departmentId)) {
      await conn.rollback();
      return res.status(409).json({ error: '当前实验室已经登记过，无需重复添加节点' });
    }
    const pendingDepartmentIds = [...requiredDepartmentIds].filter((id) => !visitedDepartmentIds.has(id));
    if (TERMINAL_ACTIONS.has(eventType) && pendingDepartmentIds.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: '仍有检测项目尚未流转到对应实验室，暂不能结束流程' });
    }

    const sequenceNo = events.length + 1;
    await conn.query(
      `INSERT INTO sample_flow_events
        (flow_id, sequence_no, event_type, department_id, operator_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [flow.flow_id, sequenceNo, eventType, departmentId || flow.current_department_id || null, req.user.user_id || req.user.sub, notes]
    );
    const nextStatus = TERMINAL_ACTIONS.has(eventType) ? eventType : 'in_progress';
    const nextDepartmentId = departmentId || flow.current_department_id || null;
    await conn.query(
      `UPDATE sample_flows
          SET current_status = ?, current_department_id = ?
        WHERE flow_id = ?`,
      [nextStatus, nextDepartmentId, flow.flow_id]
    );
    if (eventType === 'received') {
      await conn.query(
        `UPDATE test_items SET sample_arrival_status = 'arrived' WHERE order_id = ? AND status <> 'cancelled'`,
        [request.order_id]
      );
    }
    await conn.commit();

    const [freshFlow, freshEvents] = await Promise.all([getFlow(pool, token), getEvents(pool, flow.flow_id)]);
    res.status(201).json(buildPayload({ request, items, flow: freshFlow, events: freshEvents, user: req.user }));
  } catch (error) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

export default router;
