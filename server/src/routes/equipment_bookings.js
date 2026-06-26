import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import { getIO } from '../socket.js';

const router = Router();

const ALL_ROLES = ['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer'];
const MICRO_LABELS = ['FIBTEM', 'SEMXRD'];
const MICRO_GROUP_LABEL_BY_ID = {
  4: 'FIBTEM',
  5: 'SEMXRD'
};
const MECHANICS_DEPARTMENT_ID = 3;
const MECHANICS_USER_IDS = ['JC0023', 'JC0101', 'JC0011', 'JC0019', 'JC005'];

router.use(requireAuth, requireAnyRole(ALL_ROLES));

function toMysqlDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    return text.replace('T', ' ').replace('Z', '').slice(0, 19);
  }
  return text.slice(0, 19);
}

function hasRole(user, role) {
  return user?.role === role || (Array.isArray(user?.roles) && user.roles.includes(role));
}

function isAdmin(user) {
  return hasRole(user, 'admin');
}

function isSalesUser(user) {
  return hasRole(user, 'sales') && Number(user.department_id) === 4;
}

function isMicroscopeEmployee(user) {
  return hasRole(user, 'employee') && Number(user.department_id) === 1;
}

function isMicroscopeSupervisor(user) {
  return hasRole(user, 'supervisor') && Boolean(MICRO_GROUP_LABEL_BY_ID[Number(user.group_id)]);
}

function isMechanicsUser(user) {
  return MECHANICS_USER_IDS.includes(String(user?.user_id || ''));
}

function canUseBookingModule(user) {
  return isAdmin(user) || isSalesUser(user) || isMicroscopeEmployee(user) || isMicroscopeSupervisor(user) || isMechanicsUser(user);
}

function getApprovalLabelForUser(user) {
  if (!isMicroscopeSupervisor(user)) return '';
  return MICRO_GROUP_LABEL_BY_ID[Number(user.group_id)] || '';
}

function normalizeLabel(value) {
  return String(value || '').trim().toUpperCase();
}

function isMicroEquipment(equipment) {
  return MICRO_LABELS.includes(normalizeLabel(equipment?.equipment_label));
}

function isMechanicsEquipment(equipment) {
  return Number(equipment?.department_id) === MECHANICS_DEPARTMENT_ID;
}

function requiresApproval(user, equipment) {
  if (isAdmin(user)) return false;
  return isMicroEquipment(equipment);
}

function canUserAccessEquipment(user, equipment) {
  if (isAdmin(user)) return true;
  if (isMechanicsEquipment(equipment)) return isSalesUser(user) || isMechanicsUser(user);
  if (isMicroEquipment(equipment)) {
    const label = normalizeLabel(equipment.equipment_label);
    if (isSalesUser(user) || isMicroscopeEmployee(user)) return true;
    return getApprovalLabelForUser(user) === label;
  }
  return false;
}

function buildEquipmentScope(user, alias = 'e') {
  if (isAdmin(user)) {
    return {
      sql: `((UPPER(${alias}.equipment_label) IN (?, ?)) OR ${alias}.department_id = ?)`,
      params: [...MICRO_LABELS, MECHANICS_DEPARTMENT_ID]
    };
  }

  const parts = [];
  const params = [];

  if (isSalesUser(user)) {
    parts.push(`UPPER(${alias}.equipment_label) IN (?, ?)`);
    params.push(...MICRO_LABELS);
    parts.push(`${alias}.department_id = ?`);
    params.push(MECHANICS_DEPARTMENT_ID);
  } else if (isMicroscopeEmployee(user)) {
    parts.push(`UPPER(${alias}.equipment_label) IN (?, ?)`);
    params.push(...MICRO_LABELS);
  }

  const approvalLabel = getApprovalLabelForUser(user);
  if (approvalLabel) {
    parts.push(`UPPER(${alias}.equipment_label) = ?`);
    params.push(approvalLabel);
  }

  if (isMechanicsUser(user)) {
    parts.push(`${alias}.department_id = ?`);
    params.push(MECHANICS_DEPARTMENT_ID);
  }

  if (parts.length === 0) return null;
  return { sql: `(${parts.join(' OR ')})`, params };
}

function emitBookingUpdate(payload) {
  const io = getIO();
  if (io) {
    io.to('equipment-booking').emit('equipment-booking-updated', {
      ...payload,
      timestamp: new Date()
    });
  }
}

