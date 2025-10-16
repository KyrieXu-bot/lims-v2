import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// 获取部门列表
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('department_name LIKE ?');
    params.push(like);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT department_id, department_name, is_active, created_at, updated_at
       FROM departments 
       ${where}
       ORDER BY department_id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM departments ${where}`, 
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    console.error('Error fetching departments:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取单个部门
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM departments WHERE department_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
