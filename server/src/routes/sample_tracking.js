import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// 获取样品追踪列表
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, status, lab_type, order_id } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  // 搜索条件
  if (q) {
    filters.push('(st.order_id LIKE ? OR st.sample_name LIKE ? OR st.material LIKE ? OR st.original_no LIKE ?)');
    params.push(like, like, like, like);
  }

  // 状态筛选
  if (status) {
    filters.push('st.current_status = ?');
    params.push(status);
  }

  // 实验室类型筛选
  if (lab_type) {
    filters.push('st.lab_type = ?');
    params.push(lab_type);
  }

  // 委托单号筛选
  if (order_id) {
    filters.push('st.order_id = ?');
    params.push(order_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT st.*, 
              ti.detail_name,
              ti.test_code,
              ti.quantity,
              ti.unit_price,
              u1.name AS received_by_name,
              u2.name AS testing_completed_by_name,
              u3.name AS returned_by_name
       FROM sample_tracking st
       LEFT JOIN test_items ti ON ti.test_item_id = st.test_item_id
       LEFT JOIN users u1 ON u1.user_id = st.received_by
       LEFT JOIN users u2 ON u2.user_id = st.testing_completed_by
       LEFT JOIN users u3 ON u3.user_id = st.returned_by
       ${where}
       ORDER BY st.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM sample_tracking st ${where}`,
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 根据委托单号和大类分组获取样品
router.get('/grouped', async (req, res) => {
  const { q = '', lab_type } = req.query;
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('(st.order_id LIKE ? OR st.sample_name LIKE ? OR st.material LIKE ?)');
    params.push(like, like, like);
  }

  if (lab_type) {
    filters.push('st.lab_type = ?');
    params.push(lab_type);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT st.order_id, st.category_name, st.lab_type,
              COUNT(*) as item_count,
              GROUP_CONCAT(DISTINCT st.current_status) as statuses,
              MIN(st.received_at) as first_received,
              MAX(st.updated_at) as last_updated
       FROM sample_tracking st
       ${where}
       GROUP BY st.order_id, st.category_name, st.lab_type
       ORDER BY st.order_id DESC, st.category_name`,
      params
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 扫码操作 - 样品接收
router.post('/receive', async (req, res) => {
  const { barcode, lab_type, notes } = req.body;
  const user = req.user;

  if (!barcode || !lab_type) {
    return res.status(400).json({ error: 'barcode and lab_type are required' });
  }

  const pool = await getPool();
  try {
    // 根据barcode查找test_item_id
    const [testItems] = await pool.query(
      'SELECT test_item_id, order_id, category_name, sample_name, material, original_no FROM test_items WHERE test_item_id = ?',
      [barcode]
    );

    if (testItems.length === 0) {
      return res.status(404).json({ error: 'Test item not found' });
    }

    const testItem = testItems[0];

    // 检查是否已经接收过
    const [existing] = await pool.query(
      'SELECT tracking_id FROM sample_tracking WHERE test_item_id = ? AND current_status = "received"',
      [testItem.test_item_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Sample already received' });
    }

    // 创建样品追踪记录
    const [result] = await pool.query(
      `INSERT INTO sample_tracking 
       (test_item_id, order_id, category_name, sample_name, material, original_no, barcode, 
        current_status, lab_type, received_by, received_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, NOW(), ?)`,
      [testItem.test_item_id, testItem.order_id, testItem.category_name, testItem.sample_name,
       testItem.material, testItem.original_no, barcode, lab_type, user.user_id, notes]
    );

    res.json({ 
      success: true, 
      message: '样品接收成功',
      tracking_id: result.insertId,
      test_item: testItem
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 扫码操作 - 检测完成
router.post('/testing-completed', async (req, res) => {
  const { barcode, notes } = req.body;
  const user = req.user;

  if (!barcode) {
    return res.status(400).json({ error: 'barcode is required' });
  }

  const pool = await getPool();
  try {
    // 查找样品追踪记录
    const [trackings] = await pool.query(
      'SELECT * FROM sample_tracking WHERE barcode = ? AND current_status = "received"',
      [barcode]
    );

    if (trackings.length === 0) {
      return res.status(404).json({ error: 'Sample not found or not received' });
    }

    const tracking = trackings[0];

    // 更新状态为检测完成
    await pool.query(
      `UPDATE sample_tracking 
       SET current_status = 'testing_completed', 
           testing_completed_by = ?, 
           testing_completed_at = NOW(),
           notes = CONCAT(IFNULL(notes, ''), IFNULL(?, ''))
       WHERE tracking_id = ?`,
      [user.user_id, notes ? `\n检测完成备注: ${notes}` : '', tracking.tracking_id]
    );

    res.json({ 
      success: true, 
      message: '检测完成登记成功',
      tracking: tracking
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 扫码操作 - 样品回收
router.post('/return', async (req, res) => {
  const { barcode, notes } = req.body;
  const user = req.user;

  if (!barcode) {
    return res.status(400).json({ error: 'barcode is required' });
  }

  const pool = await getPool();
  try {
    // 查找样品追踪记录
    const [trackings] = await pool.query(
      'SELECT * FROM sample_tracking WHERE barcode = ? AND current_status = "testing_completed"',
      [barcode]
    );

    if (trackings.length === 0) {
      return res.status(404).json({ error: 'Sample not found or not completed testing' });
    }

    const tracking = trackings[0];

    // 更新状态为已回收
    await pool.query(
      `UPDATE sample_tracking 
       SET current_status = 'returned', 
           returned_by = ?, 
           returned_at = NOW(),
           notes = CONCAT(IFNULL(notes, ''), IFNULL(?, ''))
       WHERE tracking_id = ?`,
      [user.user_id, notes ? `\n回收备注: ${notes}` : '', tracking.tracking_id]
    );

    res.json({ 
      success: true, 
      message: '样品回收成功',
      tracking: tracking
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取单个样品追踪详情
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT st.*, 
              ti.detail_name, ti.test_code, ti.quantity, ti.unit_price,
              u1.name AS received_by_name,
              u2.name AS testing_completed_by_name,
              u3.name AS returned_by_name
       FROM sample_tracking st
       LEFT JOIN test_items ti ON ti.test_item_id = st.test_item_id
       LEFT JOIN users u1 ON u1.user_id = st.received_by
       LEFT JOIN users u2 ON u2.user_id = st.testing_completed_by
       LEFT JOIN users u3 ON u3.user_id = st.returned_by
       WHERE st.tracking_id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sample tracking not found' });
    }

    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
