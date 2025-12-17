import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin, requireAnyRole } from '../middleware/auth.js';

const router = Router();

// 获取当前用户信息 - 所有已登录用户都可以使用
router.get('/me', requireAuth, async (req, res) => {
  const user = req.user;
  const pool = await getPool();
  
  try {
    if (user.user_id === 'admin') {
      // 管理员账户特殊处理
      return res.json({
        user_id: 'admin',
        account: user.username || 'admin',
        name: '管理员',
        email: null,
        phone: null,
        department_id: null,
        department_name: null,
        group_id: null,
        group_name: null,
        is_active: true,
        roles: [{ role_code: 'admin', role_name: '管理员' }]
      });
    }

    // 获取用户详细信息
    const [users] = await pool.query(
      `SELECT u.*, d.department_name, lg.group_name
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       LEFT JOIN lab_groups lg ON lg.group_id = u.group_id
       WHERE u.user_id = ?`,
      [user.user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const userData = users[0];

    // 获取用户的所有角色
    const [roles] = await pool.query(
      `SELECT r.role_code, r.role_name
       FROM user_roles ur
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.role_id`,
      [user.user_id]
    );

    res.json({
      ...userData,
      roles: roles
    });
  } catch (e) {
    console.error('Get current user error:', e);
    return res.status(500).json({ error: e.message || '获取用户信息失败' });
  }
});

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

// 获取指定小组的实验员
router.get('/employees', requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee']), async (req, res) => {
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
       AND u.is_active = 1`;

    const params = [];

    // 如果传入了department_id参数，优先使用该参数过滤
    if (targetDepartmentId !== null) {
      query_sql += ' AND u.department_id = ?';
      params.push(targetDepartmentId);
    } else if (user.role === 'leader' && userDepartmentId !== null && !shouldSeeAll) {
      // 如果没有传入department_id，且用户是leader，使用用户的department_id
      query_sql += ' AND u.department_id = ?';
      params.push(userDepartmentId);
    }
    
    // 如果有搜索词，添加搜索条件
    if (searchTerm) {
      query_sql += ' AND (u.name LIKE ? OR u.account LIKE ?)';
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
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
       AND u.is_active = 1`;
    
    const params = [];
    
    // 如果传入了department_id参数，优先使用该参数过滤
    if (targetDepartmentId !== null) {
      query_sql += ' AND u.department_id = ?';
      params.push(targetDepartmentId);
    } else if (user.role === 'leader' && userDepartmentId !== null && !shouldSeeAll) {
      // 如果没有传入department_id，且用户是leader，使用用户的department_id
      query_sql += ' AND u.department_id = ?';
      params.push(userDepartmentId);
    }
    
    // 如果有搜索词，添加搜索条件
    if (searchTerm) {
      query_sql += ' AND (u.name LIKE ? OR u.account LIKE ?)';
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
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

// 获取所有员工列表 - 仅管理员
router.get('/all', requireAuth, requireAdmin, async (req, res) => {
  const { q = '', is_active = '' } = req.query;
  const pool = await getPool();
  
  try {
    let query = `
      SELECT 
        u.user_id,
        u.account,
        u.name,
        u.email,
        u.phone,
        u.group_id,
        u.department_id,
        u.is_active,
        d.department_name,
        lg.group_name
      FROM users u
      LEFT JOIN departments d ON d.department_id = u.department_id
      LEFT JOIN lab_groups lg ON lg.group_id = u.group_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (q) {
      query += ` AND (u.user_id LIKE ? OR u.name LIKE ? OR u.account LIKE ?)`;
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (is_active !== '') {
      query += ` AND u.is_active = ?`;
      params.push(is_active === '1' ? 1 : 0);
    }
    
    query += ` ORDER BY u.user_id ASC`;
    
    const [users] = await pool.query(query, params);
    
    // 为每个用户获取角色信息
    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const [roles] = await pool.query(
          `SELECT r.role_code, r.role_name
           FROM user_roles ur
           JOIN roles r ON r.role_id = ur.role_id
           WHERE ur.user_id = ?
           ORDER BY r.role_id`,
          [user.user_id]
        );
        return {
          ...user,
          roles: roles
        };
      })
    );
    
    res.json(usersWithRoles);
  } catch (e) {
    console.error('List all users error:', e);
    return res.status(500).json({ error: e.message || '获取员工列表失败' });
  }
});

// 更新员工状态 - 仅管理员
router.put('/:userId/status', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;
  
  if (typeof is_active !== 'boolean' && is_active !== 0 && is_active !== 1) {
    return res.status(400).json({ error: 'is_active 参数无效' });
  }
  
  // 防止管理员禁用自己
  if (userId === req.user.user_id) {
    return res.status(400).json({ error: '不能修改自己的账户状态' });
  }
  
  const pool = await getPool();
  try {
    // 检查用户是否存在
    const [users] = await pool.query(
      `SELECT user_id FROM users WHERE user_id = ?`,
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 更新状态
    await pool.query(
      `UPDATE users SET is_active = ? WHERE user_id = ?`,
      [is_active ? 1 : 0, userId]
    );
    
    res.json({ message: '状态更新成功', is_active: is_active ? 1 : 0 });
  } catch (e) {
    console.error('Update user status error:', e);
    return res.status(500).json({ error: e.message || '更新状态失败' });
  }
});

// 修改密码接口 - 所有已登录用户都可以使用
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = req.user;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '旧密码和新密码不能为空' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码长度至少为6位' });
  }

  const pool = await getPool();
  try {
    // 获取当前用户的密码哈希
    const [users] = await pool.query(
      `SELECT password_hash FROM users WHERE user_id = ? AND is_active = 1`,
      [user.user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在或已被禁用' });
    }

    const currentPasswordHash = users[0].password_hash;

    // 验证旧密码
    // 处理管理员账户（如果user_id是'admin'）
    if (user.user_id === 'admin') {
      const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
      const ADMIN_PASS_BCRYPT = process.env.ADMIN_PASS_BCRYPT || '';
      
      let passwordMatch = false;
      if (ADMIN_PASS_BCRYPT) {
        passwordMatch = await bcrypt.compare(oldPassword, ADMIN_PASS_BCRYPT);
      } else {
        passwordMatch = oldPassword === ADMIN_PASS;
      }
      
      if (!passwordMatch) {
        return res.status(401).json({ error: '旧密码不正确' });
      }
    } else {
      // 验证普通用户的旧密码
      const passwordMatch = await bcrypt.compare(oldPassword, currentPasswordHash);
      if (!passwordMatch) {
        return res.status(401).json({ error: '旧密码不正确' });
      }
    }

    // 检查新密码是否与旧密码相同
    if (user.user_id === 'admin') {
      const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
      const ADMIN_PASS_BCRYPT = process.env.ADMIN_PASS_BCRYPT || '';
      
      let isSame = false;
      if (ADMIN_PASS_BCRYPT) {
        isSame = await bcrypt.compare(newPassword, ADMIN_PASS_BCRYPT);
      } else {
        isSame = newPassword === ADMIN_PASS;
      }
      
      if (isSame) {
        return res.status(400).json({ error: '新密码不能与旧密码相同' });
      }
    } else {
      const isSame = await bcrypt.compare(newPassword, currentPasswordHash);
      if (isSame) {
        return res.status(400).json({ error: '新密码不能与旧密码相同' });
      }
    }

    // 生成新密码的哈希
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    if (user.user_id === 'admin') {
      // 对于管理员，更新环境变量（这里只更新数据库，实际生产环境可能需要更新.env文件）
      // 注意：这里只更新数据库中的记录，如果admin账户在users表中不存在，可能需要特殊处理
      // 由于admin可能是环境变量配置的，这里我们尝试更新，如果不存在则跳过数据库更新
      const [adminUsers] = await pool.query(
        `SELECT user_id FROM users WHERE user_id = 'admin'`
      );
      if (adminUsers.length > 0) {
        await pool.query(
          `UPDATE users SET password_hash = ? WHERE user_id = 'admin'`,
          [newPasswordHash]
        );
      }
      // 注意：实际生产环境中，可能需要同时更新环境变量 ADMIN_PASS_BCRYPT
    } else {
      await pool.query(
        `UPDATE users SET password_hash = ? WHERE user_id = ?`,
        [newPasswordHash, user.user_id]
      );
    }

    res.json({ message: '密码修改成功' });
  } catch (e) {
    console.error('Change password error:', e);
    return res.status(500).json({ error: e.message || '修改密码失败' });
  }
});


export default router;
