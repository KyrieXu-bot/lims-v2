import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']));

// list
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, status, order_id } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];
  const user = req.user;

  // 基于角色的数据过滤
  if (user.role === 'leader') {
    // 室主任：只能看到自己部门的检测项目
    filters.push('ti.department_id IN (SELECT department_id FROM lab_groups WHERE group_id = ?)');
    params.push(user.group_id);
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
  // admin 角色不添加任何过滤条件

  if (q) {
    filters.push('(ti.category_name LIKE ? OR ti.detail_name LIKE ? OR ti.test_code LIKE ? OR ti.order_id LIKE ?)');
    params.push(like, like, like, like);
  }
  if (status) {
    filters.push('ti.status = ?');
    params.push(status);
  }
  if (order_id) {
    filters.push('ti.order_id = ?');
    params.push(order_id);
  }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT ti.*, 
            u.name AS assignee_name,
            supervisor.name AS supervisor_name,
            technician.name AS technician_name,
            c.customer_name,
            c.owner_user_id,
            p.contact_phone as payer_phone,
            comm.contact_phone as commissioner_phone
     FROM test_items ti
     LEFT JOIN users u ON u.user_id = ti.current_assignee
     LEFT JOIN users supervisor ON supervisor.user_id = ti.supervisor_id
     LEFT JOIN users technician ON technician.user_id = ti.technician_id
     LEFT JOIN orders o ON o.order_id = ti.order_id
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN payers p ON p.payer_id = o.payer_id
     LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
     ${where}
     ORDER BY ti.test_item_id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), offset]
  );

  // 业务员权限处理：隐藏非自己负责项目的敏感信息
  if (user.role === 'sales') {
    rows.forEach(item => {
      // 检查是否是业务员负责的项目（通过委托单关联的客户）
      const isOwner = item.customer_name && item.owner_user_id === user.user_id;
      if (!isOwner) {
        // 隐藏客户、付款人、委托人的电话号码
        item.payer_phone = '***';
        item.commissioner_phone = '***';
        if (item.customer_name) {
          // 可以显示客户名称，但隐藏电话
          item.customer_phone = '***';
        }
      }
    });
  }

  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt FROM test_items ti ${where}`, params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

// create
router.post('/', async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity = 1, unit_price, discount_rate,
    final_unit_price, line_total, machine_hours = 0, work_hours = 0, is_add_on = 0, is_outsourced = 0,
    seq_no, sample_preparation, note, status = 'new', current_assignee, supervisor_id, technician_id,
    arrival_mode, sample_arrival_status
  } = req.body || {};
  if (!order_id || !category_name || !detail_name) {
    return res.status(400).json({ error: 'order_id, category_name, detail_name are required' });
  }
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO test_items (
        order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
        test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
        final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced,
        seq_no, sample_preparation, note, status, current_assignee, supervisor_id, technician_id,
        arrival_mode, sample_arrival_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [order_id, price_id || null, category_name, detail_name, sample_name, material, sample_type, original_no,
       test_code, standard_code, department_id || null, group_id || null, quantity, unit_price, discount_rate,
       final_unit_price, line_total, machine_hours, work_hours, Number(is_add_on), Number(is_outsourced),
       seq_no, sample_preparation, note, status, current_assignee || null, supervisor_id || null, technician_id || null,
       arrival_mode || null, sample_arrival_status || null]
    );
    const [rows] = await pool.query(
      `SELECT ti.*, 
              u.name AS assignee_name,
              supervisor.name AS supervisor_name,
              technician.name AS technician_name
       FROM test_items ti
       LEFT JOIN users u ON u.user_id = ti.current_assignee
       LEFT JOIN users supervisor ON supervisor.user_id = ti.supervisor_id
       LEFT JOIN users technician ON technician.user_id = ti.technician_id
       WHERE ti.test_item_id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// read one
router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT ti.*, 
            u.name AS assignee_name,
            supervisor.name AS supervisor_name,
            technician.name AS technician_name
     FROM test_items ti
     LEFT JOIN users u ON u.user_id = ti.current_assignee
     LEFT JOIN users supervisor ON supervisor.user_id = ti.supervisor_id
     LEFT JOIN users technician ON technician.user_id = ti.technician_id
     WHERE ti.test_item_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// update
