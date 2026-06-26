/**
 * 委托单登记表列表：筛选条件构建 + 主查询 SELECT/JOIN 片段（与列表/按 ID 导出共用）。
 */

/** 与 commission_form 路由中主列表一致的 SELECT … JOIN（不含 WHERE / ORDER / LIMIT） */
export const COMMISSION_FORM_LIST_SELECT_JOINS = `
      SELECT 
        ti.test_item_id,
        ti.order_id,
        o.original_order_id,
        o.root_order_id,
        o.is_transferred,
        CASE 
          WHEN ti.is_add_on IN (1, 2) THEN ti.created_at 
          ELSE o.created_at 
        END as order_created_at,
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
        o.payer_id,
        u.name as assignee_name,
        u.account as assignee_account,
        ti.current_assignee,
        ti.unpaid_amount,
        ti.settlement_serial_number,
        ti.invoice_prefill_price,
        ti.invoice_prefill_confirmed,
        ti.invoice_status,
        CONCAT(ti.category_name, ' - ', ti.detail_name) as test_item_name,
        ti.category_name,
        ti.detail_name,
        ti.sample_name,
        ti.material,
        ti.original_no,
        ti.test_code,
        ti.standard_code,
        ti.price_id,
        ti.department_id,
        d.department_name,
        ti.group_id,
        lg.group_name,
        ti.seq_no,
        ti.unit_price as standard_price,
        ti.estimated_delivery_date,
        ti.delivery_date_confirmed,
        p.unit_price as original_unit_price,
        p.minimum_price,
        p.amount as price_amount,
        p.unit as price_unit,
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
        ti.technician_id,
        ti.assignment_note,
        ti.actual_sample_quantity,
        ti.work_hours,
        ti.machine_hours,
        ti.test_notes,
        ti.unit,
        ti.unit_mismatch_reviewed,
        ti.line_total,
        ti.final_unit_price,
        ti.lab_price,
        COALESCE(pf.has_order_attachment, 0) as has_order_attachment,
        COALESCE(pf.has_raw_data, 0) as has_raw_data,
        COALESCE(pf.has_experiment_report, 0) as has_experiment_report,
        ti.actual_delivery_date,
        ti.business_note,
        ti.invoice_note,
        ti.abnormal_condition,
        ti.status,
        ti.quantity,
        ti.arrival_mode,
        ti.sample_arrival_status,
        ti.price_note,
        ti.is_add_on,
        ti.addon_reason,
        ti.addon_target,
        ti.business_confirmed,
        sup.name as supervisor_name,
        ti.supervisor_id,
        sales.name as sales_name,
        sales.email as sales_email,
        sales.phone as sales_phone,
        c.customer_name as payer_name,
        pay.contact_name as payer_contact_name,
        pay.contact_phone as payer_contact_phone,
        NULL as payer_contact_email,
        c.bank_name as payer_bank_name,
        c.tax_id as payer_tax_number,
        c.bank_account as payer_bank_account,
        c.address as payer_address,
        c.province as customer_province,
        c.nature as customer_nature,
        o.delivery_days_after_receipt as delivery_days,
        o.remarks as other_requirements,
        o.total_price,
        r.report_type,
        r.report_seals,
        s.settlement_id AS __settlement_alloc_id,
        s.invoice_amount AS __settlement_invoice_amount,
        s.test_item_ids AS __settlement_test_item_ids,
        sia_sum.allocated_amount AS __settlement_item_allocated_amount,
        s.invoice_number,
        s.invoice_date as settlement_invoice_date,
        COALESCE(s.customer_name, c_settlement.customer_name) as settlement_customer_name
      FROM test_items ti
      LEFT JOIN orders o ON o.order_id = ti.order_id
      LEFT JOIN reports r ON r.order_id = ti.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
      LEFT JOIN users u ON u.user_id = ti.current_assignee
      LEFT JOIN users tech ON tech.user_id = ti.technician_id
      LEFT JOIN users sup ON sup.user_id = ti.supervisor_id
      LEFT JOIN payers pay ON pay.payer_id = o.payer_id
      LEFT JOIN users sales ON sales.user_id = pay.owner_user_id
      LEFT JOIN departments d ON d.department_id = ti.department_id
      LEFT JOIN lab_groups lg ON lg.group_id = ti.group_id
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
      LEFT JOIN settlements s ON s.settlement_type = 'invoice' AND JSON_CONTAINS(s.test_item_ids, CAST(ti.test_item_id AS JSON), '$')
      LEFT JOIN (
        SELECT settlement_id, test_item_id, SUM(amount) AS allocated_amount
        FROM settlement_item_payment_allocations
        GROUP BY settlement_id, test_item_id
      ) sia_sum ON sia_sum.settlement_id = s.settlement_id AND sia_sum.test_item_id = ti.test_item_id
      LEFT JOIN customers c_settlement ON c_settlement.customer_id = s.customer_id`;

