import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// list
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, status, order_id } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('(ti.category_name LIKE ? OR ti.detail_name LIKE ? OR ti.test_code LIKE ? OR ti.order_id LIKE ?)');
    params.push(like, like, like, like);
  }
  if (status) {
    filters.push('ti.status = ?');
    params.push(status);
  }
  if (order_id) {
    filters.push('ti.order_id = ?');
    params.push(order_id);
  }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT ti.*, u.name AS assignee_name
     FROM test_items ti
     LEFT JOIN users u ON u.user_id = ti.current_assignee
     ${where}
     ORDER BY ti.test_item_id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt FROM test_items ti ${where}`, params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

// create
router.post('/', async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity = 1, unit_price, discount_rate,
    final_unit_price, line_total, machine_hours = 0, work_hours = 0, is_add_on = 0, is_outsourced = 0,
    seq_no, sample_preparation, note, status = 'new', current_assignee
  } = req.body || {};
  if (!order_id || !category_name || !detail_name) {
    return res.status(400).json({ error: 'order_id, category_name, detail_name are required' });
  }
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO test_items (
        order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
        test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
        final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced,
        seq_no, sample_preparation, note, status, current_assignee
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [order_id, price_id || null, category_name, detail_name, sample_name, material, sample_type, original_no,
       test_code, standard_code, department_id || null, group_id || null, quantity, unit_price, discount_rate,
       final_unit_price, line_total, machine_hours, work_hours, Number(is_add_on), Number(is_outsourced),
       seq_no, sample_preparation, note, status, current_assignee || null]
    );
    const [rows] = await pool.query(
      `SELECT ti.*, u.name AS assignee_name FROM test_items ti LEFT JOIN users u ON u.user_id = ti.current_assignee WHERE ti.test_item_id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// read one
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT ti.*, u.name AS assignee_name FROM test_items ti LEFT JOIN users u ON u.user_id = ti.current_assignee WHERE ti.test_item_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// update
router.put('/:id', async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
    final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced,
    seq_no, sample_preparation, note, status, current_assignee
  } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE test_items SET
      order_id = COALESCE(?, order_id),
      price_id = COALESCE(?, price_id),
      category_name = COALESCE(?, category_name),
      detail_name = COALESCE(?, detail_name),
      sample_name = COALESCE(?, sample_name),
      material = COALESCE(?, material),
      sample_type = COALESCE(?, sample_type),
      original_no = COALESCE(?, original_no),
      test_code = COALESCE(?, test_code),
      standard_code = COALESCE(?, standard_code),
      department_id = COALESCE(?, department_id),
      group_id = COALESCE(?, group_id),
      quantity = COALESCE(?, quantity),
      unit_price = COALESCE(?, unit_price),
      discount_rate = COALESCE(?, discount_rate),
      final_unit_price = COALESCE(?, final_unit_price),
      line_total = COALESCE(?, line_total),
      machine_hours = COALESCE(?, machine_hours),
      work_hours = COALESCE(?, work_hours),
      is_add_on = COALESCE(?, is_add_on),
      is_outsourced = COALESCE(?, is_outsourced),
      seq_no = COALESCE(?, seq_no),
      sample_preparation = COALESCE(?, sample_preparation),
      note = COALESCE(?, note),
      status = COALESCE(?, status),
      current_assignee = COALESCE(?, current_assignee)
     WHERE test_item_id = ?`,
    [order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
     test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
     final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced, seq_no,
     sample_preparation, note, status, current_assignee, req.params.id]
  );
  const pool2 = await getPool();
  const [rows] = await pool2.query(
    `SELECT ti.*, u.name AS assignee_name FROM test_items ti LEFT JOIN users u ON u.user_id = ti.current_assignee WHERE ti.test_item_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found after update' });
  res.json(rows[0]);
});

// delete
router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT test_item_id FROM test_items WHERE test_item_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM test_items WHERE test_item_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;


