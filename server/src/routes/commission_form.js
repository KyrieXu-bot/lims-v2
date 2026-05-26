import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import {
  buildCommissionListFilters,
  COMMISSION_FORM_LIST_SELECT_JOINS,
  commissionListWhereNeedsOrderJoins,
  COMMISSION_FORM_PAGE_IDS_JOIN_BLOCK,
  parseCommissionOrderIds
} from '../lib/commissionFormListQuery.js';

/**
 * 委托单列表：已关联结算时，用 settlements.invoice_amount 与组内开票预填价之和的比例覆盖展示用 unpaid_amount。
 * 在主查询之后执行，避免对每一行做 JSON_CONTAINS 相关子查询（大数据量下会极慢）。
 */
async function applySettlementDerivedUnpaidAmount(rows, pool) {
  const bySid = new Map();
  for (const row of rows) {
    const sid = row.__settlement_alloc_id;
    if (sid == null || row.__settlement_invoice_amount == null) continue;
    const key = String(sid);
    if (bySid.has(key)) continue;
    const rawIds = row.__settlement_test_item_ids;
    if (rawIds == null || String(rawIds).trim() === '') continue;
    let ids = [];
    try {
      const parsed = typeof rawIds === 'string' ? JSON.parse(rawIds) : rawIds;
      ids = Array.isArray(parsed) ? parsed.filter((id) => id != null && id !== '') : [];
    } catch {
      ids = [];
    }
    if (ids.length === 0) continue;
    bySid.set(key, {
      invoiceAmount: Number(row.__settlement_invoice_amount),
      ids
    });
  }

  const allIds = new Set();
  for (const { ids } of bySid.values()) {
    for (const id of ids) {
      const n = Number(id);
      if (Number.isFinite(n)) allIds.add(n);
    }
  }

  if (allIds.size === 0) {
    for (const row of rows) {
      delete row.__settlement_alloc_id;
      delete row.__settlement_invoice_amount;
      delete row.__settlement_test_item_ids;
    }
    return;
  }

  const idList = [...allIds];
  const ph = idList.map(() => '?').join(',');
  const [prefillRows] = await pool.query(
    `SELECT test_item_id, invoice_prefill_price FROM test_items WHERE test_item_id IN (${ph}) AND status != 'cancelled'`,
    idList
  );
  const prefillMap = new Map();
  for (const r of prefillRows) {
    prefillMap.set(Number(r.test_item_id), parseFloat(r.invoice_prefill_price) || 0);
  }

  const totals = new Map();
  for (const [key, { ids, invoiceAmount }] of bySid) {
    let sum = 0;
    for (const id of ids) {
      sum += prefillMap.get(Number(id)) || 0;
    }
    totals.set(key, { totalPrefill: sum, invoiceAmount });
  }

  for (const row of rows) {
    const sid = row.__settlement_alloc_id;
    delete row.__settlement_alloc_id;
    delete row.__settlement_invoice_amount;
    delete row.__settlement_test_item_ids;

    if (sid == null) continue;
    const t = totals.get(String(sid));
    if (!t || t.totalPrefill <= 0 || !Number.isFinite(t.invoiceAmount)) continue;
    const prefill = parseFloat(row.invoice_prefill_price) || 0;
    row.unpaid_amount = Math.round((t.invoiceAmount * prefill / t.totalPrefill) * 100) / 100;
  }
}

/**
 * 分页：先取本页 test_item_id（不 JOIN project_files / settlements），再按 IN 拉完整行。
 */
