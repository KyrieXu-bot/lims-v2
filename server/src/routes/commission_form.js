import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// 获取委托单登记表数据（扁平化，以test_item_id为单位）
router.get('/commission-form', async (req, res) => {
  const { q = '', page = 1, pageSize = 100, status, department_id } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];
  const user = req.user;

  // 基于角色的数据过滤
  if (user.role === 'admin') {
    // 管理员：可以看到所有项目
  } else if (user.role === 'leader') {
    // 室主任：只能看到自己部门的检测项目
    if (user.department_id) {
      filters.push('ti.department_id = ?');
      params.push(user.department_id);
    } else {
      // 如果没有department_id，通过group_id查找
      filters.push('ti.department_id IN (SELECT department_id FROM lab_groups WHERE group_id = ?)');
      params.push(user.group_id);
    }
  } else if (user.role === 'supervisor') {
    // 组长：只能看到分配给他的检测项目
    filters.push('ti.supervisor_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'employee') {
    // 实验员：只能看到指派给他的检测项目
    filters.push('ti.technician_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'sales') {
    // 业务员：只能看到分配给他的检测项目
    filters.push('ti.current_assignee = ?');
    params.push(user.user_id);
  }

  // 默认排除已取消的项目（除非明确查询已取消状态）
  if (status !== 'cancelled') {
    filters.push('ti.status != ?');
    params.push('cancelled');
  }

  if (q) {
    filters.push('(ti.category_name LIKE ? OR ti.detail_name LIKE ? OR ti.test_code LIKE ? OR ti.order_id LIKE ? OR c.customer_name LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (status) {
    filters.push('ti.status = ?');
    params.push(status);
  }
  if (department_id) {
    filters.push('ti.department_id = ?');
    params.push(department_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT 
        ti.test_item_id,
        ti.order_id,
        o.created_at as order_created_at,
        ti.created_at as test_item_created_at,
        c.customer_id,
        c.customer_name,
        u.name as assignee_name,
        ti.current_assignee,
        NULL as unpaid_amount, -- 开票未到款金额（暂时为空）
        CONCAT(ti.category_name, ' - ', ti.detail_name) as test_item_name,
        ti.test_code,
        ti.department_id,
        d.department_name,
        p.unit_price as standard_price,
        ti.unit_price,
        COALESCE(pay.discount_rate, 0) / 100 as discount_rate,
        CASE 
          WHEN o.period_type = 'normal' THEN '不加急'
          WHEN o.period_type = 'urgent_1_5x' THEN '加急1.5倍'
          WHEN o.period_type = 'urgent_2x' THEN '特急2倍'
          ELSE '不加急'
        END as service_urgency,
        ti.field_test_time,
        ti.note,
        e.equipment_name,
        tech.name as technician_name,
        ti.actual_sample_quantity,
        ti.work_hours,
        ti.machine_hours,
        ti.actual_delivery_date,
        ti.status,
        ti.quantity,
        ti.arrival_mode,
        ti.sample_arrival_status,
        sup.name as supervisor_name,
        ti.supervisor_id
      FROM test_items ti
      LEFT JOIN orders o ON o.order_id = ti.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN users u ON u.user_id = ti.current_assignee
      LEFT JOIN users tech ON tech.user_id = ti.technician_id
      LEFT JOIN users sup ON sup.user_id = ti.supervisor_id
      LEFT JOIN departments d ON d.department_id = ti.department_id
      LEFT JOIN price p ON p.price_id = ti.price_id
      LEFT JOIN payers pay ON pay.payer_id = o.payer_id
      LEFT JOIN equipment e ON e.equipment_id = ti.equipment_id
      ${where}
      ORDER BY ti.test_item_id DESC
      LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    // 业务员权限处理：隐藏非自己负责项目的敏感信息
    if (user.role === 'sales') {
      rows.forEach(item => {
        const isOwner = item.customer_name && item.owner_user_id === user.user_id;
        if (!isOwner) {
          // 隐藏敏感信息
          item.customer_name = '***';
          item.assignee_name = '***';
        }
      });
    }

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt 
       FROM test_items ti
       LEFT JOIN orders o ON o.order_id = ti.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       ${where}`, 
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    console.error('Error fetching commission form data:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取平台设备清单数据
router.get('/equipment-list', async (req, res) => {
  const { q = '', page = 1, pageSize = 100, department_id } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  // 搜索条件
  if (q) {
    filters.push('(equipment_name LIKE ? OR equipment_no LIKE ? OR model LIKE ? OR equipment_label LIKE ?)');
    params.push(like, like, like, like);
  }

  // 按部门筛选
  if (department_id) {
    filters.push('department_id = ?');
    params.push(department_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT 
        equipment_id,
        equipment_no,
        equipment_name,
        model,
        department_id,
        equipment_label,
        parameters_and_accuracy,
        validity_period,
        report_title
      FROM equipment 
      ${where} 
      ORDER BY equipment_name 
      LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM equipment ${where}`,
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    console.error('Error fetching equipment list:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有设备列表（用于下拉选择）
router.get('/equipment-options', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT 
        equipment_id as id,
        equipment_name as name,
        equipment_no,
        model,
        department_id
      FROM equipment 
      ORDER BY equipment_name`
    );
    res.json(rows);
  } catch (e) {
    console.error('Error fetching equipment options:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有业务负责人列表（用于下拉选择）
router.get('/assignee-options', async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT 
        user_id as id,
        name,
        account,
        department_id
      FROM users 
      WHERE is_active = 1
      ORDER BY name`
    );
    res.json(rows);
  } catch (e) {
    console.error('Error fetching assignee options:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有部门列表（用于下拉选择，仅管理员可用）
router.get('/department-options', async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以获取部门列表
  if (user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可以查看部门列表' });
  }
  
  const pool = await getPool();
  try {
    // 从departments表获取部门信息，只获取在test_items中实际使用的部门
    const [rows] = await pool.query(
      `SELECT DISTINCT 
        d.department_id,
        d.department_name
      FROM departments d
      INNER JOIN test_items ti ON d.department_id = ti.department_id
      WHERE ti.department_id IS NOT NULL
      ORDER BY d.department_id`
    );
    
    res.json(rows);
  } catch (e) {
    console.error('Error fetching department options:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
