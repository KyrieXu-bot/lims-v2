import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// options for selects
router.get('/options', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT price_id, category_name, detail_name FROM price WHERE is_active = 1 ORDER BY category_name, detail_name`
  );
  res.json(rows);
});

// list
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(category_name LIKE ? OR detail_name LIKE ? OR test_code LIKE ? OR standard_code LIKE ?)');
  params.push(like, like, like, like);
  if (is_active === '0' || is_active === '1') {
    filters.push('is_active = ?');
    params.push(Number(is_active));
  }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT * FROM price ${where} ORDER BY price_id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(`SELECT COUNT(*) as cnt FROM price ${where}`, params);
  res.json({ data: rows, total: cnt[0].cnt });
});

// create
router.post('/', async (req, res) => {
  const { category_name, detail_name, test_code, standard_code, department_id, group_id,
          unit_price, is_outsourced = 0, is_active = 1, note, active_from, active_to } = req.body || {};
  if (!category_name || !detail_name || unit_price == null) {
    return res.status(400).json({ error: 'category_name, detail_name, unit_price are required' });
  }
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO price (category_name, detail_name, test_code, standard_code, department_id, group_id,
                          unit_price, is_outsourced, is_active, note, active_from, active_to)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [category_name, detail_name, test_code, standard_code, department_id || null, group_id || null,
       unit_price, Number(is_outsourced), Number(is_active), note, active_from || null, active_to || null]
    );
    const [rows] = await pool.query('SELECT * FROM price WHERE price_id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// read one
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query('SELECT * FROM price WHERE price_id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// update
router.put('/:id', async (req, res) => {
  const { category_name, detail_name, test_code, standard_code, department_id, group_id,
          unit_price, is_outsourced, is_active, note, active_from, active_to } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE price SET
      category_name = COALESCE(?, category_name),
      detail_name = COALESCE(?, detail_name),
      test_code = COALESCE(?, test_code),
      standard_code = COALESCE(?, standard_code),
      department_id = COALESCE(?, department_id),
      group_id = COALESCE(?, group_id),
      unit_price = COALESCE(?, unit_price),
      is_outsourced = COALESCE(?, is_outsourced),
      is_active = COALESCE(?, is_active),
      note = COALESCE(?, note),
      active_from = COALESCE(?, active_from),
      active_to = COALESCE(?, active_to)
     WHERE price_id = ?`,
    [category_name, detail_name, test_code, standard_code, department_id, group_id,
     unit_price, is_outsourced, is_active, note, active_from, active_to, req.params.id]
  );
  const [rows] = await pool.query('SELECT * FROM price WHERE price_id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found after update' });
  res.json(rows[0]);
});

// delete
router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT price_id FROM price WHERE price_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM price WHERE price_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;