/**
 * 列表分页「先取 id」阶段：纯文本/转单号等模糊条件会引用 o / c / comm，需与 COUNT 相同的轻量 JOIN。
 * 日期关键字、无关键字等其它筛选仅涉及 ti（及 EXISTS 内仍用 ti 时），可只扫 test_items，避免无筛选时先套全表 project_files/settlements。
 */
export function commissionListWhereNeedsOrderJoins(req) {
  const q = String(req.query?.q ?? '').trim();
  if (!q) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return false;
  return true;
}

export function parseCommissionOrderIds(req) {
  const raw = req.query?.order_ids;
  const values = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const seen = new Set();
  return values
    .flatMap((value) => String(value).split(/[\s,，、;；|]+/))
    .map((value) => value.trim().toUpperCase())
    .filter((value) => {
      if (!/^JC[A-Z0-9_-]+$/.test(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

/** 与 COUNT 查询一致：仅 orders / customers / commissioners，供分页 id 子查询使用 */
export const COMMISSION_FORM_PAGE_IDS_JOIN_BLOCK = `
      FROM test_items ti
      LEFT JOIN orders o ON o.order_id = ti.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id`;

/**
 * @returns {{ where: string, params: any[] }}
 */
export function buildCommissionListFilters(req) {
  const { status, department_id, month_filter, my_items, invoice_status, billing_date } = req.query;
  // 与 commissionListWhereNeedsOrderJoins 一致：仅空格的关键字视为无搜索，避免 WHERE 引用 o/c/comm 但分页子查询未 JOIN
  const q = String(req.query?.q ?? '').trim();
  const like = `%${q}%`;
  const filters = [];
  const params = [];
  const user = req.user;
  const orderIds = parseCommissionOrderIds(req);

  if (user.role === 'admin') {
    // 全部
  } else if (user.role === 'leader') {
    const leaderDept = Number(user.department_id);
    if (leaderDept === 5 || leaderDept === 7) {
      // 委外/技术支持室主任：全部
    } else if (user.department_id) {
      filters.push('ti.department_id = ?');
      params.push(user.department_id);
    } else {
      filters.push('ti.department_id IN (SELECT department_id FROM lab_groups WHERE group_id = ?)');
      params.push(user.group_id);
    }
  } else if (user.role === 'supervisor') {
    filters.push('ti.supervisor_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'employee') {
    filters.push('ti.technician_id = ?');
    params.push(user.user_id);
  } else if (user.role === 'sales') {
    // 不筛
  }

  const statusArray = Array.isArray(status) ? status : (status ? [status] : []);

  if (statusArray.length > 0 && !statusArray.includes('cancelled')) {
    filters.push('ti.status != ?');
    params.push('cancelled');
  }

  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',');
    filters.push(`ti.order_id IN (${placeholders})`);
    params.push(...orderIds);
  } else if (q) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(q)) {
      filters.push('DATE(ti.field_test_time) = ?');
      params.push(q);
    } else {
      filters.push(
        '(ti.category_name LIKE ? OR ti.detail_name LIKE ? OR ti.test_code LIKE ? OR ti.order_id LIKE ? OR ti.settlement_serial_number LIKE ? OR o.original_order_id LIKE ? OR o.root_order_id LIKE ? OR c.customer_name LIKE ? OR comm.contact_name LIKE ? OR EXISTS (SELECT 1 FROM payers WHERE payers.payer_id = o.payer_id AND payers.contact_name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE users.user_id = ti.current_assignee AND users.name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE users.user_id = ti.supervisor_id AND users.name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE users.user_id = ti.technician_id AND users.name LIKE ?))'
      );
      params.push(like, like, like, like, like, like, like, like, like, like, like, like, like);
    }
  }

  if (statusArray.length > 0) {
    const placeholders = statusArray.map(() => '?').join(',');
    filters.push(`ti.status IN (${placeholders})`);
    params.push(...statusArray);
  }
  if (department_id) {
    filters.push('ti.department_id = ?');
    params.push(department_id);
  }
  if (invoice_status) {
    filters.push("COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = ?");
    params.push(invoice_status);
  }
  const monthFilters = Array.isArray(month_filter) ? month_filter : (month_filter ? [month_filter] : []);
  const monthPrefixes = monthFilters
    .map((value) => String(value || '').trim())
    .map((value) => {
      const [year, month] = value.split('-');
      if (!year || !month || year.length !== 4 || month.length !== 2) return null;
      return `JC${year.slice(-2)}${month.padStart(2, '0')}%`;
    })
    .filter(Boolean);
  if (monthPrefixes.length > 0) {
    filters.push(`(${monthPrefixes.map(() => 'ti.order_id LIKE ?').join(' OR ')})`);
    params.push(...monthPrefixes);
  }
  if (billing_date && /^\d{4}-\d{2}-\d{2}$/.test(String(billing_date))) {
    filters.push('DATE(ti.created_at) = ?');
    params.push(billing_date);
  }
  if (my_items === 'true') {
    filters.push('ti.current_assignee = ?');
    params.push(user.user_id);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  return { where, params };
}
