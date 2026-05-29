import express from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const PAYMENT_STATUS_RECEIVED = new Set(['已到款', '部分到款']);
const TX_PREPAYMENT_CREDIT = 'prepayment_credit';
const TX_SETTLEMENT_DEBIT = 'settlement_debit';
const TX_INVOICE_RECEIPT_CREDIT = 'invoice_receipt_credit';
const SETTLEMENT_METHODS = new Set(['invoice', 'prepaid', 'mixed']);

function canManageSettlement(user) {
  return user?.role === 'admin' || (Number(user?.department_id) === 5 && user?.role === 'leader');
}

function canCreatePrepayment(user) {
  return canManageSettlement(user) || user?.role === 'sales';
}

function isAdmin(user) {
  return user?.role === 'admin';
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

async function upsertPayerBalanceTransaction(executor, {
  payerId,
  settlementId,
  transactionType,
  direction,
  amount,
  remarks,
  createdBy
}) {
  const amountNum = normalizeAmount(amount);
  if (!payerId || !settlementId || !transactionType || !direction || amountNum === null || amountNum <= 0) {
    return;
  }

  await executor.query(
    `INSERT INTO payer_balance_transactions
      (payer_id, settlement_id, transaction_type, direction, amount, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      payer_id = VALUES(payer_id),
      direction = VALUES(direction),
      amount = VALUES(amount),
      remarks = VALUES(remarks),
      updated_at = NOW(3)`,
    [payerId, settlementId, transactionType, direction, amountNum, remarks || null, createdBy || null]
  );
}

async function deletePayerBalanceTransaction(executor, settlementId, transactionType) {
  if (!settlementId || !transactionType) return;
  await executor.query(
    'DELETE FROM payer_balance_transactions WHERE settlement_id = ? AND transaction_type = ?',
    [settlementId, transactionType]
  );
}

async function syncReceiptCredit(executor, settlementId, userId = null) {
  const [rows] = await executor.query(
    `SELECT settlement_id, settlement_type, settlement_method, payer_id, received_amount, payment_status, approval_status
     FROM settlements
     WHERE settlement_id = ?`,
    [settlementId]
  );
  if (rows.length === 0) return;
  const row = rows[0];
  const receivedAmount = normalizeAmount(row.received_amount);

  if (
    row.settlement_type === 'invoice' &&
    row.settlement_method !== 'prepaid' &&
    row.payer_id &&
    row.approval_status === 'approved' &&
    PAYMENT_STATUS_RECEIVED.has(row.payment_status) &&
    receivedAmount !== null &&
    receivedAmount > 0
  ) {
    await upsertPayerBalanceTransaction(executor, {
      payerId: row.payer_id,
      settlementId: row.settlement_id,
      transactionType: TX_INVOICE_RECEIPT_CREDIT,
      direction: 'credit',
      amount: receivedAmount,
      remarks: '普通开票到账冲抵',
      createdBy: userId
    });
  } else {
    await deletePayerBalanceTransaction(executor, settlementId, TX_INVOICE_RECEIPT_CREDIT);
  }
}

async function getPrepaymentLots(executor, payerId, excludeSettlementId = null) {
  const params = [payerId];
  let excludeSql = '';
  if (excludeSettlementId) {
    excludeSql = 'AND s.settlement_id <> ?';
    params.push(excludeSettlementId);
  }

  const [rows] = await executor.query(
    `SELECT
       s.settlement_id,
       s.invoice_number,
       s.invoice_date,
       COALESCE(s.received_amount, s.invoice_amount) AS original_amount,
       COALESCE(used.used_amount, 0) AS used_amount,
       COALESCE(s.received_amount, s.invoice_amount) - COALESCE(used.used_amount, 0) AS remaining_amount
     FROM settlements s
     LEFT JOIN (
       SELECT source_settlement_id, SUM(amount) AS used_amount
       FROM settlement_payment_allocations
       WHERE payment_source_type = 'prepayment'
       GROUP BY source_settlement_id
     ) used ON used.source_settlement_id = s.settlement_id
     WHERE s.settlement_type = 'prepayment'
       AND s.approval_status = 'approved'
       AND s.payer_id = ?
       AND s.invoice_number IS NOT NULL
       ${excludeSql}
     HAVING remaining_amount > 0.009
     ORDER BY s.invoice_date ASC, s.settlement_id ASC`,
    params
  );

  return rows.map(row => ({
    ...row,
    original_amount: normalizeAmount(row.original_amount) || 0,
    used_amount: normalizeAmount(row.used_amount) || 0,
    remaining_amount: normalizeAmount(row.remaining_amount) || 0
  }));
}

function buildFifoPrepaymentAllocations(lots, amountNeeded) {
  let remaining = normalizeAmount(amountNeeded) || 0;
  const allocations = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = normalizeAmount(lot.remaining_amount) || 0;
    if (available <= 0) continue;
    const used = Math.min(available, remaining);
    const amount = normalizeAmount(used);
    allocations.push({
      payment_source_type: 'prepayment',
      source_settlement_id: lot.settlement_id,
      invoice_number: lot.invoice_number,
      invoice_date: lot.invoice_date,
      amount
    });
    remaining = normalizeAmount(remaining - amount);
  }

  return {
    allocations,
    prepaidAmount: normalizeAmount((normalizeAmount(amountNeeded) || 0) - remaining) || 0,
    deficitAmount: normalizeAmount(remaining) || 0
  };
}