async function getEquipmentForUpdate(pool, equipmentId) {
  const [rows] = await pool.query(
    `SELECT equipment_id, equipment_no, equipment_name, model, department_id, equipment_label, status
     FROM equipment
     WHERE equipment_id = ?
     FOR UPDATE`,
    [equipmentId]
  );
  return rows[0] || null;
}

async function validateReservedUser(pool, reservedUserId) {
  if (!reservedUserId) return null;
  const [rows] = await pool.query(
    `SELECT DISTINCT u.user_id, u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.user_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE u.user_id = ?
       AND u.is_active = 1
       AND r.role_code IN ('employee', 'supervisor')
     LIMIT 1`,
    [reservedUserId]
  );
  return rows[0] || null;
}

async function validateBookingPayload(pool, user, {
  equipment_id,
  start,
  end,
  order_id,
  test_item_id,
  reserved_user_id,
  exclude_booking_id = null
}) {
  if (!canUseBookingModule(user)) {
    return { status: 403, error: '当前账号无权使用设备预约' };
  }
  if (!equipment_id || !start || !end) {
    return { status: 400, error: 'equipment_id, start_time and end_time are required' };
  }
  if (new Date(start.replace(' ', 'T')).getTime() >= new Date(end.replace(' ', 'T')).getTime()) {
    return { status: 400, error: '预约结束时间必须晚于开始时间' };
  }

  const equipment = await getEquipmentForUpdate(pool, equipment_id);
  if (!equipment) {
    return { status: 404, error: '设备不存在' };
  }
  if (!canUserAccessEquipment(user, equipment)) {
    return { status: 403, error: '当前账号无权预约该设备' };
  }
  if (equipment.status && equipment.status !== '正常') {
    return { status: 400, error: '该设备当前不可预约' };
  }

  if (reserved_user_id) {
    const reservedUser = await validateReservedUser(pool, reserved_user_id);
    if (!reservedUser) {
      return { status: 400, error: '预约人必须从实验员/组长列表中选择' };
    }
  }

  if (test_item_id) {
    const [itemRows] = await pool.query(
      'SELECT test_item_id, order_id FROM test_items WHERE test_item_id = ? AND status != ?',
      [test_item_id, 'cancelled']
    );
    if (itemRows.length === 0) {
      return { status: 400, error: '检测项目不存在或已取消' };
    }
    if (order_id && itemRows[0].order_id !== order_id) {
      return { status: 400, error: '检测项目不属于该委托单' };
    }
  }

  const overlapParams = [equipment_id, end, start];
  let excludeSql = '';
  if (exclude_booking_id) {
    excludeSql = ' AND booking_id != ?';
    overlapParams.push(exclude_booking_id);
  }
  const [overlaps] = await pool.query(
    `SELECT booking_id
     FROM equipment_bookings
     WHERE equipment_id = ?
       AND status = 'active'
       AND start_time < ?
       AND end_time > ?
       ${excludeSql}
     LIMIT 1
     FOR UPDATE`,
    overlapParams
  );
  if (overlaps.length > 0) {
    return { status: 409, error: '该时间段已被预约，请选择其他时间' };
  }

  return { equipment };
}

function decorateBookingRows(rows, user) {
  const approvalLabel = getApprovalLabelForUser(user);
  return rows.map((row) => {
    const isApplicant = String(row.booker_id) === String(user.user_id);
    const canApprove =
      !isAdmin(user) &&
      row.status === 'active' &&
      row.approval_status === 'pending' &&
      approvalLabel &&
      normalizeLabel(row.equipment_label) === approvalLabel;
    return {
      ...row,
      applicant_name: row.booker_name,
      can_edit: isAdmin(user) || isApplicant || canApprove,
      can_cancel: isAdmin(user) || isApplicant,
      can_approve: Boolean(canApprove)
    };
  });
}

