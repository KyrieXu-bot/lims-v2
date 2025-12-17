import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer']));

// 获取委托单登记表数据（扁平化，以test_item_id为单位）
router.get('/commission-form', async (req, res) => {
  const { q = '', page = 1, pageSize = 100, status, department_id, month_filter, my_items } = req.query;
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
    const leaderDept = Number(user.department_id);
    if (leaderDept === 5) {
      // 委外室主任查看所有部门
    } else if (user.department_id) {
      filters.push('ti.department_id = ?');
      params.push(user.department_id);
    } else {
      // 如果没有department_id，通过group_id查找
      filters.push('ti.department_id IN (SELECT department_id FROM lab_groups WHERE group_id = ?)');
      params.push(user.group_id);
    }
  } else if (user.role === 'supervisor') {
    // 组长：查询负责人是自己的项目（登录用户是组长且负责人=组长）
    filters.push('ti.supervisor_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'employee') {
    // 实验员：只能看到指派给他的检测项目
    filters.push('ti.technician_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'sales') {
    // 业务员：可以看到所有项目，前端会根据current_assignee判断是否需要模糊处理
    // 不再在这里过滤数据
  }

  // 处理状态筛选（支持多选）
  // Express会将多个同名参数转换为数组，单个参数保持为字符串
  const statusArray = Array.isArray(status) ? status : (status ? [status] : []);
  
  // 只有当明确指定了非cancelled状态时，才排除已取消的项目
  // 如果status为空（全部状态），则包含所有状态包括已取消的
  if (statusArray.length > 0 && !statusArray.includes('cancelled')) {
    filters.push('ti.status != ?');
    params.push('cancelled');
  }

  if (q) {
    // 检查是否是日期格式 (yyyy-MM-dd)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(q)) {
      // 如果是日期格式，搜索当天的现场测试时间
      filters.push('DATE(ti.field_test_time) = ?');
      params.push(q);
    } else {
      // 普通文本搜索
      // 使用子查询来搜索 payers.contact_name，避免 WHERE 子句中引用 JOIN 别名的问题
      // 添加对负责人名字和测试人员名字的搜索
      filters.push('(ti.category_name LIKE ? OR ti.detail_name LIKE ? OR ti.test_code LIKE ? OR ti.order_id LIKE ? OR c.customer_name LIKE ? OR comm.contact_name LIKE ? OR EXISTS (SELECT 1 FROM payers WHERE payers.payer_id = o.payer_id AND payers.contact_name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE users.user_id = ti.supervisor_id AND users.name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE users.user_id = ti.technician_id AND users.name LIKE ?))');
      params.push(like, like, like, like, like, like, like, like, like);
    }
  }
  
  // 多状态筛选：使用IN查询
  if (statusArray.length > 0) {
    const placeholders = statusArray.map(() => '?').join(',');
    filters.push(`ti.status IN (${placeholders})`);
    params.push(...statusArray);
  }
  if (department_id) {
    filters.push('ti.department_id = ?');
    params.push(department_id);
  }
  // 月份筛选：基于委托单号格式 JC + 年份(2位) + 月份(2位) + 编号
  // 例如：JC25100001 表示 25年10月
  if (month_filter && month_filter.trim() !== '') {
    // month_filter 格式为 "yyyy-MM"，需要转换为年份和月份
    // 例如 "2025-10" -> 年份25，月份10
    const [year, month] = month_filter.split('-');
    if (year && month && year.length === 4 && month.length === 2) {
      // 提取年份的后两位（例如2025 -> 25）
      const yearSuffix = year.slice(-2);
      // 委托单号格式：JC + 年份(2位) + 月份(2位) + 编号
      // 使用LIKE匹配：JC + 年份 + 月份
      filters.push('ti.order_id LIKE ?');
      params.push(`JC${yearSuffix}${month.padStart(2, '0')}%`);
    }
  }
  // "我的"筛选：筛选 current_assignee 等于当前用户的项目
  if (my_items === 'true') {
    filters.push('ti.current_assignee = ?');
    params.push(user.user_id);
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
        c.address as customer_address,
        c.phone as customer_phone,
        comm.contact_name as customer_contact_name,
        comm.contact_phone as customer_contact_phone,
        comm.email as customer_contact_email,
        comm.commissioner_name as commissioner_name,
        COALESCE(comm.commissioner_name, c.customer_name) as customer_commissioner_name,
        comm.address as customer_commissioner_address,
        o.commissioner_id,
        u.name as assignee_name,
        u.account as assignee_account,
        ti.current_assignee,
        ti.unpaid_amount, -- 开票未到款金额
        CONCAT(ti.category_name, ' - ', ti.detail_name) as test_item_name,
        ti.category_name,
        ti.detail_name,
        ti.sample_name,
        ti.material,
        ti.original_no,
        ti.test_code,
        ti.price_id,
        ti.department_id,
        d.department_name,
        ti.group_id,
        ti.unit_price as standard_price,
        p.unit_price as original_unit_price,
        p.minimum_price,
        ti.discount_rate as discount_rate,
        CASE 
          WHEN ti.service_urgency = 'normal' THEN '不加急'
          WHEN ti.service_urgency = 'urgent_1_5x' THEN '加急1.5倍'
          WHEN ti.service_urgency = 'urgent_2x' THEN '特急2倍'
          ELSE '不加急'
        END as service_urgency,
        ti.field_test_time,
        ti.note,
        e.equipment_name,
        tech.name as technician_name,
        ti.assignment_note,
        ti.actual_sample_quantity,
        ti.work_hours,
        ti.machine_hours,
        ti.test_notes,
        ti.unit,
        ti.line_total,
        ti.final_unit_price,
        COALESCE(pf.has_order_attachment, 0) as has_order_attachment,
        COALESCE(pf.has_raw_data, 0) as has_raw_data,
        COALESCE(pf.has_experiment_report, 0) as has_experiment_report,
        ti.actual_delivery_date,
        ti.business_note,
        ti.abnormal_condition,
        ti.status,
        ti.quantity,
        ti.arrival_mode,
        ti.sample_arrival_status,
        ti.price_note,
        ti.is_add_on,
        ti.addon_reason,
        ti.business_confirmed,
        sup.name as supervisor_name,
        ti.supervisor_id,
        -- 业务员信息
        sales.name as sales_name,
        sales.email as sales_email,
        sales.phone as sales_phone,
        -- 付款方信息
        c.customer_name as payer_name,
        pay.contact_name as payer_contact_name,
        pay.contact_phone as payer_contact_phone,
        NULL as payer_contact_email, -- payers表没有email字段
        c.bank_name as payer_bank_name, -- 从customers表获取
        c.tax_id as payer_tax_number, -- 从customers表获取
        c.bank_account as payer_bank_account, -- 从customers表获取
        c.address as payer_address, -- 从customers表获取
        c.province as customer_province, -- 区域
        c.nature as customer_nature, -- 单位性质
        -- 其他信息
        o.delivery_days_after_receipt as delivery_days,
        o.remarks as other_requirements,
        o.total_price
      FROM test_items ti
      LEFT JOIN orders o ON o.order_id = ti.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
      LEFT JOIN users u ON u.user_id = ti.current_assignee
      LEFT JOIN users tech ON tech.user_id = ti.technician_id
      LEFT JOIN users sup ON sup.user_id = ti.supervisor_id
      LEFT JOIN payers pay ON pay.payer_id = o.payer_id
      LEFT JOIN users sales ON sales.user_id = pay.owner_user_id
      LEFT JOIN departments d ON d.department_id = ti.department_id
      LEFT JOIN price p ON p.price_id = ti.price_id
      LEFT JOIN equipment e ON e.equipment_id = ti.equipment_id
      LEFT JOIN (
        SELECT 
          test_item_id,
          MAX(CASE WHEN category = 'order_attachment' THEN 1 ELSE 0 END) AS has_order_attachment,
          MAX(CASE WHEN category = 'raw_data' THEN 1 ELSE 0 END) AS has_raw_data,
          MAX(CASE WHEN category = 'experiment_report' THEN 1 ELSE 0 END) AS has_experiment_report
        FROM project_files
        GROUP BY test_item_id
      ) pf ON pf.test_item_id = ti.test_item_id
      ${where}
      ORDER BY ti.order_id ASC, ti.test_item_id ASC
      LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    // 业务员权限处理：不再在后端隐藏数据，让前端根据权限进行展示控制
    // 业务员可以看到所有数据，但前端会根据current_assignee判断是否需要模糊处理

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt 
       FROM test_items ti
       LEFT JOIN orders o ON o.order_id = ti.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
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
    filters.push('e.department_id = ?');
    params.push(department_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT 
        e.equipment_id,
        e.equipment_no,
        e.equipment_name,
        e.model,
        e.department_id,
        d.department_name,
        e.equipment_label,
        e.parameters_and_accuracy,
        e.validity_period,
        e.report_title,
        e.status
      FROM equipment e
      LEFT JOIN departments d ON e.department_id = d.department_id
      ${where} 
      ORDER BY e.equipment_name 
      LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [cnt] = await pool.query(
      `SELECT COUNT(*) as cnt FROM equipment e ${where}`,
      params
    );

    res.json({ data: rows, total: cnt[0].cnt });
  } catch (e) {
    console.error('Error fetching equipment list:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 更新设备状态
router.put('/equipment/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['正常', '维修'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be 正常 or 维修' });
  }

  const pool = await getPool();
  try {
    await pool.query(
      'UPDATE equipment SET status = ?, status_update_time = NOW() WHERE equipment_id = ?',
      [status, id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Error updating equipment status:', e);
    res.status(500).json({ error: e.message });
  }
});

// 获取正在维护的设备列表（跑马灯用）
router.get('/equipment/maintenance', requireAuth, async (req, res) => {
  const pool = await getPool();
  const user = req.user;
  
  try {
    let whereClause = "WHERE status = '维修'";
    let params = [];
    
    // 对于室主任、组长、实验员，只显示自己部门的设备
    if (user.role === 'leader' || user.role === 'supervisor' || user.role === 'employee') {
      let departmentId = user.department_id;
      
      // 如果没有department_id，通过group_id查找
      if (!departmentId && user.group_id) {
        const [deptRows] = await pool.query(
          'SELECT department_id FROM lab_groups WHERE group_id = ?',
          [user.group_id]
        );
        if (deptRows.length > 0) {
          departmentId = deptRows[0].department_id;
        }
      }
      
      if (departmentId) {
        whereClause += ' AND department_id = ?';
        params.push(departmentId);
      } else {
        // 如果没有部门信息，返回空列表
        return res.json([]);
      }
    }
    // admin、sales、viewer 角色显示所有设备，不需要额外过滤
    
    const [rows] = await pool.query(
      `SELECT equipment_name, equipment_no, model, status_update_time
       FROM equipment 
       ${whereClause}
       ORDER BY status_update_time DESC, equipment_name`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('Error fetching maintenance equipment:', e);
    res.status(500).json({ error: e.message });
  }
});

// 获取所有设备列表（用于下拉选择）
router.get('/equipment-options', async (req, res) => {
  const pool = await getPool();
  const user = req.user;
  
  try {
    let whereClause = '';
    let params = [];
    
    // 对于室主任、组长、实验员，只显示自己部门的设备
    if (user.role === 'leader' || user.role === 'supervisor' || user.role === 'employee') {
      let departmentId = user.department_id;
      
      // 如果没有department_id，通过group_id查找
      if (!departmentId && user.group_id) {
        const [deptRows] = await pool.query(
          'SELECT department_id FROM lab_groups WHERE group_id = ?',
          [user.group_id]
        );
        if (deptRows.length > 0) {
          departmentId = deptRows[0].department_id;
        }
      }
      
      if (departmentId) {
        whereClause = 'WHERE department_id = ?';
        params.push(departmentId);
      } else {
        // 如果没有部门信息，返回空列表
        return res.json([]);
      }
    }
    // admin 和 sales 角色显示所有设备，不需要过滤
    
    const [rows] = await pool.query(
      `SELECT 
        equipment_id as id,
        equipment_name as name,
        equipment_no,
        model,
        department_id
      FROM equipment 
      ${whereClause}
      ORDER BY equipment_name`,
      params
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

// 获取所有部门列表（用于下拉选择）
router.get('/department-options', async (req, res) => {
  const user = req.user;
  
  const pool = await getPool();
  try {
    let rows;
    
    if (user.role === 'admin') {
      // 管理员：获取所有部门
      [rows] = await pool.query(
        `SELECT DISTINCT 
          d.department_id,
          d.department_name
        FROM departments d
        ORDER BY d.department_id`
      );
    } else {
      // 其他角色：只能看到自己相关的部门
      if (user.department_id) {
        // 如果用户有department_id，只返回该部门
        [rows] = await pool.query(
          `SELECT department_id, department_name 
           FROM departments 
           WHERE department_id = ?`,
          [user.department_id]
        );
      } else if (user.group_id) {
        // 如果用户只有group_id，通过group_id查找department_id
        [rows] = await pool.query(
          `SELECT DISTINCT d.department_id, d.department_name
           FROM departments d
           INNER JOIN lab_groups lg ON d.department_id = lg.department_id
           WHERE lg.group_id = ?`,
          [user.group_id]
        );
      } else {
        // 如果都没有，返回空数组
        rows = [];
      }
    }
    
    res.json(rows);
  } catch (e) {
    console.error('Error fetching department options:', e);
    return res.status(500).json({ error: e.message });
  }
});

// 获取所有存在的月份列表（从委托单号中提取）
// 委托单号格式：JC + 年份(2位) + 月份(2位) + 编号
// 例如：JC25100001 表示 25年10月
router.get('/month-options', async (req, res) => {
  const pool = await getPool();
  try {
    // 从委托单号中提取年份和月份
    // 委托单号格式：JC + 年份(2位) + 月份(2位) + 编号
    // 例如：JC25100001 -> 位置3-4是年份(25)，位置5-6是月份(10)
    const [rows] = await pool.query(
      `SELECT DISTINCT
        CONCAT(
          CASE 
            WHEN CAST(SUBSTRING(ti.order_id, 3, 2) AS UNSIGNED) < 50 THEN CONCAT('20', SUBSTRING(ti.order_id, 3, 2))
            ELSE CONCAT('19', SUBSTRING(ti.order_id, 3, 2))
          END,
          '-',
          LPAD(SUBSTRING(ti.order_id, 5, 2), 2, '0')
        ) as month_value
      FROM test_items ti
      WHERE ti.order_id LIKE 'JC____%'
        AND LENGTH(ti.order_id) >= 7
        AND SUBSTRING(ti.order_id, 3, 2) REGEXP '^[0-9]{2}$'
        AND SUBSTRING(ti.order_id, 5, 2) REGEXP '^[0-9]{2}$'
        AND CAST(SUBSTRING(ti.order_id, 5, 2) AS UNSIGNED) BETWEEN 1 AND 12
      ORDER BY month_value DESC`
    );
    
    // 提取唯一的月份值并去重
    const months = [...new Set(rows.map(row => row.month_value))];
    
    res.json(months);
  } catch (e) {
    console.error('Error fetching month options:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