async function replacePaymentAllocations(executor, {
  settlementId,
  payerId,
  settlementMethod,
  totalAmount,
  newInvoiceNumber,
  newInvoiceDate
}) {
  await executor.query('DELETE FROM settlement_payment_allocations WHERE settlement_id = ?', [settlementId]);

  const lots = await getPrepaymentLots(executor, payerId, settlementId);
  const total = normalizeAmount(totalAmount) || 0;
  let allocationRows = [];
  let prepaidAmount = 0;
  let newInvoiceAmount = 0;

  if (settlementMethod === 'invoice') {
    if (!newInvoiceNumber) {
      throw new Error('纯开票结算必须填写票号');
    }
    newInvoiceAmount = total;
    allocationRows = [{
      payment_source_type: 'invoice',
      source_settlement_id: null,
      invoice_number: newInvoiceNumber,
      invoice_date: newInvoiceDate || null,
      amount: total
    }];
  } else {
    const fifo = buildFifoPrepaymentAllocations(lots, total);
    prepaidAmount = fifo.prepaidAmount;
    allocationRows = fifo.allocations;

    if (settlementMethod === 'prepaid') {
      if (fifo.deficitAmount > 0) {
        throw new Error('预存余额不足，请选择组合支付');
      }
    } else if (settlementMethod === 'mixed') {
      if (fifo.deficitAmount <= 0) {
        throw new Error('预存余额足够，无需组合支付，可选择余额支付或纯开票');
      }
      if (!newInvoiceNumber) {
        throw new Error('组合支付必须填写不足部分的新开票号');
      }
      newInvoiceAmount = fifo.deficitAmount;
      allocationRows.push({
        payment_source_type: 'invoice',
        source_settlement_id: null,
        invoice_number: newInvoiceNumber,
        invoice_date: newInvoiceDate || null,
        amount: newInvoiceAmount
      });
    }
  }

  for (const row of allocationRows) {
    await executor.query(
      `INSERT INTO settlement_payment_allocations
       (settlement_id, payer_id, payment_source_type, source_settlement_id, invoice_number, invoice_date, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementId,
        payerId,
        row.payment_source_type,
        row.source_settlement_id,
        row.invoice_number,
        row.invoice_date,
        row.amount
      ]
    );
  }

  const displayInvoiceNumber = [...new Set(allocationRows.map(row => row.invoice_number).filter(Boolean))].join('-');

  await executor.query(
    `UPDATE settlements
     SET invoice_number = ?,
         new_invoice_number = ?,
         new_invoice_amount = ?,
         updated_at = NOW(3)
     WHERE settlement_id = ?`,
    [
      displayInvoiceNumber || newInvoiceNumber || null,
      settlementMethod === 'prepaid' ? null : newInvoiceNumber || null,
      newInvoiceAmount > 0 ? newInvoiceAmount : null,
      settlementId
    ]
  );

  return {
    lots,
    allocations: allocationRows,
    prepaidAmount,
    newInvoiceAmount,
    displayInvoiceNumber
  };
}

async function syncPrepaymentCredit(executor, settlementId, userId = null) {
  const [rows] = await executor.query(
    `SELECT settlement_id, settlement_type, payer_id, invoice_number, invoice_amount, received_amount, approval_status
     FROM settlements
     WHERE settlement_id = ?`,
    [settlementId]
  );
  if (rows.length === 0) return;
  const row = rows[0];
  const creditAmount = normalizeAmount(row.received_amount) || normalizeAmount(row.invoice_amount);

  if (
    row.settlement_type === 'prepayment' &&
    row.approval_status === 'approved' &&
    row.payer_id &&
    row.invoice_number &&
    creditAmount !== null &&
    creditAmount > 0
  ) {
    await upsertPayerBalanceTransaction(executor, {
      payerId: row.payer_id,
      settlementId: row.settlement_id,
      transactionType: TX_PREPAYMENT_CREDIT,
      direction: 'credit',
      amount: creditAmount,
      remarks: '预存充值审批通过入账',
      createdBy: userId
    });
  } else {
    await deletePayerBalanceTransaction(executor, settlementId, TX_PREPAYMENT_CREDIT);
  }
}

async function resolvePayerIdFromOrderIds(executor, orderIds) {
  if (!orderIds) return null;
  const orderIdArray = String(orderIds).split('-').map(s => s.trim()).filter(Boolean);
  if (orderIdArray.length === 0) return null;
  const placeholders = orderIdArray.map(() => '?').join(',');
  const [rows] = await executor.query(
    `SELECT DISTINCT payer_id FROM orders WHERE order_id IN (${placeholders}) AND payer_id IS NOT NULL`,
    orderIdArray
  );
  if (rows.length === 1) return rows[0].payer_id;
  return null;
}

// 获取费用结算列表
router.get('/', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.settlement_id,
        s.settlement_type,
        s.settlement_method,
        s.invoice_number,
        s.new_invoice_number,
        s.invoice_date,
        s.order_ids,
        s.test_item_ids,
        s.invoice_amount,
        s.new_invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.approval_status,
        s.approved_by,
        s.approved_at,
        s.approval_remark,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.payer_id,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        COALESCE(s.customer_nature, c.nature) as display_customer_nature,
        u.name as assignee_name,
        approver.name as approved_by_name,
        p.contact_name as payer_contact_name,
        pc.customer_name as payer_customer_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      LEFT JOIN users approver ON s.approved_by = approver.user_id
      LEFT JOIN payers p ON s.payer_id = p.payer_id
      LEFT JOIN customers pc ON p.customer_id = pc.customer_id
      ORDER BY s.invoice_date DESC, s.created_at DESC
    `);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/payers/:payerId/prepayment-lots', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const lots = await getPrepaymentLots(pool, req.params.payerId);
    const totalBalance = normalizeAmount(lots.reduce((sum, lot) => sum + (Number(lot.remaining_amount) || 0), 0)) || 0;
    res.json({ payer_id: req.params.payerId, total_balance: totalBalance, lots });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 创建费用结算记录
router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  const settlementType = req.body?.settlement_type === 'prepayment' ? 'prepayment' : 'invoice';
  const settlementMethod = SETTLEMENT_METHODS.has(req.body?.settlement_method) ? req.body.settlement_method : 'invoice';
  
  // 普通结算沿用原权限；预存充值允许业务员发起，后续由admin审批。
  if (settlementType === 'prepayment' ? !canCreatePrepayment(user) : !canManageSettlement(user)) {
    return res.status(403).json({ error: '只有管理员和特定部门领导可以创建结算记录' });
  }
  
  const { 
    invoice_number,
    invoice_date, 
    order_ids, 
    invoice_amount, 
    received_amount,
    received_date,
    payment_status,
    remarks, 
    customer_id, 
    customer_name,
    customer_nature,
    payer_id,
    assignee_id,
    test_item_ids,
    test_item_amounts
  } = req.body;
  
  const invoiceAmountNum = Number(invoice_amount);
  const effectiveInvoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
  if (!effectiveInvoiceDate || invoice_amount === null || invoice_amount === undefined || invoice_amount === '' || !Number.isFinite(invoiceAmountNum) || invoiceAmountNum < 0) {
    return res.status(400).json({ error: '开票日期、委托单号组、开票金额为必填项，且开票金额须为大于等于0的数字' });
  }
  if (settlementType === 'invoice' && !order_ids) {
    return res.status(400).json({ error: '普通开票结算必须关联委托单号组' });
  }
  if (settlementType === 'prepayment' && !payer_id) {
    return res.status(400).json({ error: '预存充值必须选择付款方' });
  }
  if (settlementType === 'invoice' && settlementMethod === 'invoice' && !invoice_number) {
    return res.status(400).json({ error: '纯开票结算必须填写票号' });
  }
  if (settlementType === 'invoice' && settlementMethod === 'mixed' && !invoice_number) {
    return res.status(400).json({ error: '组合支付必须填写不足部分的新开票号' });
  }
  
  // customer_id和customer_name至少有一个
  if (!customer_id && !customer_name) {
    return res.status(400).json({ error: '客户ID或客户名称为必填项' });
  }
  
  const pool = await getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let final_customer_id = customer_id || null;
    let final_customer_name = customer_name || null;
    let final_customer_nature = customer_nature || null;
    
    // 如果提供了customer_id，从customers表获取信息
    if (customer_id) {
      const [customerRows] = await connection.query(
        'SELECT customer_name, nature FROM customers WHERE customer_id = ?',
        [customer_id]
      );
      if (customerRows.length > 0) {
        final_customer_name = customer_name || customerRows[0].customer_name;
        // 如果前端没有提供customer_nature，则使用customers表中的nature
        if (!customer_nature) {
          final_customer_nature = customerRows[0].nature || null;
        }
      }
    }
    
    const final_payer_id = payer_id || await resolvePayerIdFromOrderIds(connection, order_ids);
    const receivedAmountNum = normalizeAmount(received_amount);

    // 如果有test_item_ids，需要进行验证和处理
    const test_item_ids_json = settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) ? JSON.stringify(test_item_ids) : null;
    
    // 验证逻辑：检查开票预填价和开票状态
    if (settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) && test_item_ids.length > 0) {
      // 获取所有选中的test_items
      const placeholders = test_item_ids.map(() => '?').join(',');
      const [testItems] = await connection.query(
        `SELECT test_item_id, invoice_prefill_price, invoice_status FROM test_items WHERE test_item_id IN (${placeholders})`,
        test_item_ids
      );
      
      // 检查是否有开票预填价为空的项目
      const emptyPrefillItems = testItems.filter(item => item.invoice_prefill_price === null || item.invoice_prefill_price === undefined);
      if (emptyPrefillItems.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: '有检测项目的开票预填价为空，无法结算' });
      }
      
      // 检查是否有已结算的项目
      const settledItems = testItems.filter(item => item.invoice_status === '已结算' || item.invoice_status === '已到账');
      if (settledItems.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: '有检测项目已经结算过，不能进行二次结算' });
      }
    }
    
    // 插入结算记录，包含test_item_ids
    const [result] = await connection.query(
      `INSERT INTO settlements 
       (settlement_type, settlement_method, invoice_number, new_invoice_number, invoice_date, order_ids, test_item_ids, invoice_amount, new_invoice_amount, received_amount, received_date, remarks, customer_id, customer_name, assignee_id, customer_nature, payer_id, payment_status, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        settlementType,
        settlementType === 'prepayment' ? 'invoice' : settlementMethod,
        invoice_number || null,
        settlementMethod === 'prepaid' ? null : invoice_number || null,
        effectiveInvoiceDate,
        settlementType === 'prepayment' ? `PREPAY-${Date.now()}` : order_ids,
        test_item_ids_json,
        invoiceAmountNum,
        null,
        receivedAmountNum,
        received_date || null,
        remarks || null,
        final_customer_id,
        final_customer_name,
        assignee_id || null,
        final_customer_nature,
        final_payer_id || null,
        payment_status || '未到款'
      ]
    );
    
    // 如果有test_item_ids，按开票预填价比例分配开票金额，并更新开票状态
    if (settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) && test_item_ids.length > 0) {
      // 获取所有test_items的开票预填价
      const placeholders = test_item_ids.map(() => '?').join(',');
      const [testItems] = await connection.query(
        `SELECT test_item_id, invoice_prefill_price FROM test_items WHERE test_item_id IN (${placeholders})`,
        test_item_ids
      );
      
      // 计算总开票预填价
      const totalPrefillPrice = testItems.reduce((sum, item) => sum + (parseFloat(item.invoice_prefill_price) || 0), 0);
      
      if (totalPrefillPrice > 0) {
        // 按开票预填价比例分配开票金额
        const allocations = testItems.map((item) => {
          const prefillPrice = parseFloat(item.invoice_prefill_price) || 0;
          const proportion = prefillPrice / totalPrefillPrice;
          const allocatedAmount = parseFloat((invoiceAmountNum * proportion).toFixed(2));
          return {
            test_item_id: item.test_item_id,
            unpaid_amount: allocatedAmount
          };
        });
        
        // 处理精度问题：确保总和等于开票金额
        const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
        const difference = invoiceAmountNum - allocatedTotal;
        if (Math.abs(difference) > 0.01) {
          // 将差额加到最后一个项目
          allocations[allocations.length - 1].unpaid_amount = parseFloat((allocations[allocations.length - 1].unpaid_amount + difference).toFixed(2));
        }
        
        // 批量更新test_items表的unpaid_amount和invoice_status
        for (const allocation of allocations) {
          await connection.query(
            `UPDATE test_items 
             SET unpaid_amount = ?, invoice_status = '已结算'
             WHERE test_item_id = ?`,
            [allocation.unpaid_amount, allocation.test_item_id]
          );
        }
      } else if (invoiceAmountNum === 0) {
        // 开票预填价合计为 0 时无法按比例分摊；整单开票金额为 0 时各行记 0 并标记已结算
        for (const item of testItems) {
          await connection.query(
            `UPDATE test_items 
             SET unpaid_amount = 0, invoice_status = '已结算'
             WHERE test_item_id = ?`,
            [item.test_item_id]
          );
        }
      }
    }
    
    // 获取刚插入的记录
    const [newRecord] = await connection.query(
      `SELECT 
        s.settlement_id,
        s.settlement_type,
        s.settlement_method,
        s.invoice_number,
        s.new_invoice_number,
        s.invoice_date,
        s.order_ids,
        s.test_item_ids,
        s.invoice_amount,
        s.new_invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.approval_status,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.payer_id,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        u.name as assignee_name,
        p.contact_name as payer_contact_name,
        pc.customer_name as payer_customer_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      LEFT JOIN payers p ON s.payer_id = p.payer_id
      LEFT JOIN customers pc ON p.customer_id = pc.customer_id
      WHERE s.settlement_id = ?`,
      [result.insertId]
    );
    
    await connection.commit();
    res.status(201).json(newRecord[0]);
  } catch (e) {
    await connection.rollback();
    return res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

// 更新费用结算记录（主要用于更新到账金额、到账日期、到款情况等）
router.put('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和特定部门领导可以更新结算记录
  if (user.role !== 'admin' && !(user.department_id === 5 && user.role === 'leader')) {
    return res.status(403).json({ error: '只有管理员和特定部门领导可以更新结算记录' });
  }
  
  const { 
    invoice_number,
    invoice_amount,
    received_amount, 
    received_date, 
    payment_status,
    remarks,
    customer_name,
    customer_id,
    customer_nature,
    payer_id,
    assignee_id
  } = req.body;
  
  const pool = await getPool();
  
  try {
    const [existingRows] = await pool.query(
      'SELECT invoice_amount FROM settlements WHERE settlement_id = ?',
      [req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: '结算记录不存在' });
    }
    const existingInvoiceAmount = existingRows[0].invoice_amount;

    const invoiceAmountToCents = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.round(n * 100);
    };

    const deriveInvoiceStatusFromPaymentStatus = (ps) => {
      if (ps === '未到款') return '已结算';
      if (ps === '已到款' || ps === '部分到款') return '已到账';
      return null;
    };

    const syncTestItemsInvoiceStatusForSettlement = async (executor, settlementId, ps) => {
      if (ps === undefined) return;
      const targetInvoiceStatus = deriveInvoiceStatusFromPaymentStatus(ps);
      if (!targetInvoiceStatus) return;

      const [settlementRows] = await executor.query(
        'SELECT order_ids, test_item_ids FROM settlements WHERE settlement_id = ?',
        [settlementId]
      );
      if (!settlementRows || settlementRows.length === 0) return;

      const { order_ids: orderIdsStr, test_item_ids: testItemIdsStr } = settlementRows[0];

      let testItemIds = [];
      if (testItemIdsStr) {
        try {
          const parsed = JSON.parse(testItemIdsStr);
          if (Array.isArray(parsed)) testItemIds = parsed;
        } catch (e) {
          // ignore parse errors; fallback to order_ids below
        }
      }

      if ((!testItemIds || testItemIds.length === 0) && orderIdsStr) {
        const orderIdArray = orderIdsStr.split('-').map(s => s.trim()).filter(Boolean);
        if (orderIdArray.length > 0) {
          const placeholders = orderIdArray.map(() => '?').join(',');
          const [rows] = await executor.query(
            `SELECT test_item_id FROM test_items WHERE order_id IN (${placeholders}) AND status != 'cancelled'`,
            orderIdArray
          );
          testItemIds = (rows || []).map(r => r.test_item_id).filter(Boolean);
        }
      }

      if (!testItemIds || testItemIds.length === 0) return;

      const uniqueIds = Array.from(new Set(testItemIds));
      const placeholders = uniqueIds.map(() => '?').join(',');
      await executor.query(
        `UPDATE test_items 
         SET invoice_status = ?
         WHERE test_item_id IN (${placeholders})
           AND status != 'cancelled'
           AND invoice_status IN ('已结算','已到账')`,
        [targetInvoiceStatus, ...uniqueIds]
      );
    };

    const updateFields = [];
    const updateValues = [];

    if (invoice_number !== undefined) {
      updateFields.push('invoice_number = ?');
      updateValues.push(invoice_number || null);
    }
    
    if (received_amount !== undefined) {
      updateFields.push('received_amount = ?');
      updateValues.push(received_amount);
    }
    
    if (received_date !== undefined) {
      // 处理日期格式：如果是 ISO 格式或 Date 对象，转换为 YYYY-MM-DD
      let formattedDate = received_date;
      if (received_date !== null && received_date !== '') {
        try {
          // 如果是 ISO 格式字符串（包含 T 或 Z），转换为 Date 对象再格式化
          if (typeof received_date === 'string' && (received_date.includes('T') || received_date.includes('Z'))) {
            const date = new Date(received_date);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              formattedDate = `${year}-${month}-${day}`;
            }
          } else if (typeof received_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(received_date)) {
            // 如果已经是 YYYY-MM-DD 格式，直接使用
            formattedDate = received_date;
          }
        } catch (e) {
          // 如果转换失败，使用原值（可能会报错，但至少不会丢失数据）
          formattedDate = received_date;
        }
      }
      updateFields.push('received_date = ?');
      updateValues.push(formattedDate === '' ? null : formattedDate);
    }
    
    if (payment_status !== undefined) {
      updateFields.push('payment_status = ?');
      updateValues.push(payment_status);
    }
    
    if (remarks !== undefined) {
      updateFields.push('remarks = ?');
      updateValues.push(remarks);
    }
    
    // 仅在实际修改开票金额时重新分配 test_items.unpaid_amount（避免费用结算编辑其他字段时误用行金额比例覆盖）
    let shouldRecalculate = false;
    let newInvoiceAmount = null;
    
    if (invoice_amount !== undefined) {
      updateFields.push('invoice_amount = ?');
      updateValues.push(invoice_amount);
      const newCents = invoiceAmountToCents(invoice_amount);
      const oldCents = invoiceAmountToCents(existingInvoiceAmount);
      if (newCents !== null && newCents !== oldCents) {
        shouldRecalculate = true;
        newInvoiceAmount = newCents / 100;
      }
    }
    
    if (customer_name !== undefined) {
      updateFields.push('customer_name = ?');
      updateValues.push(customer_name);
    }
    
    // 如果提供了customer_id，更新它；如果customer_id为null，也更新
    if (customer_id !== undefined) {
      updateFields.push('customer_id = ?');
      updateValues.push(customer_id);
    }
    
    if (customer_nature !== undefined) {
      updateFields.push('customer_nature = ?');
      updateValues.push(customer_nature);
    }

    if (payer_id !== undefined) {
      updateFields.push('payer_id = ?');
      updateValues.push(payer_id || null);
    }
    
    if (assignee_id !== undefined) {
      updateFields.push('assignee_id = ?');
      updateValues.push(assignee_id);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }
    
    updateValues.push(req.params.id);
    
    // 如果更新了开票金额，需要重新计算分配
    if (shouldRecalculate) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        // 先获取当前结算记录的order_ids和test_item_ids
        const [currentSettlement] = await connection.query(
          'SELECT order_ids, test_item_ids FROM settlements WHERE settlement_id = ?',
          [req.params.id]
        );
        
        if (currentSettlement.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: '结算记录不存在' });
        }
        
        const orderIds = currentSettlement[0].order_ids;
        const test_item_ids_str = currentSettlement[0].test_item_ids;
        
        // 更新settlements表
        await connection.query(
          `UPDATE settlements SET ${updateFields.join(', ')}, updated_at = NOW() WHERE settlement_id = ?`,
          updateValues
        );

        // 联动：更新到款情况时，同步更新关联 test_items 的开票状态
        await syncTestItemsInvoiceStatusForSettlement(connection, req.params.id, payment_status);
        await syncReceiptCredit(connection, req.params.id, user.user_id);
        await syncPrepaymentCredit(connection, req.params.id, user.user_id);
        
        // 重新分配 test_items.unpaid_amount：与创建结算一致，按开票预填价比例；无 test_item_ids 时按委托单号组内未取消项目
        let testItemIds = [];
        if (test_item_ids_str && String(test_item_ids_str).trim() !== '') {
          try {
            const parsed = JSON.parse(test_item_ids_str);
            if (Array.isArray(parsed) && parsed.length > 0) {
              testItemIds = parsed.filter((id) => id != null && id !== '');
            }
          } catch (parseErr) {
            console.error('Failed to parse test_item_ids:', parseErr);
          }
        }
        if (testItemIds.length === 0 && orderIds) {
          const orderIdArray = String(orderIds).split('-').map((s) => s.trim()).filter(Boolean);
          if (orderIdArray.length > 0) {
            const ph = orderIdArray.map(() => '?').join(',');
            const [orderItems] = await connection.query(
              `SELECT test_item_id FROM test_items WHERE order_id IN (${ph}) AND status != 'cancelled'`,
              orderIdArray
            );
            testItemIds = orderItems.map((r) => r.test_item_id);
          }
        }

        if (testItemIds.length > 0) {
          const placeholders = testItemIds.map(() => '?').join(',');
          const [testItems] = await connection.query(
            `SELECT test_item_id, invoice_prefill_price FROM test_items WHERE test_item_id IN (${placeholders}) AND status != 'cancelled'`,
            testItemIds
          );

          const totalPrefillPrice = testItems.reduce((sum, item) => sum + (parseFloat(item.invoice_prefill_price) || 0), 0);

          if (totalPrefillPrice > 0) {
            const allocations = testItems.map((item) => {
              const prefillPrice = parseFloat(item.invoice_prefill_price) || 0;
              const proportion = prefillPrice / totalPrefillPrice;
              const allocatedAmount = parseFloat((newInvoiceAmount * proportion).toFixed(2));
              return {
                test_item_id: item.test_item_id,
                unpaid_amount: allocatedAmount
              };
            });

            const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
            const difference = newInvoiceAmount - allocatedTotal;
            if (Math.abs(difference) > 0.01 && allocations.length > 0) {
              allocations[allocations.length - 1].unpaid_amount = parseFloat(
                (allocations[allocations.length - 1].unpaid_amount + difference).toFixed(2)
              );
            }

            for (const allocation of allocations) {
              await connection.query(
                'UPDATE test_items SET unpaid_amount = ? WHERE test_item_id = ?',
                [allocation.unpaid_amount, allocation.test_item_id]
              );
            }
          } else if (newInvoiceAmount === 0 && testItems.length > 0) {
            for (const item of testItems) {
              await connection.query(
                'UPDATE test_items SET unpaid_amount = 0 WHERE test_item_id = ?',
                [item.test_item_id]
              );
            }
          }
        }
        
        await connection.commit();
        connection.release();
      } catch (e) {
        await connection.rollback();
        connection.release();
        throw e;
      }
    } else {
      // 如果没有更新开票金额，直接更新
      await pool.query(
        `UPDATE settlements SET ${updateFields.join(', ')}, updated_at = NOW() WHERE settlement_id = ?`,
        updateValues
      );

      // 联动：更新到款情况时，同步更新关联 test_items 的开票状态
      await syncTestItemsInvoiceStatusForSettlement(pool, req.params.id, payment_status);
      await syncReceiptCredit(pool, req.params.id, user.user_id);
      await syncPrepaymentCredit(pool, req.params.id, user.user_id);
    }
    
    // 获取更新后的记录
    const [updatedRecord] = await pool.query(
      `SELECT 
        s.settlement_id,
        s.invoice_date,
        s.order_ids,
        s.invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.approval_status,
        s.settlement_type,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.payer_id,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        u.name as assignee_name,
        p.contact_name as payer_contact_name,
        pc.customer_name as payer_customer_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      LEFT JOIN payers p ON s.payer_id = p.payer_id
      LEFT JOIN customers pc ON p.customer_id = pc.customer_id
      WHERE s.settlement_id = ?`,
      [req.params.id]
    );
    
    if (updatedRecord.length === 0) {
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    res.json(updatedRecord[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 审批结算/预存流水。admin审批通过后，普通结算扣减余额，预存充值增加余额。
router.post('/:id/approval', requireAuth, async (req, res) => {
  const user = req.user;
  if (!isAdmin(user)) {
    return res.status(403).json({ error: '只有管理员可以审批结算/预存流水' });
  }

  const { action, approval_remark } = req.body || {};
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: '审批动作必须为 approved 或 rejected' });
  }

  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT settlement_id, settlement_type, settlement_method, invoice_number, new_invoice_number, invoice_date, order_ids, invoice_amount,
              received_amount, payer_id, payment_status
       FROM settlements
       WHERE settlement_id = ?
       FOR UPDATE`,
      [req.params.id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '结算记录不存在' });
    }

    const settlement = rows[0];
    let finalPayerId = settlement.payer_id;
    if (!finalPayerId && settlement.settlement_type === 'invoice') {
      finalPayerId = await resolvePayerIdFromOrderIds(connection, settlement.order_ids);
    }

    if (action === 'approved') {
      if (!finalPayerId) {
        await connection.rollback();
        return res.status(400).json({ error: '审批通过前必须确认付款方' });
      }
      if (settlement.settlement_type === 'prepayment' && !settlement.invoice_number) {
        await connection.rollback();
        return res.status(400).json({ error: '预存充值审批通过前必须先填写发票票号' });
      }
    }

    await connection.query(
      `UPDATE settlements
       SET approval_status = ?,
           approved_by = ?,
           approved_at = NOW(3),
           approval_remark = ?,
           payer_id = COALESCE(?, payer_id),
           updated_at = NOW(3)
       WHERE settlement_id = ?`,
      [action, user.user_id, approval_remark || null, finalPayerId || null, req.params.id]
    );

    if (action === 'approved') {
      if (settlement.settlement_type === 'invoice') {
        const allocationResult = await replacePaymentAllocations(connection, {
          settlementId: settlement.settlement_id,
          payerId: finalPayerId,
          settlementMethod: settlement.settlement_method || 'invoice',
          totalAmount: settlement.invoice_amount,
          newInvoiceNumber: settlement.new_invoice_number || settlement.invoice_number,
          newInvoiceDate: settlement.invoice_date
        });
        await upsertPayerBalanceTransaction(connection, {
          payerId: finalPayerId,
          settlementId: settlement.settlement_id,
          transactionType: TX_SETTLEMENT_DEBIT,
          direction: 'debit',
          amount: settlement.invoice_amount,
          remarks: allocationResult.displayInvoiceNumber
            ? `结算审批通过扣款，票号：${allocationResult.displayInvoiceNumber}`
            : '结算审批通过扣款',
          createdBy: user.user_id
        });
        await syncReceiptCredit(connection, settlement.settlement_id, user.user_id);
      } else if (settlement.settlement_type === 'prepayment') {
        await syncPrepaymentCredit(connection, settlement.settlement_id, user.user_id);
      }
    } else {
      await connection.query('DELETE FROM settlement_payment_allocations WHERE settlement_id = ?', [settlement.settlement_id]);
      await deletePayerBalanceTransaction(connection, settlement.settlement_id, TX_SETTLEMENT_DEBIT);
      await deletePayerBalanceTransaction(connection, settlement.settlement_id, TX_PREPAYMENT_CREDIT);
      await deletePayerBalanceTransaction(connection, settlement.settlement_id, TX_INVOICE_RECEIPT_CREDIT);
    }

    await connection.commit();
    res.json({ ok: true });
  } catch (e) {
    await connection.rollback();
    return res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

// 获取客户列表（用于开票单位选择）
router.get('/customers', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      'SELECT customer_id, customer_name FROM customers WHERE is_active = 1 ORDER BY customer_name ASC'
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 客户模糊查询（用于开票单位输入+模糊查询）
router.get('/customers/search', requireAuth, async (req, res) => {
  const { q = '' } = req.query;
  const pool = await getPool();
  try {
    if (!q || q.trim() === '') {
      return res.json([]);
    }
    const searchTerm = `%${q.trim()}%`;
    const [rows] = await pool.query(
      `SELECT customer_id, customer_name, nature as customer_nature 
       FROM customers 
       WHERE is_active = 1 AND customer_name LIKE ? 
       ORDER BY customer_name ASC 
       LIMIT 20`,
      [searchTerm]
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 删除费用结算记录
router.delete('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和特定部门领导可以删除结算记录
  if (user.role !== 'admin' && !(user.department_id === 5 && user.role === 'leader')) {
    return res.status(403).json({ error: '只有管理员和特定部门领导可以删除结算记录' });
  }
  
  const pool = await getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 先获取要删除的结算记录（与创建/更新一致：优先按 test_item_ids 恢复，否则按委托单号组内未取消项目）
    const [settlementRows] = await connection.query(
      'SELECT order_ids, test_item_ids FROM settlements WHERE settlement_id = ?',
      [req.params.id]
    );
    
    if (settlementRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    const { order_ids: orderIdsStr, test_item_ids: testItemIdsStr } = settlementRows[0];

    let testItemIds = [];
    if (testItemIdsStr && String(testItemIdsStr).trim() !== '') {
      try {
        const parsed = JSON.parse(testItemIdsStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          testItemIds = parsed.filter((id) => id != null && id !== '');
        }
      } catch (parseErr) {
        console.error('Failed to parse test_item_ids on delete:', parseErr);
      }
    }
    if (testItemIds.length === 0 && orderIdsStr) {
      const orderIdArray = String(orderIdsStr)
        .split('-')
        .map((s) => s.trim())
        .filter(Boolean);
      if (orderIdArray.length > 0) {
        const ph = orderIdArray.map(() => '?').join(',');
        const [rows] = await connection.query(
          `SELECT test_item_id FROM test_items WHERE order_id IN (${ph}) AND status != 'cancelled'`,
          orderIdArray
        );
        testItemIds = (rows || []).map((r) => r.test_item_id).filter(Boolean);
      }
    }

    if (testItemIds.length > 0) {
      const uniqueIds = Array.from(new Set(testItemIds));
      const ph = uniqueIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE test_items 
         SET unpaid_amount = 0,
             invoice_status = '未结算',
             invoice_prefill_confirmed = 0
         WHERE test_item_id IN (${ph})`,
        uniqueIds
      );
    }
    
    await connection.query(
      'DELETE FROM payer_balance_transactions WHERE settlement_id = ?',
      [req.params.id]
    );

    await connection.query(
      'DELETE FROM settlement_payment_allocations WHERE settlement_id = ?',
      [req.params.id]
    );

    // 删除结算记录
    const [result] = await connection.query(
      'DELETE FROM settlements WHERE settlement_id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    await connection.commit();
    res.json({ ok: true, message: '删除成功' });
  } catch (e) {
    await connection.rollback();
    return res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

// 获取业务人员列表（用于业务人员选择，只返回sales角色）
router.get('/assignees', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.account 
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'sales' AND u.is_active = 1
       ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