router.get('/equipment', async (req, res) => {
  if (!canUseBookingModule(req.user)) {
    return res.status(403).json({ error: '当前账号无权使用设备预约' });
  }

  const { q = '', department_id } = req.query;
  const pool = await getPool();
  const params = [];
  const filters = [];
  const scope = buildEquipmentScope(req.user, 'e');
  if (!scope) return res.json({ data: [] });
  filters.push(scope.sql);
  params.push(...scope.params);

  if (q) {
    const like = `%${q}%`;
    filters.push('(e.equipment_name LIKE ? OR e.equipment_no LIKE ? OR e.model LIKE ? OR e.equipment_label LIKE ?)');
    params.push(like, like, like, like);
  }
  if (department_id) {
    filters.push('e.department_id = ?');
    params.push(department_id);
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         e.equipment_id,
         e.equipment_no,
         e.equipment_name,
         e.model,
         e.department_id,
         d.department_name,
         e.equipment_label,
         e.status
       FROM equipment e
       LEFT JOIN departments d ON d.department_id = e.department_id
       WHERE ${filters.join(' AND ')}
       ORDER BY d.department_id ASC, e.equipment_name ASC`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/departments', async (req, res) => {
  if (!canUseBookingModule(req.user)) {
    return res.status(403).json({ error: '当前账号无权使用设备预约' });
  }

  const pool = await getPool();
  const scope = buildEquipmentScope(req.user, 'e');
  if (!scope) return res.json({ data: [] });
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT d.department_id, d.department_name
       FROM equipment e
       JOIN departments d ON d.department_id = e.department_id
       WHERE ${scope.sql}
       ORDER BY d.department_id ASC`,
      scope.params
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/assignees', async (req, res) => {
  if (!canUseBookingModule(req.user)) {
    return res.status(403).json({ error: '当前账号无权使用设备预约' });
  }

  const { q = '', equipment_id } = req.query;
  const pool = await getPool();
  const params = [];
  const filters = ['u.is_active = 1', "r.role_code IN ('employee', 'supervisor')"];

  if (q) {
    const like = `%${q}%`;
    filters.push('(u.name LIKE ? OR u.user_id LIKE ? OR u.account LIKE ?)');
    params.push(like, like, like);
  }

  if (!isAdmin(req.user) && !isSalesUser(req.user)) {
    if (isMechanicsUser(req.user)) {
      filters.push('u.department_id = ?');
      params.push(MECHANICS_DEPARTMENT_ID);
    } else if (isMicroscopeEmployee(req.user) || isMicroscopeSupervisor(req.user)) {
      filters.push('u.department_id = ?');
      params.push(1);
    } else if (equipment_id) {
      const [equipmentRows] = await pool.query(
        'SELECT department_id, equipment_label FROM equipment WHERE equipment_id = ? LIMIT 1',
        [equipment_id]
      );
      const equipment = equipmentRows[0];
      if (equipment && isMechanicsEquipment(equipment)) {
        filters.push('u.department_id = ?');
        params.push(MECHANICS_DEPARTMENT_ID);
      } else {
        filters.push('u.department_id = ?');
        params.push(1);
      }
    } else {
      filters.push('1 = 0');
    }
  }

  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT u.user_id, u.name, u.account, u.department_id, u.group_id, r.role_code
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ${filters.join(' AND ')}
       ORDER BY u.name ASC
       LIMIT 20`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/order/:orderId/test-items', async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT
         ti.test_item_id,
         ti.order_id,
         ti.category_name,
         ti.detail_name,
         ti.sample_name,
         ti.department_id,
         d.department_name,
         ti.status
       FROM test_items ti
       LEFT JOIN departments d ON d.department_id = ti.department_id
       WHERE ti.order_id = ? AND ti.status != 'cancelled'
       ORDER BY ti.test_item_id ASC`,
      [orderId]
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  if (!canUseBookingModule(req.user)) {
    return res.status(403).json({ error: '当前账号无权使用设备预约' });
  }

  const {
    from,
    to,
    equipment_id,
    department_id,
    mine,
    approvals
  } = req.query;
  const pool = await getPool();
  const isMineQuery = mine === 'true' || mine === '1';
  const filters = [isMineQuery ? "b.status IN ('active', 'rejected')" : "b.status = 'active'"];
  const params = [];
  const scope = buildEquipmentScope(req.user, 'e');
  if (!scope) return res.json({ data: [] });
  filters.push(scope.sql);
  params.push(...scope.params);

  if (from) {
    filters.push('b.end_time > ?');
    params.push(toMysqlDateTime(from));
  }
  if (to) {
    filters.push('b.start_time < ?');
    params.push(toMysqlDateTime(to));
  }
  if (equipment_id) {
    filters.push('b.equipment_id = ?');
    params.push(equipment_id);
  }
  if (department_id) {
    filters.push('e.department_id = ?');
    params.push(department_id);
  }
  if (isMineQuery) {
    filters.push('(b.booker_id = ? OR b.reserved_user_id = ?)');
    params.push(req.user.user_id, req.user.user_id);
  }
  if (approvals === 'true' || approvals === '1') {
    const label = getApprovalLabelForUser(req.user);
    if (!label) return res.json({ data: [] });
    filters.push("b.approval_status = 'pending'");
    filters.push('UPPER(e.equipment_label) = ?');
    params.push(label);
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         b.booking_id,
         b.equipment_id,
         e.equipment_name,
         e.equipment_no,
         e.model,
         e.department_id,
         d.department_name,
         e.equipment_label,
         b.booker_id,
         applicant.name AS booker_name,
         b.reserved_user_id,
         reserved.name AS reserved_user_name,
         b.start_time,
         b.end_time,
         b.order_id,
         b.test_item_id,
         ti.category_name,
         ti.detail_name,
         ti.sample_name,
         b.note,
         b.status,
         b.approval_status,
         b.approved_by,
         approver.name AS approved_by_name,
         b.approved_at,
         b.rejection_reason,
         b.created_at
       FROM equipment_bookings b
       JOIN equipment e ON e.equipment_id = b.equipment_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN users applicant ON applicant.user_id = b.booker_id
       LEFT JOIN users reserved ON reserved.user_id = b.reserved_user_id
       LEFT JOIN users approver ON approver.user_id = b.approved_by
       LEFT JOIN test_items ti ON ti.test_item_id = b.test_item_id
       WHERE ${filters.join(' AND ')}
       ORDER BY b.start_time ASC, e.equipment_name ASC`,
      params
    );
    res.json({ data: decorateBookingRows(rows, req.user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const {
    equipment_id,
    start_time,
    end_time,
    order_id,
    test_item_id,
    reserved_user_id,
    note
  } = req.body || {};

  const start = toMysqlDateTime(start_time);
  const end = toMysqlDateTime(end_time);
  const pool = await getPool();
  try {
    await pool.query('START TRANSACTION');
    try {
      const validation = await validateBookingPayload(pool, req.user, {
        equipment_id,
        start,
        end,
        order_id,
        test_item_id,
        reserved_user_id
      });
      if (validation?.error) {
        await pool.query('ROLLBACK');
        return res.status(validation.status).json({ error: validation.error });
      }

      const approvalStatus = requiresApproval(req.user, validation.equipment) ? 'pending' : 'not_required';
      const [result] = await pool.query(
        `INSERT INTO equipment_bookings
          (equipment_id, booker_id, reserved_user_id, start_time, end_time, order_id, test_item_id, note, status, approval_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          equipment_id,
          req.user.user_id,
          reserved_user_id || null,
          start,
          end,
          order_id || null,
          test_item_id || null,
          note || null,
          approvalStatus
        ]
      );
      await pool.query('COMMIT');

      emitBookingUpdate({ action: 'created', booking_id: result.insertId });
      res.status(201).json({ booking_id: result.insertId, approval_status: approvalStatus });
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    equipment_id,
    start_time,
    end_time,
    order_id,
    test_item_id,
    reserved_user_id,
    note
  } = req.body || {};

  const start = toMysqlDateTime(start_time);
  const end = toMysqlDateTime(end_time);
  const pool = await getPool();

  try {
    await pool.query('START TRANSACTION');
    try {
      const [bookingRows] = await pool.query(
        `SELECT b.booking_id, b.booker_id, b.status, b.approval_status, b.end_time,
                e.equipment_label
         FROM equipment_bookings b
         JOIN equipment e ON e.equipment_id = b.equipment_id
         WHERE b.booking_id = ?
         FOR UPDATE`,
        [id]
      );
      if (bookingRows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: '预约不存在' });
      }
      const booking = bookingRows[0];
      const canApprove = getApprovalLabelForUser(req.user) === normalizeLabel(booking.equipment_label);
      const isApplicant = booking.booker_id === req.user.user_id;
      if (booking.status !== 'active') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '该预约已取消或已释放' });
      }
      if (!isAdmin(req.user) && !isApplicant && !canApprove) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '只能修改自己的预约或待审批预约' });
      }
      if (new Date(booking.end_time).getTime() < Date.now()) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '已结束的预约已归档，不能修改' });
      }

      const validation = await validateBookingPayload(pool, req.user, {
        equipment_id,
        start,
        end,
        order_id,
        test_item_id,
        reserved_user_id,
        exclude_booking_id: id
      });
      if (validation?.error) {
        await pool.query('ROLLBACK');
        return res.status(validation.status).json({ error: validation.error });
      }

      let nextApprovalStatus = booking.approval_status;
      if (!isAdmin(req.user) && isApplicant && requiresApproval(req.user, validation.equipment)) {
        nextApprovalStatus = 'pending';
      }
      if (isAdmin(req.user)) {
        nextApprovalStatus = 'not_required';
      }

      await pool.query(
        `UPDATE equipment_bookings
         SET equipment_id = ?,
             reserved_user_id = ?,
             start_time = ?,
             end_time = ?,
             order_id = ?,
             test_item_id = ?,
             note = ?,
             approval_status = ?,
             approved_by = CASE WHEN ? = 'pending' THEN NULL ELSE approved_by END,
             approved_at = CASE WHEN ? = 'pending' THEN NULL ELSE approved_at END,
             rejection_reason = NULL
         WHERE booking_id = ?`,
        [
          equipment_id,
          reserved_user_id || null,
          start,
          end,
          order_id || null,
          test_item_id || null,
          note || null,
          nextApprovalStatus,
          nextApprovalStatus,
          nextApprovalStatus,
          id
        ]
      );
      await pool.query('COMMIT');

      emitBookingUpdate({ action: 'updated', booking_id: Number(id) });
      res.json({ ok: true, approval_status: nextApprovalStatus });
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { reserved_user_id, note } = req.body || {};
  const pool = await getPool();
  try {
    await pool.query('START TRANSACTION');
    try {
      const [rows] = await pool.query(
        `SELECT b.booking_id, b.status, b.approval_status, b.end_time, e.equipment_label
         FROM equipment_bookings b
         JOIN equipment e ON e.equipment_id = b.equipment_id
         WHERE b.booking_id = ?
         FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: '预约不存在' });
      }
      const booking = rows[0];
      if (booking.status !== 'active' || booking.approval_status !== 'pending') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '该预约不在待审批状态' });
      }
      if (getApprovalLabelForUser(req.user) !== normalizeLabel(booking.equipment_label)) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '无权审批该设备预约' });
      }
      if (new Date(booking.end_time).getTime() < Date.now()) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '已结束的预约不能审批' });
      }
      if (reserved_user_id) {
        const reservedUser = await validateReservedUser(pool, reserved_user_id);
        if (!reservedUser) {
          await pool.query('ROLLBACK');
          return res.status(400).json({ error: '预约人必须从实验员/组长列表中选择' });
        }
      }

      await pool.query(
        `UPDATE equipment_bookings
         SET approval_status = 'approved',
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP(3),
             reserved_user_id = COALESCE(?, reserved_user_id),
             note = COALESCE(?, note),
             rejection_reason = NULL
         WHERE booking_id = ?`,
        [req.user.user_id, reserved_user_id || null, note || null, id]
      );
      await pool.query('COMMIT');
      emitBookingUpdate({ action: 'approved', booking_id: Number(id) });
      res.json({ ok: true });
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body || {};
  const pool = await getPool();
  try {
    await pool.query('START TRANSACTION');
    try {
      const [rows] = await pool.query(
        `SELECT b.booking_id, b.status, b.approval_status, e.equipment_label
         FROM equipment_bookings b
         JOIN equipment e ON e.equipment_id = b.equipment_id
         WHERE b.booking_id = ?
         FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: '预约不存在' });
      }
      const booking = rows[0];
      if (booking.status !== 'active' || booking.approval_status !== 'pending') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '该预约不在待审批状态' });
      }
      if (getApprovalLabelForUser(req.user) !== normalizeLabel(booking.equipment_label)) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '无权审批该设备预约' });
      }

      await pool.query(
        `UPDATE equipment_bookings
         SET status = 'rejected',
             approval_status = 'rejected',
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP(3),
             rejection_reason = ?
         WHERE booking_id = ?`,
        [req.user.user_id, reason || null, id]
      );
      await pool.query('COMMIT');
      emitBookingUpdate({ action: 'rejected', booking_id: Number(id) });
      res.json({ ok: true });
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const pool = await getPool();
  try {
    await pool.query('START TRANSACTION');
    try {
      const [rows] = await pool.query(
        'SELECT booking_id, booker_id, status, end_time FROM equipment_bookings WHERE booking_id = ? FOR UPDATE',
        [id]
      );
      if (rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: '预约不存在' });
      }
      const booking = rows[0];
      if (booking.status !== 'active') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '该预约已取消或已释放' });
      }
      if (!isAdmin(req.user) && booking.booker_id !== req.user.user_id) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '只能取消自己的预约' });
      }
      if (new Date(booking.end_time).getTime() < Date.now()) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '已结束的预约已归档，不能取消' });
      }

      await pool.query(
        `UPDATE equipment_bookings
         SET status = 'cancelled', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP(3)
         WHERE booking_id = ?`,
        [req.user.user_id, id]
      );
      await pool.query('COMMIT');
      emitBookingUpdate({ action: 'cancelled', booking_id: Number(id) });
      res.json({ ok: true });
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
