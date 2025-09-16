import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// list
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20 } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('(o.order_id LIKE ? OR c.customer_name LIKE ?)');
    params.push(like, like);
  }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT o.*, c.customer_name, p.payer_id, p.discount_rate
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN payers p ON p.payer_id = o.payer_id
     ${where}
     ORDER BY o.order_id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt 
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     ${where}`, 
    params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

// read one
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT o.*, c.customer_name, p.payer_id, p.discount_rate
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN payers p ON p.payer_id = o.payer_id
     WHERE o.order_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
