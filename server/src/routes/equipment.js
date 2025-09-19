import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// 获取设备列表
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 50, department_id } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  // 搜索条件
  if (q) {
    filters.push('(equipment_name LIKE ? OR equipment_no LIKE ? OR model LIKE ?)');
    params.push(like, like, like);
  }

  // 按部门筛选
  if (department_id) {
    filters.push('department_id = ?');
    params.push(department_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT * FROM equipment ${where} ORDER BY equipment_name LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM equipment ${where}`,
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 根据部门获取设备列表（用于员工完成时选择设备）
router.get('/by-department', async (req, res) => {
  const { department_id } = req.query;
  const user = req.user;
  
  if (!department_id && user.department_id) {
    // 如果没有指定department_id，使用当前用户的部门
    department_id = user.department_id;
  }

  if (!department_id) {
    return res.status(400).json({ error: 'department_id is required' });
  }

  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT equipment_id, equipment_name, equipment_no, model, equipment_label 
       FROM equipment 
       WHERE department_id = ? 
       ORDER BY equipment_name`,
      [department_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取单个设备详情
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM equipment WHERE equipment_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
