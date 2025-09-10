import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// options for selects
router.get('/options', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    'SELECT customer_id, customer_name, tax_id FROM customers WHERE is_active = 1 ORDER BY customer_name ASC'
  );
  res.json(rows);
});

router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(customer_name LIKE ? OR tax_id LIKE ? OR phone LIKE ? OR province LIKE ?)');
  params.push(like, like, like, like);

  if (is_active === '0' || is_active === '1') {
    filters.push('is_active = ?');
    params.push(Number(is_active));
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const [rows] = await pool.query(
    `SELECT * FROM customers ${where} ORDER BY customer_id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(`SELECT COUNT(*) as cnt FROM customers ${where}`, params);
  res.json({ data: rows, total: cnt[0].cnt });
});

router.post('/', async (req, res) => {
  const { customer_name, address, phone, bank_name, tax_id, bank_account,
          province, nature, scale, grade, is_active = 1 } = req.body || {};
  if (!customer_name || !tax_id) return res.status(400).json({ error: 'customer_name and tax_id are required' });
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO customers (customer_name, address, phone, bank_name, tax_id, bank_account, province, nature, scale, grade, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [customer_name, address, phone, bank_name, tax_id, bank_account, province, nature, scale, grade, Number(is_active)]
    );
    const [rows] = await pool.query('SELECT * FROM customers WHERE customer_id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate tax_id' });
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { customer_name, address, phone, bank_name, tax_id, bank_account,
          province, nature, scale, grade, is_active } = req.body || {};
  const pool = await getPool();
  try {
    await pool.query(
      `UPDATE customers SET
        customer_name = COALESCE(?, customer_name),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        bank_name = COALESCE(?, bank_name),
        tax_id = COALESCE(?, tax_id),
        bank_account = COALESCE(?, bank_account),
        province = COALESCE(?, province),
        nature = COALESCE(?, nature),
        scale = COALESCE(?, scale),
        grade = COALESCE(?, grade),
        is_active = COALESCE(?, is_active)
       WHERE customer_id = ?`,
      [customer_name, address, phone, bank_name, tax_id, bank_account,
       province, nature, scale, grade, is_active, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found after update' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate tax_id' });
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [r0] = await pool.query('SELECT customer_id FROM customers WHERE customer_id = ?', [req.params.id]);
    if (r0.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: referenced by payers or other tables' });
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