router.put('/:id', async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
    final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced,
    seq_no, sample_preparation, note, status, current_assignee, supervisor_id, technician_id,
    arrival_mode, sample_arrival_status
  } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE test_items SET
      order_id = COALESCE(?, order_id),
      price_id = COALESCE(?, price_id),
      category_name = COALESCE(?, category_name),
      detail_name = COALESCE(?, detail_name),
      sample_name = COALESCE(?, sample_name),
      material = COALESCE(?, material),
      sample_type = COALESCE(?, sample_type),
      original_no = COALESCE(?, original_no),
      test_code = COALESCE(?, test_code),
      standard_code = COALESCE(?, standard_code),
      department_id = COALESCE(?, department_id),
      group_id = COALESCE(?, group_id),
      quantity = COALESCE(?, quantity),
      unit_price = COALESCE(?, unit_price),
      discount_rate = COALESCE(?, discount_rate),
      final_unit_price = COALESCE(?, final_unit_price),
      line_total = COALESCE(?, line_total),
      machine_hours = COALESCE(?, machine_hours),
      work_hours = COALESCE(?, work_hours),
      is_add_on = COALESCE(?, is_add_on),
      is_outsourced = COALESCE(?, is_outsourced),
      seq_no = COALESCE(?, seq_no),
      sample_preparation = COALESCE(?, sample_preparation),
      note = COALESCE(?, note),
      status = COALESCE(?, status),
      current_assignee = COALESCE(?, current_assignee),
      supervisor_id = COALESCE(?, supervisor_id),
      technician_id = COALESCE(?, technician_id),
      arrival_mode = COALESCE(?, arrival_mode),
      sample_arrival_status = COALESCE(?, sample_arrival_status)
     WHERE test_item_id = ?`,
    [order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
     test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
     final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced, seq_no,
     sample_preparation, note, status, current_assignee, supervisor_id, technician_id, arrival_mode, sample_arrival_status, req.params.id]
  );
  const pool2 = await getPool();
  const [rows] = await pool2.query(
    `SELECT ti.*, 
            u.name AS assignee_name,
            supervisor.name AS supervisor_name,
            technician.name AS technician_name
     FROM test_items ti
     LEFT JOIN users u ON u.user_id = ti.current_assignee
     LEFT JOIN users supervisor ON supervisor.user_id = ti.supervisor_id
     LEFT JOIN users technician ON technician.user_id = ti.technician_id
     WHERE ti.test_item_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found after update' });
  res.json(rows[0]);
});

// delete
router.delete('/:id', async (req, res) => {
  const user = req.user;
  // 仅管理员与室主任可删除
  if (!(user.role === 'admin' || user.role === 'leader')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT test_item_id FROM test_items WHERE test_item_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM test_items WHERE test_item_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// batch assign
router.post('/batch-assign', async (req, res) => {
  const { testItemIds, supervisor_id, technician_id, status } = req.body || {};
  const user = req.user;
  
  if (!testItemIds || !Array.isArray(testItemIds) || testItemIds.length === 0) {
    return res.status(400).json({ error: 'testItemIds is required and must be an array' });
  }
  
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }
  
  // 验证权限
  if (user.role === 'leader') {
    if (!supervisor_id) {
      return res.status(400).json({ error: 'supervisor_id is required for leader' });
    }
  } else if (user.role === 'supervisor') {
    if (!technician_id) {
      return res.status(400).json({ error: 'technician_id is required for supervisor' });
    }
  } else {
    return res.status(403).json({ error: 'Only leader and supervisor can batch assign' });
  }
  
  const pool = await getPool();
  try {
    // 构建更新字段
    const updateFields = ['status = ?'];
    const updateValues = [status];
    
    if (supervisor_id) {
      updateFields.push('supervisor_id = ?');
      updateValues.push(supervisor_id);
    }
    
    if (technician_id) {
      updateFields.push('technician_id = ?');
      updateValues.push(technician_id);
    }
    
    // 构建IN子句
    const placeholders = testItemIds.map(() => '?').join(',');
    const query = `UPDATE test_items SET ${updateFields.join(', ')} WHERE test_item_id IN (${placeholders})`;
    
    await pool.query(query, [...updateValues, ...testItemIds]);
    
    res.json({ 
      ok: true, 
      message: `Successfully assigned ${testItemIds.length} items`,
      assignedCount: testItemIds.length
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;


