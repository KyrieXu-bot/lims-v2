import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();

// 测试人员列表接口对所有角色开放
router.get('/technicians', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id as id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code IN ('employee', 'supervisor') 
       AND u.is_active = 1
       ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 其他接口需要特定权限
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor']));

// 获取指定部门的组长
router.get('/supervisors', async (req, res) => {
  const { department_id } = req.query;
  if (!department_id) {
    return res.status(400).json({ error: 'department_id is required' });
  }
  
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'supervisor' 
       AND u.is_active = 1
       AND u.department_id = ?
       ORDER BY u.name ASC`,
      [department_id]
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取指定小组的实验员
router.get('/employees', async (req, res) => {
  const { group_id } = req.query;
  if (!group_id) {
    return res.status(400).json({ error: 'group_id is required' });
  }
  
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'employee' 
       AND u.is_active = 1
       AND u.group_id = ?
       ORDER BY u.name ASC`,
      [group_id]
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 通过group_id获取department_id
router.get('/department-by-group', async (req, res) => {
  const { group_id } = req.query;
  if (!group_id) {
    return res.status(400).json({ error: 'group_id is required' });
  }
  
  const pool = await getPool();
  try {
    // 首先尝试从users表中获取department_id
    const [userRows] = await pool.query(
      `SELECT department_id FROM users WHERE group_id = ? AND department_id IS NOT NULL LIMIT 1`,
      [group_id]
    );
    
    if (userRows.length > 0) {
      return res.json(userRows[0].department_id);
    }
    
    // 如果users表中没有，尝试从lab_groups表中获取
    const [groupRows] = await pool.query(
      `SELECT department_id FROM lab_groups WHERE group_id = ? LIMIT 1`,
      [group_id]
    );
    
    if (groupRows.length > 0) {
      return res.json(groupRows[0].department_id);
    }
    
    // 如果都没有找到，返回null
    res.json(null);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


export default router;
