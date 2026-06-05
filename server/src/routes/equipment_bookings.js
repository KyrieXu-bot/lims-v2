import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import { getIO } from '../socket.js';

const router = Router();
const ALL_ROLES = ['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer'];

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

function emitBookingUpdate(payload) {
  const io = getIO();
  if (io) {
    io.to('equipment-booking').emit('equipment-booking-updated', {
      ...payload,
      timestamp: new Date()
    });
  }
}

async function validateBookingPayload(pool, {
  equipment_id,
  start,
  end,
  order_id,
  test_item_id,
  exclude_booking_id = null
}) {
  if (!equipment_id || !start || !end) {
    return { status: 400, error: 'equipment_id, start_time and end_time are required' };
  }
  if (new Date(start.replace(' ', 'T')).getTime() >= new Date(end.replace(' ', 'T')).getTime()) {
    return { status: 400, error: '预约结束时间必须晚于开始时间' };
  }

  const [equipmentRows] = await pool.query(
    'SELECT equipment_id, status FROM equipment WHERE equipment_id = ? FOR UPDATE',
    [equipment_id]
  );
  if (equipmentRows.length === 0) {
    return { status: 404, error: '设备不存在' };
  }
  if (equipmentRows[0].status && equipmentRows[0].status !== '正常') {
    return { status: 400, error: '该设备当前不可预约' };
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

  return null;
}

router.get('/equipment', async (req, res) => {
  const { q = '', department_id } = req.query;
  const pool = await getPool();
  const params = [];
  const filters = [];

  if (q) {
    const like = `%${q}%`;
    filters.push('(e.equipment_name LIKE ? OR e.equipment_no LIKE ? OR e.model LIKE ? OR e.equipment_label LIKE ?)');
    params.push(like, like, like, like);
  }
  if (department_id) {
    filters.push('e.department_id = ?');
    params.push(department_id);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
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
       ${where}
       ORDER BY d.department_id ASC, e.equipment_name ASC`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/departments', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT department_id, department_name
       FROM departments
       WHERE is_active = 1
       ORDER BY department_id ASC`
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
  const {
    from,
    to,
    equipment_id,
    department_id,
    mine
  } = req.query;
  const pool = await getPool();
  const filters = ["b.status = 'active'"];
  const params = [];

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
  if (mine === 'true' || mine === '1') {
    filters.push('b.booker_id = ?');
    params.push(req.user.user_id);
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
         b.booker_id,
         u.name AS booker_name,
         b.start_time,
         b.end_time,
         b.order_id,
         b.test_item_id,
         ti.category_name,
         ti.detail_name,
         ti.sample_name,
         b.note,
         b.status,
         b.created_at
       FROM equipment_bookings b
       JOIN equipment e ON e.equipment_id = b.equipment_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN users u ON u.user_id = b.booker_id
       LEFT JOIN test_items ti ON ti.test_item_id = b.test_item_id
       WHERE ${filters.join(' AND ')}
       ORDER BY b.start_time ASC, e.equipment_name ASC`,
      params
    );
    res.json({ data: rows });
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
    note
  } = req.body || {};

  const start = toMysqlDateTime(start_time);
  const end = toMysqlDateTime(end_time);
  const pool = await getPool();
  try {
    await pool.query('START TRANSACTION');
    try {
      const validation = await validateBookingPayload(pool, {
        equipment_id,
        start,
        end,
        order_id,
        test_item_id
      });
      if (validation) {
        await pool.query('ROLLBACK');
        return res.status(validation.status).json({ error: validation.error });
      }

      const [result] = await pool.query(
        `INSERT INTO equipment_bookings
          (equipment_id, booker_id, start_time, end_time, order_id, test_item_id, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          equipment_id,
          req.user.user_id,
          start,
          end,
          order_id || null,
          test_item_id || null,
          note || null
        ]
      );
      await pool.query('COMMIT');

      const [rows] = await pool.query(
        `SELECT b.*, e.equipment_name, u.name AS booker_name
         FROM equipment_bookings b
         JOIN equipment e ON e.equipment_id = b.equipment_id
         LEFT JOIN users u ON u.user_id = b.booker_id
         WHERE b.booking_id = ?`,
        [result.insertId]
      );
      emitBookingUpdate({ action: 'created', booking: rows[0] });
      res.status(201).json(rows[0]);
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
    note
  } = req.body || {};

  const start = toMysqlDateTime(start_time);
  const end = toMysqlDateTime(end_time);
  const pool = await getPool();

  try {
    await pool.query('START TRANSACTION');
    try {
      const [bookingRows] = await pool.query(
        'SELECT booking_id, booker_id, status, end_time FROM equipment_bookings WHERE booking_id = ? FOR UPDATE',
        [id]
      );
      if (bookingRows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: '预约不存在' });
      }
      const booking = bookingRows[0];
      if (booking.status !== 'active') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '该预约已取消' });
      }
      if (booking.booker_id !== req.user.user_id) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '只能修改自己的预约' });
      }
      if (new Date(booking.end_time).getTime() < Date.now()) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: '已结束的预约已归档，不能修改' });
      }

      const validation = await validateBookingPayload(pool, {
        equipment_id,
        start,
        end,
        order_id,
        test_item_id,
        exclude_booking_id: id
      });
      if (validation) {
        await pool.query('ROLLBACK');
        return res.status(validation.status).json({ error: validation.error });
      }

      await pool.query(
        `UPDATE equipment_bookings
         SET equipment_id = ?,
             start_time = ?,
             end_time = ?,
             order_id = ?,
             test_item_id = ?,
             note = ?
         WHERE booking_id = ?`,
        [
          equipment_id,
          start,
          end,
          order_id || null,
          test_item_id || null,
          note || null,
          id
        ]
      );
      await pool.query('COMMIT');

      const [rows] = await pool.query(
        `SELECT b.*, e.equipment_name, u.name AS booker_name
         FROM equipment_bookings b
         JOIN equipment e ON e.equipment_id = b.equipment_id
         LEFT JOIN users u ON u.user_id = b.booker_id
         WHERE b.booking_id = ?`,
        [id]
      );
      emitBookingUpdate({ action: 'updated', booking: rows[0] });
      res.json(rows[0]);
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
        return res.status(400).json({ error: '该预约已取消' });
      }
      if (req.user.role !== 'admin' && booking.booker_id !== req.user.user_id) {
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
