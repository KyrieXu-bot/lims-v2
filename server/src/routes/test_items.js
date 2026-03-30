import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer']));

const CREATE_ROLES = ['admin', 'leader', 'supervisor', 'sales'];
const EDIT_ROLES = ['admin', 'leader', 'supervisor', 'employee', 'sales'];
const ADMIN_AUDIT_FIELDS = new Set([
  'final_unit_price',
  'price_note',
  'discount_rate',
  'machine_hours',
  'work_hours',
  'actual_sample_quantity',
  'line_total'
]);
const NUMERIC_AUDIT_FIELDS = new Set([
  'unit_price',
  'final_unit_price',
  'price_note',
  'discount_rate',
  'machine_hours',
  'work_hours',
  'actual_sample_quantity',
  'line_total'
]);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const normalizeAuditValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
};

const canLeaderAccessDepartment = (user, departmentId) => {
  if (!user || user.role !== 'leader') return false;
  const leaderDept = parseNumber(user.department_id);
  const targetDept = parseNumber(departmentId);
  if (leaderDept === null || targetDept === null) return false;
  if (leaderDept === 5) {
    return targetDept === 5;
  }
  return leaderDept === targetDept;
};

/** 规范为 test_items.service_urgency ENUM，兼容列表展示用的中文历史值 */
const normalizeServiceUrgencyForDb = (value) => {
  if (value === null || value === undefined || value === '') return 'normal';
  const v = String(value).trim();
  if (v === '不加急') return 'normal';
  if (v === '加急1.5倍') return 'urgent_1_5x';
  if (v === '特急2倍') return 'urgent_2x';
  if (v === 'normal' || v === 'urgent_1_5x' || v === 'urgent_2x') return v;
  return 'normal';
};

// 根据委托单ID获取第一条检测项目的样品到达信息（仅返回 arrival_mode 和 sample_arrival_status）
router.get('/first-arrival-by-order/:orderId', async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT arrival_mode, sample_arrival_status
       FROM test_items
       WHERE order_id = ?
       ORDER BY test_item_id ASC
       LIMIT 1`,
      [orderId]
    );

    if (!rows || rows.length === 0) {
      return res.json(null);
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching first test item arrival info by order:', error);
    return res.status(500).json({ error: 'Failed to fetch arrival info' });
  }
});

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
  if (user.role === 'admin') {
    // 管理员：可以看到所有项目，包括样品未到的项目
    // 不添加任何过滤条件
  } else if (user.role === 'leader') {
    const leaderDept = parseNumber(user.department_id);
    if (leaderDept === 5) {
      // 委外室主任查看所有部门
    } else if (leaderDept !== null) {
      filters.push('ti.department_id = ?');
      params.push(leaderDept);
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
            p.owner_user_id,
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
      // 检查是否是业务员负责的项目（通过付款人的owner_user_id）
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

  // 移除 owner_user_id 字段，不展示给前端
  rows.forEach(item => {
    delete item.owner_user_id;
  });

  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt FROM test_items ti ${where}`, params
  );
  res.json({ data: rows, total: cnt[0].cnt });
});

