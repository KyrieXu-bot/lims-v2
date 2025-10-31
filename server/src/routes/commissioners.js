import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'sales']));

// list with joins (payer + customer)
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(m.contact_name LIKE ? OR m.contact_phone LIKE ? OR p.contact_name LIKE ? OR c.customer_name LIKE ?)');
  params.push(like, like, like, like);
  if (is_active === '0' || is_active === '1') {
    filters.push('m.is_active = ?');
    params.push(Number(is_active));
  }
  const where = 'WHERE ' + filters.join(' AND ');

  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}
     ORDER BY m.commissioner_id DESC
     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}`, params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

router.post('/', async (req, res) => {
  const { payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active = 1 } = req.body || {};
  if (!payer_id || !contact_name) return res.status(400).json({ error: 'payer_id and contact_name are required' });
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO commissioners (payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [payer_id, contact_name, contact_phone, email, commissioner_name, address, Number(is_active)]
    );
    const [rows] = await pool.query(
      `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
       FROM commissioners m
       JOIN payers p ON p.payer_id = m.payer_id
       JOIN customers c ON c.customer_id = p.customer_id
       WHERE m.commissioner_id = ?`, [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE m.commissioner_id = ?`, [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE commissioners SET
      payer_id = COALESCE(?, payer_id),
      contact_name = COALESCE(?, contact_name),
      contact_phone = COALESCE(?, contact_phone),
      email = COALESCE(?, email),
      commissioner_name = COALESCE(?, commissioner_name),
      address = COALESCE(?, address),
      is_active = COALESCE(?, is_active)
     WHERE commissioner_id = ?`,
    [payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active, req.params.id]
  );
  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE m.commissioner_id = ?`, [req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT commissioner_id FROM commissioners WHERE commissioner_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM commissioners WHERE commissioner_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: referenced by other tables' });
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
