import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// 获取实验室组列表
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('(group_name LIKE ? OR group_code LIKE ?)');
    params.push(like, like);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT lg.group_id, lg.group_name, lg.group_code, lg.department_id, lg.is_active,
              d.department_name
       FROM lab_groups lg
       LEFT JOIN departments d ON d.department_id = lg.department_id
       ${where}
       ORDER BY lg.group_id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM lab_groups ${where}`, 
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    console.error('Error fetching lab groups:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取单个实验室组
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT lg.*, d.department_name
       FROM lab_groups lg
       LEFT JOIN departments d ON d.department_id = lg.department_id
       WHERE lg.group_id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