// create
router.post('/', requireRole(CREATE_ROLES), async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity = 1, unit_price, discount_rate,
    final_unit_price, line_total, machine_hours = 0, work_hours = 0, is_add_on = 0, is_outsourced = 0,
    seq_no, sample_preparation, note, status = 'new', current_assignee, supervisor_id, technician_id,
    arrival_mode, sample_arrival_status, equipment_id, check_notes, test_notes,
    actual_sample_quantity, actual_delivery_date, field_test_time, price_note,
    assignment_note, business_note, abnormal_condition, service_urgency, unit, addon_reason, addon_target
  } = req.body || {};

  // 处理空字符串，将其转换为null，这样数据库可以接受空值
  const processValue = (value) => {
    if (value === '' || value === undefined) return null;
    return value;
  };

  // 处理日期字段，将ISO格式转换为YYYY-MM-DD格式
  const processDate = (value) => {
    if (value === '' || value === undefined || value === null) return null;
    if (typeof value === 'string' && value.includes('T')) {
      // 如果是ISO格式，提取日期部分
      return value.split('T')[0];
    }
    return value;
  };

  // 处理日期时间字段，将ISO格式转换为MySQL DATETIME格式
  const processDateTime = (value) => {
    if (value === '' || value === undefined || value === null) return null;
    if (typeof value === 'string' && value.includes('T')) {
      // 如果是ISO格式，转换为MySQL DATETIME格式
      return value.replace('T', ' ').replace('Z', '').split('.')[0];
    }
    return value;
  };

  const processedActualSampleQuantity = processValue(actual_sample_quantity);
  const processedActualDeliveryDate = processDate(actual_delivery_date);
  const processedFieldTestTime = processDateTime(field_test_time);
  const processedServiceUrgency = normalizeServiceUrgencyForDb(service_urgency);
  const processedUnit = processValue(unit);
  if (!order_id || !category_name || !detail_name) {
    return res.status(400).json({ error: 'order_id, category_name, detail_name are required' });
  }

  if (req.user.role === 'leader') {
    const leaderDept = parseNumber(req.user.department_id);
    const targetDept = parseNumber(department_id);
    if (leaderDept === null || targetDept === null || !canLeaderAccessDepartment(req.user, targetDept)) {
      return res.status(403).json({ error: '无权在该部门创建检测项目' });
    }
  }
  
  // 如果是委外检测，自动设置状态为outsource
  const finalStatus = is_outsourced === 1 ? 'outsource' : status;
  const pool = await getPool();
  try {
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 如果是标准项目（非委外），自动分配组长
      let finalSupervisorId = supervisor_id;
      if (is_outsourced === 0 && !supervisor_id && department_id) {
        // 查找该部门的组长
        const [supervisorRows] = await pool.query(
          `SELECT u.user_id 
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.user_id
           JOIN roles r ON r.role_id = ur.role_id
           WHERE r.role_code = 'supervisor' 
           AND u.is_active = 1
           AND u.department_id = ?
           LIMIT 1`,
          [department_id]
        );
        
        if (supervisorRows.length > 0) {
          finalSupervisorId = supervisorRows[0].user_id;
        }
      }
      
      // 调试：检查参数数量
      const paramArray = [
        order_id, 
        price_id || null, 
        category_name, 
        detail_name, 
        sample_name || null, 
        material || null, 
        sample_type || null, 
        original_no || null,
        test_code || null, 
        standard_code || null, 
        department_id || null, 
        group_id || null, 
        quantity || 1, 
        unit_price || null, 
        discount_rate || null,
        final_unit_price || null, 
        line_total || null, 
        machine_hours || 0, 
        work_hours || 0, 
        Number(is_add_on) || 0, 
        Number(is_outsourced) || 0,
        seq_no || null, 
        sample_preparation || null, 
        note || null, 
        finalStatus, 
        current_assignee || null, 
        finalSupervisorId || null, 
        technician_id || null,
        arrival_mode || null, 
        sample_arrival_status || null, 
        equipment_id || null, 
        check_notes || null, 
        test_notes || null,
        processedActualSampleQuantity, 
        processedActualDeliveryDate, 
        processedFieldTestTime,
        price_note || null,
        assignment_note || null, 
        business_note || null, 
        processedServiceUrgency,
        processedUnit,
        addon_reason || null,
        addon_target || null
      ];
      
      // 重新构建SQL语句，确保字段和占位符数量匹配
      const sqlFields = [
        'order_id', 'price_id', 'category_name', 'detail_name', 'sample_name', 'material', 'sample_type', 'original_no',
        'test_code', 'standard_code', 'department_id', 'group_id', 'quantity', 'unit_price', 'discount_rate',
        'final_unit_price', 'line_total', 'machine_hours', 'work_hours', 'is_add_on', 'is_outsourced',
        'seq_no', 'sample_preparation', 'note', 'status', 'current_assignee', 'supervisor_id', 'technician_id',
        'arrival_mode', 'sample_arrival_status', 'equipment_id', 'check_notes', 'test_notes',
        'actual_sample_quantity', 'actual_delivery_date', 'field_test_time', 'price_note',
        'assignment_note', 'business_note', 'service_urgency', 'unit', 'addon_reason', 'addon_target'
      ];
      
      const placeholders = sqlFields.map(() => '?').join(',');
      const sql = `INSERT INTO test_items (${sqlFields.join(', ')}) VALUES (${placeholders})`;
      
      const [r] = await pool.query(sql, paramArray);
      const testItemId = r.insertId;
      
      // 如果分配了组长，在assignments表中添加记录
      if (finalSupervisorId) {
        // 先删除该test_item_id的所有现有分配记录（因为唯一约束）
        await pool.query(
          `DELETE FROM assignments WHERE test_item_id = ?`,
          [testItemId]
        );
        
        await pool.query(
          `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
           VALUES (?, ?, ?, ?, ?)`,
          [testItemId, String(finalSupervisorId), String(finalSupervisorId), String(req.user.user_id), '组长']
        );
      }
      
      // 提交事务
      await pool.query('COMMIT');
      
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
        [testItemId]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      // 回滚事务
      await pool.query('ROLLBACK');
      throw error;
    }
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
router.put('/:id', requireRole(EDIT_ROLES), async (req, res) => {
  const {
    order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
    test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
    final_unit_price, line_total, lab_price, machine_hours, work_hours, is_add_on, is_outsourced,
    seq_no, sample_preparation, note, status, current_assignee, supervisor_id, technician_id,
    arrival_mode, sample_arrival_status, equipment_id, check_notes, test_notes, unit,
    actual_sample_quantity, actual_delivery_date, field_test_time, price_note,
    assignment_note, business_note, invoice_note, abnormal_condition, service_urgency, business_confirmed,
    unit_mismatch_reviewed, addon_reason, addon_target, invoice_prefill_price, invoice_prefill_confirmed, invoice_status
  } = req.body || {};

  // 处理空字符串，将其转换为null，这样数据库可以接受空值
  const processValue = (value) => {
    if (value === '' || value === undefined) return null;
    return value;
  };

  // 处理日期字段，将ISO格式转换为YYYY-MM-DD格式
  const processDate = (value) => {
    if (value === '' || value === undefined || value === null) return null;
    if (typeof value === 'string' && value.includes('T')) {
      // 如果是ISO格式，提取日期部分
      return value.split('T')[0];
    }
    return value;
  };

  // 处理日期时间字段，将ISO格式转换为MySQL DATETIME格式
  const processDateTime = (value) => {
    if (value === '' || value === undefined || value === null) return null;
    if (typeof value === 'string' && value.includes('T')) {
      // 如果是ISO格式，转换为MySQL DATETIME格式
      return value.replace('T', ' ').replace('Z', '').split('.')[0];
    }
    return value;
  };

  const pool = await getPool();
  
  try {
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 获取更新前的数据
      const [oldRows] = await pool.query(
        `SELECT order_id, price_id, supervisor_id, technician_id, current_assignee, department_id,
                unit_price, final_unit_price, price_note, discount_rate, machine_hours, work_hours,
                actual_sample_quantity, line_total
         FROM test_items
         WHERE test_item_id = ?`,
        [req.params.id]
      );
      
      if (oldRows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Test item not found' });
      }
      
      const oldData = oldRows[0];

      if (req.user.role === 'leader' && !canLeaderAccessDepartment(req.user, oldData.department_id)) {
        await pool.query('ROLLBACK');
        return res.status(403).json({ error: '无权编辑其他部门的检测项目' });
      }
      
      // 检查请求体中包含哪些字段（只更新明确提供的字段）
      const hasField = (fieldName) => fieldName in req.body;
      
      // 构建动态更新语句
      const updateFields = [];
      const updateValues = [];
      
      const addUpdate = (field, value, processedValue = null) => {
        // 只更新请求体中明确包含的字段
        if (hasField(field)) {
          const finalValue = processedValue !== null ? processedValue : value;
          updateFields.push(`${field} = ?`);
          updateValues.push(finalValue);
        }
      };
      
      addUpdate('order_id', order_id);
      addUpdate('price_id', price_id);
      addUpdate('category_name', category_name);
      addUpdate('detail_name', detail_name);
      addUpdate('sample_name', sample_name);
      addUpdate('material', material);
      addUpdate('sample_type', sample_type);
      addUpdate('original_no', original_no);
      addUpdate('test_code', test_code);
      addUpdate('standard_code', standard_code);
      addUpdate('department_id', department_id);
      addUpdate('group_id', group_id);
      addUpdate('quantity', quantity);
      addUpdate('unit_price', unit_price);
      addUpdate('discount_rate', discount_rate);
      addUpdate('final_unit_price', final_unit_price);
      addUpdate('line_total', line_total);
      addUpdate('lab_price', lab_price);
      addUpdate('machine_hours', machine_hours);
      addUpdate('work_hours', work_hours);
      addUpdate('is_add_on', is_add_on);
      addUpdate('is_outsourced', is_outsourced);
      addUpdate('seq_no', seq_no);
      addUpdate('sample_preparation', sample_preparation);
      addUpdate('note', note);
      addUpdate('status', status);
      addUpdate('current_assignee', current_assignee);
      addUpdate('supervisor_id', supervisor_id);
      addUpdate('technician_id', technician_id);
      addUpdate('arrival_mode', arrival_mode);
      addUpdate('sample_arrival_status', sample_arrival_status);
      addUpdate('equipment_id', equipment_id);
      addUpdate('check_notes', check_notes);
      addUpdate('test_notes', test_notes);
      addUpdate('unit', unit);
      // 对于需要特殊处理的字段，传入处理后的值
      addUpdate('actual_sample_quantity', actual_sample_quantity, processValue(actual_sample_quantity));
      addUpdate('actual_delivery_date', actual_delivery_date, processDate(actual_delivery_date));
      addUpdate('field_test_time', field_test_time, processDateTime(field_test_time));
      addUpdate('price_note', price_note);
      addUpdate('assignment_note', assignment_note);
      addUpdate('business_note', business_note);
      addUpdate('invoice_note', invoice_note);
      addUpdate('abnormal_condition', abnormal_condition);
      addUpdate('service_urgency', service_urgency, normalizeServiceUrgencyForDb(service_urgency));
      addUpdate('business_confirmed', business_confirmed);
      addUpdate('unit_mismatch_reviewed', unit_mismatch_reviewed);
      addUpdate('addon_reason', addon_reason);
      addUpdate('addon_target', addon_target);
      // 添加开票相关字段
      addUpdate('invoice_prefill_price', invoice_prefill_price);
      addUpdate('invoice_prefill_confirmed', invoice_prefill_confirmed);
      addUpdate('invoice_status', invoice_status);
      
      // 如果没有要更新的字段，直接返回
      if (updateFields.length === 0) {
        await pool.query('COMMIT');
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      if (req.user.role !== 'admin' && hasField('department_id')) {
        const targetDept = parseNumber(department_id);
        if (!canLeaderAccessDepartment(req.user, targetDept)) {
          await pool.query('ROLLBACK');
          return res.status(403).json({ error: '无权变更检测项目所属部门' });
        }
      }

      updateValues.push(req.params.id);
      
      // 更新test_items表
      await pool.query(
        `UPDATE test_items SET ${updateFields.join(', ')} WHERE test_item_id = ?`,
        updateValues
      );
      
      // 获取更新后的数据
      const [newRows] = await pool.query(
        `SELECT order_id, price_id, supervisor_id, technician_id, current_assignee,
                unit_price, final_unit_price, price_note, discount_rate, machine_hours, work_hours,
                actual_sample_quantity, line_total
         FROM test_items
         WHERE test_item_id = ?`,
        [req.params.id]
      );
      const newData = newRows[0];

      // 写入变更日志：
      // 1) unit_price：任何角色修改都记录
      // 2) 其他受控字段：仅管理员修改时记录
      const loggableFields = ['unit_price', ...Array.from(ADMIN_AUDIT_FIELDS)];
      const logsToInsert = [];

      for (const field of loggableFields) {
        if (!hasField(field)) continue;

        const shouldLog =
          field === 'unit_price' ||
          (req.user.role === 'admin' && ADMIN_AUDIT_FIELDS.has(field));
        if (!shouldLog) continue;

        const oldRaw = oldData[field];
        const newRaw = newData[field];

        let changed = false;
        if (NUMERIC_AUDIT_FIELDS.has(field)) {
          const oldNum = parseNumber(oldRaw);
          const newNum = parseNumber(newRaw);
          changed = oldNum !== newNum;
        } else {
          changed = normalizeAuditValue(oldRaw) !== normalizeAuditValue(newRaw);
        }
        if (!changed) continue;

        logsToInsert.push([
          Number(req.params.id),
          newData.order_id || oldData.order_id || null,
          newData.price_id || oldData.price_id || null,
          field,
          normalizeAuditValue(oldRaw),
          normalizeAuditValue(newRaw),
          req.user?.user_id || null,
          req.user?.name || null,
          req.user?.role || null,
          newData.current_assignee || oldData.current_assignee || null,
          newData.supervisor_id || oldData.supervisor_id || null,
          newData.technician_id || oldData.technician_id || null
        ]);
      }

      if (logsToInsert.length > 0) {
        await pool.query(
          `INSERT INTO test_item_change_logs (
            test_item_id, order_id, price_id, changed_field, old_value, new_value,
            changed_by_user_id, changed_by_name, changed_by_role,
            current_assignee_snapshot, supervisor_id_snapshot, technician_id_snapshot
          ) VALUES ?`,
          [logsToInsert]
        );
      }
      
      // 同步assignments表
      // 由于assignments表有唯一约束，需要先删除所有现有记录，然后添加新的记录
      const hasChanges = oldData.supervisor_id !== newData.supervisor_id || 
                        oldData.technician_id !== newData.technician_id || 
                        oldData.current_assignee !== newData.current_assignee;
      
      if (hasChanges) {
        // 删除该test_item_id的所有现有分配记录
        await pool.query(
          `DELETE FROM assignments WHERE test_item_id = ?`,
          [req.params.id]
        );
        
        // 根据优先级添加新的分配记录：组长 > 实验员 > 业务员
        if (newData.supervisor_id) {
          await pool.query(
            `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, String(newData.supervisor_id), String(newData.supervisor_id), String(req.user.user_id), '组长']
          );
        } else if (newData.technician_id) {
          await pool.query(
            `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, String(newData.technician_id), String(newData.supervisor_id), String(req.user.user_id), '实验员']
          );
        } else if (newData.current_assignee) {
          await pool.query(
            `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, String(newData.current_assignee), String(newData.supervisor_id), String(req.user.user_id), '业务员']
          );
        }
      }
      
      // 提交事务
      await pool.query('COMMIT');
      
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
      if (rows.length === 0) return res.status(404).json({ error: 'Not found after update' });
      res.json(rows[0]);
    } catch (error) {
      // 回滚事务
      await pool.query('ROLLBACK');
      console.error('Update error in transaction:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  } catch (e) {
    console.error('Test item update failed:', e);
    console.error('Error details:', {
      message: e.message,
      stack: e.stack,
      body: req.body,
      params: req.params
    });
    return res.status(500).json({ error: e.message });
  }
});

// delete
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  const user = req.user;
  // 仅管理员可删除
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete test items' });
  }
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT test_item_id FROM test_items WHERE test_item_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 删除关联表中的记录
      await pool.query('DELETE FROM assignments WHERE test_item_id = ?', [req.params.id]);
      await pool.query('DELETE FROM outsource_info WHERE test_item_id = ?', [req.params.id]);
      await pool.query('DELETE FROM sample_return_info WHERE test_item_id = ?', [req.params.id]);
      await pool.query('DELETE FROM sample_tracking WHERE test_item_id = ?', [req.params.id]);
      await pool.query('DELETE FROM samples WHERE test_item_id = ?', [req.params.id]);
      
      // 最后删除主表记录
      await pool.query('DELETE FROM test_items WHERE test_item_id = ?', [req.params.id]);
      
      // 提交事务
      await pool.query('COMMIT');
      res.json({ ok: true, message: 'Test item and related records deleted successfully' });
    } catch (deleteError) {
      // 回滚事务
      await pool.query('ROLLBACK');
      throw deleteError;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// batch assign
router.post('/batch-assign', requireRole(['admin', 'leader', 'supervisor']), async (req, res) => {
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
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 获取更新前的数据
      const placeholders = testItemIds.map(() => '?').join(',');
      const [oldRows] = await pool.query(
        `SELECT test_item_id, supervisor_id, technician_id, current_assignee, department_id FROM test_items WHERE test_item_id IN (${placeholders})`,
        testItemIds
      );

      if (user.role === 'leader') {
        const invalidItem = oldRows.some(row => !canLeaderAccessDepartment(user, row.department_id));
        if (invalidItem) {
          await pool.query('ROLLBACK');
          return res.status(403).json({ error: '无权批量分配其他部门的检测项目' });
        }
      }
      
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
      
      // 更新test_items表
      const query = `UPDATE test_items SET ${updateFields.join(', ')} WHERE test_item_id IN (${placeholders})`;
      await pool.query(query, [...updateValues, ...testItemIds]);
      
      // 获取更新后的数据
      const [newRows] = await pool.query(
        `SELECT test_item_id, supervisor_id, technician_id, current_assignee FROM test_items WHERE test_item_id IN (${placeholders})`,
        testItemIds
      );
      
      // 同步assignments表
      for (const newData of newRows) {
        const oldData = oldRows.find(row => row.test_item_id === newData.test_item_id);
        
        // 检查是否有变更
        const hasChanges = (supervisor_id && oldData.supervisor_id !== newData.supervisor_id) ||
                          (technician_id && oldData.technician_id !== newData.technician_id);
        
        if (hasChanges) {
          // 删除该test_item_id的所有现有分配记录
          await pool.query(
            `DELETE FROM assignments WHERE test_item_id = ?`,
            [newData.test_item_id]
          );
          
          // 根据优先级添加新的分配记录：组长 > 实验员
          if (newData.supervisor_id) {
            await pool.query(
              `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
               VALUES (?, ?, ?, ?, ?)`,
              [newData.test_item_id, String(newData.supervisor_id), String(newData.supervisor_id), String(user.user_id), '组长']
            );
          } else if (newData.technician_id) {
            await pool.query(
              `INSERT INTO assignments (test_item_id, assigned_to, supervisor_id, created_by, note) 
               VALUES (?, ?, ?, ?, ?)`,
              [newData.test_item_id, String(newData.technician_id), String(newData.supervisor_id), String(user.user_id), '实验员']
            );
          }
        }
      }
      
      // 提交事务
      await pool.query('COMMIT');
      
      res.json({ 
        ok: true, 
        message: `Successfully assigned ${testItemIds.length} items`,
        assignedCount: testItemIds.length
      });
    } catch (error) {
      // 回滚事务
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// cancel test item (only admin can cancel)
router.post('/:id/cancel', requireRole(['admin']), async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以取消测试
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can cancel test items' });
  }
  
  const pool = await getPool();
  try {
    // 检查测试项目是否存在
    const [chk] = await pool.query('SELECT test_item_id, status FROM test_items WHERE test_item_id = ?', [req.params.id]);
    if (chk.length === 0) {
      return res.status(404).json({ error: 'Test item not found' });
    }
    
    const testItem = chk[0];
    
    // 检查是否已经是已取消状态
    if (testItem.status === 'cancelled') {
      return res.status(400).json({ error: 'Test item is already cancelled' });
    }
    
    // 更新状态为已取消
    await pool.query('UPDATE test_items SET status = ? WHERE test_item_id = ?', ['cancelled', req.params.id]);
    
    res.json({ 
      ok: true, 
      message: 'Test item cancelled successfully',
      testItemId: req.params.id
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 撤回取消操作（恢复已取消的项目）- 业务员可以撤回自己负责的项目
router.post('/:id/uncancel', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const user = req.user;
  const pool = await getPool();
  
  try {
    // 检查测试项目是否存在
    const [chk] = await pool.query(
      'SELECT test_item_id, status, current_assignee FROM test_items WHERE test_item_id = ?',
      [req.params.id]
    );
    
    if (chk.length === 0) {
      return res.status(404).json({ error: 'Test item not found' });
    }
    
    const testItem = chk[0];
    
    // 检查是否已经是已取消状态
    if (testItem.status !== 'cancelled') {
      return res.status(400).json({ error: 'Test item is not cancelled' });
    }
    
    // 业务员只能撤回自己负责的项目
    if (user.role === 'sales' && testItem.current_assignee !== user.user_id) {
      return res.status(403).json({ error: '无权撤回此项目的取消操作' });
    }
    
    // 恢复状态：根据项目是否有负责人来决定恢复为什么状态
    // 如果有负责人，恢复为assigned，否则恢复为new
    const [supervisorCheck] = await pool.query(
      'SELECT supervisor_id FROM test_items WHERE test_item_id = ?',
      [req.params.id]
    );
    
    const newStatus = supervisorCheck[0]?.supervisor_id ? 'assigned' : 'new';
    
    // 更新状态
    await pool.query('UPDATE test_items SET status = ? WHERE test_item_id = ?', [newStatus, req.params.id]);
    
    res.json({ 
      ok: true, 
      message: '取消操作已撤回，项目已恢复',
      testItemId: req.params.id,
      newStatus: newStatus
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;


