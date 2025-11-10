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

// 根据group_id获取对应的组长
router.get('/group-supervisor', requireAuth, async (req, res) => {
  const { group_id } = req.query;
  if (!group_id) {
    return res.status(400).json({ error: 'group_id is required' });
  }

  const pool = await getPool();
  try {
    // 优先查找直接隶属于该group的组长
    const [directRows] = await pool.query(
      `SELECT u.user_id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'supervisor'
         AND u.is_active = 1
         AND u.group_id = ?
       LIMIT 1`,
      [group_id]
    );

    if (directRows.length > 0) {
      return res.json(directRows[0]);
    }

    // 如果组长没有直接挂在group上，尝试从该小组成员的supervisor_id推断
    const [byMemberRows] = await pool.query(
      `SELECT DISTINCT sup.user_id, sup.name, sup.account
       FROM users emp
       JOIN users sup ON sup.user_id = emp.supervisor_id
       JOIN user_roles ur ON ur.user_id = sup.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'supervisor'
         AND sup.is_active = 1
         AND emp.group_id = ?
       LIMIT 1`,
      [group_id]
    );

    if (byMemberRows.length > 0) {
      return res.json(byMemberRows[0]);
    }

    // 最后根据小组所属部门兜底
    let departmentId = null;
    const [groupDeptRows] = await pool.query(
      `SELECT department_id FROM lab_groups WHERE group_id = ? LIMIT 1`,
      [group_id]
    );
    if (groupDeptRows.length > 0 && groupDeptRows[0].department_id) {
      departmentId = groupDeptRows[0].department_id;
    } else {
      const [userDeptRows] = await pool.query(
        `SELECT department_id FROM users WHERE group_id = ? AND department_id IS NOT NULL LIMIT 1`,
        [group_id]
      );
      if (userDeptRows.length > 0) {
        departmentId = userDeptRows[0].department_id;
      }
    }

    if (departmentId) {
      const [byDeptRows] = await pool.query(
        `SELECT u.user_id, u.name, u.account
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE r.role_code = 'supervisor'
           AND u.is_active = 1
           AND u.department_id = ?
         ORDER BY u.name ASC
         LIMIT 1`,
        [departmentId]
      );
      if (byDeptRows.length > 0) {
        return res.json(byDeptRows[0]);
      }
    }

    res.json(null);
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

// 获取业务员（department_id=4）
router.get('/business-staff', async (req, res) => {
  const { q = '' } = req.query;
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.account
       FROM users u
       WHERE u.department_id = 4 
       AND u.is_active = 1
       AND (u.name LIKE ? OR u.account LIKE ?)
       ORDER BY u.name ASC
       LIMIT 50`,
      [`%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有组长（role=supervisor）
router.get('/all-supervisors', async (req, res) => {
  const { q = '', department_id } = req.query;
  const user = req.user;
  const pool = await getPool();
  
  try {
    const normalizeNumber = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    };

    const userDepartmentId = normalizeNumber(user?.department_id);
    const targetDepartmentId = normalizeNumber(department_id);
    const isOutsourceLeader = user.role === 'leader' && userDepartmentId === 5;
    const shouldSeeAll = user.role === 'admin' || (isOutsourceLeader && (targetDepartmentId === 5 || targetDepartmentId === null));
    const searchTerm = (q || '').trim();
    
    let query_sql = `SELECT u.user_id, u.name, u.account, u.department_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'supervisor' 
       AND u.is_active = 1
       AND (u.name LIKE ? OR u.account LIKE ?)`;
    
    const params = [`%${searchTerm}%`, `%${searchTerm}%`];
    
    if (user.role === 'leader' && userDepartmentId !== null && !shouldSeeAll) {
      query_sql += ' AND u.department_id = ?';
      params.push(userDepartmentId);
    }
    
    query_sql += ' ORDER BY u.name ASC LIMIT 50';
    
    const [rows] = await pool.query(query_sql, params);
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有实验员（role=employee）
router.get('/all-employees', async (req, res) => {
  const { q = '', department_id } = req.query;
  const user = req.user;
  const pool = await getPool();
  
  try {
    const normalizeNumber = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    };

    const userDepartmentId = normalizeNumber(user?.department_id);
    const targetDepartmentId = normalizeNumber(department_id);
    const isOutsourceLeader = user.role === 'leader' && userDepartmentId === 5;
    const shouldSeeAll = user.role === 'admin' || (isOutsourceLeader && (targetDepartmentId === 5 || targetDepartmentId === null));
    const searchTerm = (q || '').trim();
    
    let query_sql = `SELECT u.user_id, u.name, u.account, u.department_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'employee' 
       AND u.is_active = 1
       AND (u.name LIKE ? OR u.account LIKE ?)`;
    
    const params = [`%${searchTerm}%`, `%${searchTerm}%`];
    
    if (user.role === 'leader' && userDepartmentId !== null && !shouldSeeAll) {
      query_sql += ' AND u.department_id = ?';
      params.push(userDepartmentId);
    }
    
    query_sql += ' ORDER BY u.name ASC LIMIT 50';
    
    const [rows] = await pool.query(query_sql, params);
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 根据price_id获取该部门下的组长和实验员
router.get('/by-price-id', requireAuth, async (req, res) => {
  const { price_id } = req.query;
  if (!price_id) {
    return res.status(400).json({ error: 'price_id is required' });
  }
  
  const pool = await getPool();
  try {
    // 首先根据price_id查询department_id
    const [priceRows] = await pool.query(
      `SELECT department_id FROM price WHERE price_id = ?`,
      [price_id]
    );
    
    if (priceRows.length === 0 || !priceRows[0].department_id) {
      // 如果没有找到price_id或department_id为空，返回空数组
      return res.json({ supervisors: [], technicians: [] });
    }
    
    const department_id = priceRows[0].department_id;
    
    // 获取该部门下的所有组长（supervisor）
    const [supervisorRows] = await pool.query(
      `SELECT u.user_id as id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'supervisor' 
       AND u.is_active = 1
       AND u.department_id = ?
       ORDER BY u.name ASC`,
      [department_id]
    );
    
    // 获取该部门下的所有实验员（employee）
    const [technicianRows] = await pool.query(
      `SELECT u.user_id as id, u.name, u.account
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'employee' 
       AND u.is_active = 1
       AND u.department_id = ?
       ORDER BY u.name ASC`,
      [department_id]
    );
    
    res.json({
      supervisors: supervisorRows,
      technicians: technicianRows
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


export default router;