async function fetchCommissionPageTestItemIds(pool, req, whereSql, params, limit, offset) {
  const needOrderJoins = commissionListWhereNeedsOrderJoins(req);
  const fromSql = needOrderJoins
    ? COMMISSION_FORM_PAGE_IDS_JOIN_BLOCK
    : '\n      FROM test_items ti';
  const [idRows] = await pool.query(
    `SELECT ti.test_item_id AS __tid ${fromSql}
      ${whereSql}
      ORDER BY ti.order_id ASC, ti.test_item_id ASC
      LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  return idRows.map((r) => r.__tid);
}

/**
 * @param {object} pool — mysql2 pool
 * @param {string} whereSql — 含 WHERE 关键字，或空串
 * @param {any[]} params
 * @param {{ limit: number, offset: number } | null} pageOpts — null 表示不按分页截断（按 ID 批量查询）
 * @param {object | null} req — Express req；分页两阶段时需要；按 ID 批量时传 null
 */
async function runCommissionFormListQuery(pool, whereSql, params, pageOpts, req = null) {
  if (!pageOpts) {
    const [rows] = await pool.query(
      `${COMMISSION_FORM_LIST_SELECT_JOINS}
      ${whereSql}
      ORDER BY ti.order_id ASC, ti.test_item_id ASC`,
      params
    );
    await applySettlementDerivedUnpaidAmount(rows, pool);
    return rows;
  }

  const { limit, offset } = pageOpts;
  if (!req) {
    throw new Error('runCommissionFormListQuery: req is required when pageOpts is set');
  }
  const ids = await fetchCommissionPageTestItemIds(pool, req, whereSql, params, limit, offset);
  if (ids.length === 0) {
    return [];
  }
  const idPh = ids.map(() => '?').join(',');
  const whereIn = whereSql
    ? `${whereSql} AND ti.test_item_id IN (${idPh})`
    : `WHERE ti.test_item_id IN (${idPh})`;
  const [rows] = await pool.query(
    `${COMMISSION_FORM_LIST_SELECT_JOINS}
      ${whereIn}
      ORDER BY ti.order_id ASC, ti.test_item_id ASC`,
    [...params, ...ids]
  );
  await applySettlementDerivedUnpaidAmount(rows, pool);
  const orderMap = new Map(ids.map((id, i) => [Number(id), i]));
  rows.sort(
    (a, b) =>
      (orderMap.get(Number(a.test_item_id)) ?? 0) - (orderMap.get(Number(b.test_item_id)) ?? 0)
  );
  return rows;
}

const router = Router();
router.use(requireAuth, requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer']));

// 获取委托单登记表数据（扁平化，以test_item_id为单位）
router.get('/commission-form', async (req, res) => {
  const { page = 1, pageSize = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const pool = await getPool();
  try {
    const { where, params } = buildCommissionListFilters(req);
    const rows = await runCommissionFormListQuery(
      pool,
      where,
      params,
      {
        limit: Number(pageSize),
        offset
      },
      req
    );

    const needWideCountJoins = commissionListWhereNeedsOrderJoins(req);
    const countFrom = needWideCountJoins
      ? `FROM test_items ti
       LEFT JOIN orders o ON o.order_id = ti.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id`
      : 'FROM test_items ti';
    const [cnt] = await pool.query(`SELECT COUNT(*) as cnt ${countFrom} ${where}`, params);
    const orderIds = parseCommissionOrderIds(req);
    let matchedOrderIds = undefined;
    if (orderIds.length > 0) {
      const [matchedRows] = await pool.query(
        `SELECT DISTINCT ti.order_id ${countFrom} ${where} ORDER BY ti.order_id`,
        params
      );
      matchedOrderIds = matchedRows.map((row) => row.order_id).filter(Boolean);
    }

    res.json({ data: rows, total: cnt[0].cnt, matched_order_ids: matchedOrderIds });
  } catch (e) {
    console.error('Error fetching commission form data:', e);
    return res.status(500).json({ error: e.message });
  }
});

/** 按检测项目 ID 批量查询（跨页导出等），与列表相同字段与权限过滤，避免拉全表 */
router.post('/commission-form/by-test-item-ids', async (req, res) => {
  const raw = req.body?.test_item_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ error: 'test_item_ids 须为非空数组' });
  }
  const cleaned = [
    ...new Set(
      raw
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
  if (cleaned.length === 0) {
    return res.status(400).json({ error: '没有有效的 test_item_id' });
  }
  const pool = await getPool();
  try {
    const { where, params } = buildCommissionListFilters(req);
    const idPh = cleaned.map(() => '?').join(',');
    const whereWithIds = where
      ? `${where} AND ti.test_item_id IN (${idPh})`
      : `WHERE ti.test_item_id IN (${idPh})`;
    const rows = await runCommissionFormListQuery(pool, whereWithIds, [...params, ...cleaned], null);
    res.json({ data: rows });
  } catch (e) {
    console.error('Error fetching commission form by test_item_ids:', e);
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
    
    // 对于组长、实验员，只显示自己部门的设备；委外/技术支持室主任可看全平台设备
    if (user.role === 'leader' || user.role === 'supervisor' || user.role === 'employee') {
      const isCrossDepartmentLeader =
        user.role === 'leader' && (Number(user.department_id) === 5 || Number(user.department_id) === 7);
      if (isCrossDepartmentLeader) {
        // 跨部门室主任：不按部门过滤
      } else {
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

// 获取指定委托单的所有项目的流转顺序信息（不受权限限制，仅用于计算流转顺序）
// 只返回seq_no和group_name，不包含敏感信息
router.get('/flow-sequence/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const pool = await getPool();
  
  try {
    const [rows] = await pool.query(
      `SELECT 
        ti.test_item_id,
        ti.seq_no,
        lg.group_name
      FROM test_items ti
      LEFT JOIN lab_groups lg ON lg.group_id = ti.group_id
      WHERE ti.order_id = ? AND ti.seq_no IS NOT NULL AND ti.status != 'cancelled'
      ORDER BY ti.seq_no ASC`,
      [orderId]
    ); 
    
    res.json(rows);
  } catch (e) {
    console.error('Error fetching flow sequence:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
