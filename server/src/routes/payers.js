import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// options for selects (id + label)
router.get('/options', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT p.payer_id, p.contact_name, c.customer_name
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.is_active = 1 AND c.is_active = 1
     ORDER BY c.customer_name, p.contact_name`
  );
  res.json(rows.map(r => ({ payer_id: r.payer_id, label: `${r.contact_name} (${r.customer_name})` })));
});

// list with join
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(p.contact_name LIKE ? OR p.contact_phone LIKE ? OR c.customer_name LIKE ?)');
  params.push(like, like, like);
  if (is_active === '0' || is_active === '1') {
    filters.push('p.is_active = ?');
    params.push(Number(is_active));
  }
  const where = 'WHERE ' + filters.join(' AND ');

  const [rows] = await pool.query(
    `SELECT p.*, c.customer_name
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}
     ORDER BY p.payer_id DESC
     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}`, params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

router.post('/', async (req, res) => {
  const { customer_id, contact_name, contact_phone, payment_term_days,
          discount_rate, owner_user_id, is_active = 1 } = req.body || {};
  if (!customer_id || !contact_name) return res.status(400).json({ error: 'customer_id and contact_name are required' });
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO payers (customer_id, contact_name, contact_phone, payment_term_days, discount_rate, owner_user_id, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [customer_id, contact_name, contact_phone, payment_term_days, discount_rate, owner_user_id, Number(is_active)]
    );
    const [rows] = await pool.query(
      `SELECT p.*, c.customer_name FROM payers p JOIN customers c ON c.customer_id = p.customer_id WHERE p.payer_id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT p.*, c.customer_name FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.payer_id = ?`, [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { customer_id, contact_name, contact_phone, payment_term_days,
          discount_rate, owner_user_id, is_active } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE payers SET
      customer_id = COALESCE(?, customer_id),
      contact_name = COALESCE(?, contact_name),
      contact_phone = COALESCE(?, contact_phone),
      payment_term_days = COALESCE(?, payment_term_days),
      discount_rate = COALESCE(?, discount_rate),
      owner_user_id = COALESCE(?, owner_user_id),
      is_active = COALESCE(?, is_active)
     WHERE payer_id = ?`,
    [customer_id, contact_name, contact_phone, payment_term_days,
     discount_rate, owner_user_id, is_active, req.params.id]
  );
  const [rows] = await pool.query(
    `SELECT p.*, c.customer_name FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.payer_id = ?`, [req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT payer_id FROM payers WHERE payer_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM payers WHERE payer_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: referenced by commissioners or others' });
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
