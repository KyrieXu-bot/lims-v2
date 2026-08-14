import express from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const PAYMENT_STATUS_RECEIVED = new Set(['已到款', '部分到款']);
const TX_PREPAYMENT_CREDIT = 'prepayment_credit';
const TX_SETTLEMENT_DEBIT = 'settlement_debit';
const TX_INVOICE_RECEIPT_CREDIT = 'invoice_receipt_credit';
const SETTLEMENT_METHODS = new Set(['invoice', 'prepaid', 'mixed']);
const SETTLEMENT_APPROVER_USER_ID = 'JC0061';
const PREPAYMENT_TYPES = new Set(['normal', 'paper_award']);
const SETTLEMENT_DEPARTMENTS = [
  { id: 1, key: 'dept_1_amount' },
  { id: 2, key: 'dept_2_amount' },
  { id: 3, key: 'dept_3_amount' },
  { id: 5, key: 'dept_5_amount' },
  { id: 6, key: 'dept_6_amount' },
  { id: 7, key: 'dept_7_amount' }
];
const SETTLEMENT_DEPARTMENT_IDS = new Set(SETTLEMENT_DEPARTMENTS.map((dept) => dept.id));

function canManageSettlement(user) {
  return user?.role === 'admin' || (Number(user?.department_id) === 5 && user?.role === 'leader');
}

function canCreateSettlement(user) {
  return canManageSettlement(user) || user?.role === 'sales';
}

function canCreatePrepayment(user) {
  return canCreateSettlement(user);
}

function isAdmin(user) {
  return user?.role === 'admin';
}

function isSettlementApprover(user) {
  return user?.role === 'admin' && String(user?.user_id) === SETTLEMENT_APPROVER_USER_ID;
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function getSettlementItemBasis(item, fallbackKeys = ['final_unit_price']) {
  const prefill = normalizeAmount(item?.invoice_prefill_price);
  if (prefill !== null) return prefill;
  for (const key of fallbackKeys) {
    const value = normalizeAmount(item?.[key]);
    if (value !== null) return value;
  }
  return 0;
}

function getPrepaymentUsableAmount(row) {
  return normalizeAmount(row?.prepayment_total_amount) ||
    normalizeAmount((normalizeAmount(row?.invoice_amount) || 0) + (normalizeAmount(row?.gift_amount) || 0)) ||
    normalizeAmount(row?.received_amount) ||
    normalizeAmount(row?.invoice_amount) ||
    0;
}

function parseSettlementTestItemIds(raw) {
  if (!raw || String(raw).trim() === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed)
      ? parsed.map((id) => Number(id)).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

async function attachDepartmentAllocationAmounts(executor, settlementRows) {
  for (const row of settlementRows) {
    for (const dept of SETTLEMENT_DEPARTMENTS) {
      row[dept.key] = 0;
    }
  }

  const allIds = new Set();
  const idsBySettlement = new Map();
  for (const row of settlementRows) {
    if (row.settlement_type !== 'invoice') continue;
    const ids = parseSettlementTestItemIds(row.test_item_ids);
    if (ids.length === 0) continue;
    idsBySettlement.set(String(row.settlement_id), ids);
    ids.forEach((id) => allIds.add(id));
  }

  if (allIds.size === 0) return settlementRows;

  const idList = [...allIds];
  const ph = idList.map(() => '?').join(',');
  const [itemRows] = await executor.query(
    `SELECT test_item_id, department_id, invoice_prefill_price, final_unit_price
     FROM test_items
     WHERE test_item_id IN (${ph})
       AND status != 'cancelled'`,
    idList
  );
  const itemMap = new Map(itemRows.map((item) => [Number(item.test_item_id), item]));

  for (const row of settlementRows) {
    const ids = idsBySettlement.get(String(row.settlement_id));
    if (!ids || ids.length === 0) continue;
    const receivedAmount = normalizeAmount(row.received_amount) || 0;
    if (receivedAmount <= 0) continue;

    const deptBasis = new Map();
    let totalBasis = 0;
    for (const id of ids) {
      const item = itemMap.get(Number(id));
      if (!item) continue;
      const deptId = Number(item.department_id);
      if (!SETTLEMENT_DEPARTMENT_IDS.has(deptId)) continue;
      const basis = getSettlementItemBasis(item, ['final_unit_price']);
      if (basis <= 0) continue;
      totalBasis += basis;
      deptBasis.set(deptId, (deptBasis.get(deptId) || 0) + basis);
    }

    if (totalBasis <= 0) continue;
    let allocatedTotal = 0;
    const allocatedKeys = [];
    for (const dept of SETTLEMENT_DEPARTMENTS) {
      const basis = deptBasis.get(dept.id) || 0;
      const amount = basis > 0 ? Math.round((receivedAmount * basis / totalBasis) * 100) / 100 : 0;
      row[dept.key] = amount;
      allocatedTotal += amount;
      if (amount > 0) allocatedKeys.push(dept.key);
    }

    const diff = Math.round((receivedAmount - allocatedTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.01 && allocatedKeys.length > 0) {
      const lastKey = allocatedKeys[allocatedKeys.length - 1];
      row[lastKey] = Math.round((row[lastKey] + diff) * 100) / 100;
    }
  }

  return settlementRows;
}

function formatDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return {
    sqlDate: `${year}-${month}-${day}`,
    compact: `${year}${month}${day}`
  };
}

async function generateDailySerial(executor, serialType) {
  const config = {
    settlement: { prefix: 'JS' },
    prepayment: { prefix: 'YC' }
  }[serialType];
  if (!config) throw new Error('Invalid serial type');

  const { sqlDate, compact } = formatDateKey();
  const [rows] = await executor.query(
    `SELECT current_value
     FROM settlement_serial_sequences
     WHERE serial_type = ? AND serial_date = ?
     FOR UPDATE`,
    [serialType, sqlDate]
  );

  let nextValue = 1;
  if (rows.length === 0) {
    await executor.query(
      `INSERT INTO settlement_serial_sequences (serial_type, serial_date, current_value)
       VALUES (?, ?, ?)`,
      [serialType, sqlDate, nextValue]
    );
  } else {
    nextValue = Number(rows[0].current_value || 0) + 1;
    await executor.query(
      `UPDATE settlement_serial_sequences
       SET current_value = ?, updated_at = NOW(3)
       WHERE serial_type = ? AND serial_date = ?`,
      [nextValue, serialType, sqlDate]
    );
  }

  return `${config.prefix}${compact}-${String(nextValue).padStart(3, '0')}`;
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
    `SELECT settlement_id, settlement_type, settlement_method, payer_id, invoice_number, received_amount, payment_status, approval_status
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
    row.invoice_number &&
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
       s.invoice_amount,
       s.received_amount,
       COALESCE(s.gift_amount, 0) AS gift_amount,
       COALESCE(s.prepayment_total_amount, s.invoice_amount + COALESCE(s.gift_amount, 0), s.received_amount, s.invoice_amount) AS original_amount,
       COALESCE(used.used_amount, 0) AS used_amount,
       COALESCE(s.prepayment_total_amount, s.invoice_amount + COALESCE(s.gift_amount, 0), s.received_amount, s.invoice_amount) - COALESCE(used.used_amount, 0) AS remaining_amount
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

function allocateAmountByWeight(rows, amount, weightKey = 'weight') {
  const total = normalizeAmount(amount) || 0;
  if (!Array.isArray(rows) || rows.length === 0 || total <= 0) return [];
  const totalWeight = rows.reduce((sum, row) => sum + (Number(row[weightKey]) || 0), 0);
  if (totalWeight <= 0) return [];

  const allocations = rows.map(row => {
    const weight = Number(row[weightKey]) || 0;
    return {
      ...row,
      amount: normalizeAmount(total * weight / totalWeight) || 0
    };
  });

  const allocatedTotal = allocations.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const difference = normalizeAmount(total - allocatedTotal) || 0;
  const lastPositiveIndex = allocations.map((row, index) => ({ row, index })).filter(({ row }) => (Number(row[weightKey]) || 0) > 0).pop()?.index;
  if (Math.abs(difference) >= 0.01 && lastPositiveIndex !== undefined) {
    allocations[lastPositiveIndex].amount = normalizeAmount(allocations[lastPositiveIndex].amount + difference) || 0;
  }

  return allocations.filter(row => row.amount > 0);
}

async function getSettlementTestItems(executor, settlement) {
  let testItemIds = [];
  if (settlement?.test_item_ids) {
    try {
      const parsed = typeof settlement.test_item_ids === 'string'
        ? JSON.parse(settlement.test_item_ids)
        : settlement.test_item_ids;
      if (Array.isArray(parsed)) {
        testItemIds = parsed.filter(id => id !== null && id !== undefined && id !== '');
      }
    } catch (e) {
      testItemIds = [];
    }
  }

  if (testItemIds.length === 0 && settlement?.order_ids) {
    const orderIds = String(settlement.order_ids).split('-').map(s => s.trim()).filter(Boolean);
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const [rows] = await executor.query(
        `SELECT test_item_id FROM test_items WHERE order_id IN (${placeholders}) AND status != 'cancelled'`,
        orderIds
      );
      testItemIds = rows.map(row => row.test_item_id).filter(Boolean);
    }
  }

  if (testItemIds.length === 0) return [];
  const uniqueIds = [...new Set(testItemIds.map(id => Number(id)).filter(Number.isFinite))];
  if (uniqueIds.length === 0) return [];

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await executor.query(
    `SELECT test_item_id, invoice_prefill_price, final_unit_price, line_total
     FROM test_items
     WHERE test_item_id IN (${placeholders})
       AND status != 'cancelled'`,
    uniqueIds
  );

  return rows.map(row => ({
    ...row,
    weight: getSettlementItemBasis(row, ['final_unit_price', 'line_total'])
  }));
}

async function replaceItemPaymentAllocations(executor, settlement, paymentAllocations) {
  await executor.query(
    'DELETE FROM settlement_item_payment_allocations WHERE settlement_id = ?',
    [settlement.settlement_id]
  );

  const testItems = await getSettlementTestItems(executor, settlement);
  if (testItems.length === 0 || !Array.isArray(paymentAllocations) || paymentAllocations.length === 0) {
    return [];
  }

  const itemRows = [];
  for (const paymentAllocation of paymentAllocations) {
    const splitRows = allocateAmountByWeight(testItems, paymentAllocation.amount, 'weight');
    for (const split of splitRows) {
      itemRows.push({
        test_item_id: split.test_item_id,
        payment_source_type: paymentAllocation.payment_source_type,
        source_settlement_id: paymentAllocation.source_settlement_id || null,
        invoice_number: paymentAllocation.invoice_number,
        invoice_date: paymentAllocation.invoice_date || null,
        amount: split.amount
      });
    }
  }

  for (const row of itemRows) {
    await executor.query(
      `INSERT INTO settlement_item_payment_allocations
       (settlement_id, test_item_id, payment_source_type, source_settlement_id, invoice_number, invoice_date, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        settlement.settlement_id,
        row.test_item_id,
        row.payment_source_type,
        row.source_settlement_id,
        row.invoice_number,
        row.invoice_date,
        row.amount
      ]
    );
  }

  const affectedTestItemIds = [...new Set(itemRows.map(row => Number(row.test_item_id)).filter(Number.isFinite))];
  for (const testItemId of affectedTestItemIds) {
    const [totalRows] = await executor.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount
       FROM settlement_item_payment_allocations
       WHERE test_item_id = ?`,
      [testItemId]
    );
    const amount = normalizeAmount(totalRows[0]?.total_amount) || 0;
    await executor.query(
      'UPDATE test_items SET unpaid_amount = ? WHERE test_item_id = ?',
      [amount, testItemId]
    );
  }

  return itemRows;
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
    `SELECT settlement_id, settlement_type, payer_id, invoice_number, invoice_amount, received_amount,
            gift_amount, prepayment_total_amount, approval_status
     FROM settlements
     WHERE settlement_id = ?`,
    [settlementId]
  );
  if (rows.length === 0) return;
  const row = rows[0];
  const creditAmount = getPrepaymentUsableAmount(row);

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
async function syncSettlementDebit(executor, settlementId, userId = null) {
  const [rows] = await executor.query(
    `SELECT settlement_id, settlement_type, settlement_method, invoice_number, new_invoice_number, invoice_date,
            order_ids, invoice_amount, payer_id, approval_status, test_item_ids
     FROM settlements
     WHERE settlement_id = ?`,
    [settlementId]
  );
  if (rows.length === 0) return { synced: false };

  const settlement = rows[0];
  const amount = normalizeAmount(settlement.invoice_amount);
  const method = settlement.settlement_method || 'invoice';
  const finalPayerId = settlement.payer_id || await resolvePayerIdFromOrderIds(executor, settlement.order_ids);
  const notReady =
    settlement.settlement_type !== 'invoice' ||
    settlement.approval_status !== 'approved' ||
    !finalPayerId ||
    amount === null ||
    amount <= 0 ||
    (method !== 'prepaid' && !(settlement.new_invoice_number || settlement.invoice_number));

  if (notReady) {
    await executor.query('DELETE FROM settlement_item_payment_allocations WHERE settlement_id = ?', [settlementId]);
    await executor.query('DELETE FROM settlement_payment_allocations WHERE settlement_id = ?', [settlementId]);
    await deletePayerBalanceTransaction(executor, settlementId, TX_SETTLEMENT_DEBIT);
    return { synced: false };
  }

  const allocationResult = await replacePaymentAllocations(executor, {
    settlementId: settlement.settlement_id,
    payerId: finalPayerId,
    settlementMethod: method,
    totalAmount: amount,
    newInvoiceNumber: settlement.new_invoice_number || settlement.invoice_number,
    newInvoiceDate: settlement.invoice_date
  });
  await replaceItemPaymentAllocations(executor, settlement, allocationResult.allocations);
  await upsertPayerBalanceTransaction(executor, {
    payerId: finalPayerId,
    settlementId: settlement.settlement_id,
    transactionType: TX_SETTLEMENT_DEBIT,
    direction: 'debit',
    amount,
    remarks: allocationResult.displayInvoiceNumber
      ? `结算审批通过扣款，票号：${allocationResult.displayInvoiceNumber}`
      : '结算审批通过扣款',
    createdBy: userId
  });

  return { synced: true, displayInvoiceNumber: allocationResult.displayInvoiceNumber };
}

async function syncInvoiceStatusForSettlement(executor, settlementId) {
  const [settlementRows] = await executor.query(
    'SELECT order_ids, test_item_ids, invoice_number, payment_status FROM settlements WHERE settlement_id = ?',
    [settlementId]
  );
  if (!settlementRows || settlementRows.length === 0) return;

  const {
    order_ids: orderIdsStr,
    test_item_ids: testItemIdsStr
  } = settlementRows[0];

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
    const orderIdArray = String(orderIdsStr).split('-').map(s => s.trim()).filter(Boolean);
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
  for (const testItemId of uniqueIds) {
    const [relatedRows] = await executor.query(
      `SELECT invoice_number, payment_status, approval_status
       FROM settlements
       WHERE settlement_type = 'invoice'
         AND approval_status <> 'rejected'
         AND test_item_ids IS NOT NULL
         AND JSON_VALID(test_item_ids) = 1
         AND JSON_CONTAINS(test_item_ids, CAST(? AS JSON), '$')`,
      [testItemId]
    );
    if (relatedRows.length === 0) continue;

    let targetInvoiceStatus = '已申请';
    const hasPending = relatedRows.some(row => row.approval_status === 'pending');
    const allReceived = relatedRows.every(row => PAYMENT_STATUS_RECEIVED.has(row.payment_status));
    const hasInvoice = relatedRows.some(row => Boolean(row.invoice_number));
    if (!hasPending && allReceived) {
      targetInvoiceStatus = '已到账';
    } else if (!hasPending && hasInvoice) {
      targetInvoiceStatus = '已开票';
    }

    await executor.query(
      `UPDATE test_items
       SET invoice_status = ?
       WHERE test_item_id = ?
         AND status != 'cancelled'
         AND invoice_status IN ('已申请','已开票','已到账')`,
      [targetInvoiceStatus, testItemId]
    );
  }
}

router.get('/', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const {
      q = '',
      keyword = '',
      page = 1,
      pageSize = 100,
      settlement_type,
      payment_status,
      approval_status,
      created_start,
      created_end,
      exclude_prepayment
    } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 100));
    const offset = (safePage - 1) * safePageSize;
    const filters = [];
    const params = [];
    const searchKeyword = String(keyword || q || '').trim();

    if (searchKeyword) {
      const like = `%${searchKeyword}%`;
      filters.push(`(
        s.settlement_serial_number LIKE ?
        OR s.prepayment_serial_number LIKE ?
        OR s.invoice_number LIKE ?
        OR s.new_invoice_number LIKE ?
        OR s.order_ids LIKE ?
        OR s.customer_name LIKE ?
        OR c.customer_name LIKE ?
        OR p.contact_name LIKE ?
        OR pc.customer_name LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like, like);
    }

    if (settlement_type) {
      if (['invoice', 'prepaid', 'mixed'].includes(settlement_type)) {
        filters.push(`s.settlement_type = 'invoice' AND s.settlement_method = ?`);
        params.push(settlement_type);
      } else {
        filters.push('s.settlement_type = ?');
        params.push(settlement_type);
      }
    }

    if (exclude_prepayment === '1' || exclude_prepayment === 'true') {
      filters.push(`s.settlement_type <> 'prepayment'`);
    }

    if (payment_status) {
      filters.push('s.payment_status = ?');
      params.push(payment_status);
    }

    if (approval_status) {
      filters.push('s.approval_status = ?');
      params.push(approval_status);
    }

    if (created_start) {
      filters.push('s.created_at >= ?');
      params.push(`${created_start} 00:00:00`);
    }

    if (created_end) {
      filters.push('s.created_at <= ?');
      params.push(`${created_end} 23:59:59`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM settlements s
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       LEFT JOIN payers p ON s.payer_id = p.payer_id
       LEFT JOIN customers pc ON p.customer_id = pc.customer_id
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(`
      SELECT 
        s.settlement_id,
        s.settlement_serial_number,
        s.prepayment_serial_number,
        s.settlement_type,
        s.settlement_method,
        s.prepayment_type,
        s.invoice_number,
        s.new_invoice_number,
        s.invoice_date,
        s.order_ids,
        s.test_item_ids,
        s.invoice_amount,
        s.gift_amount,
        s.prepayment_total_amount,
        s.new_invoice_amount,
        COALESCE(payment_summary.prepaid_amount, 0) AS prepaid_used_amount,
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
        pc.customer_name as payer_customer_name,
        CASE
          WHEN s.settlement_type = 'prepayment' THEN COALESCE(prepay_used.used_amount, 0)
          ELSE NULL
        END AS used_amount,
        CASE
          WHEN s.settlement_type = 'prepayment' AND s.approval_status = 'approved' THEN
            COALESCE(s.prepayment_total_amount, s.invoice_amount + COALESCE(s.gift_amount, 0), s.received_amount, s.invoice_amount) - COALESCE(prepay_used.used_amount, 0)
          WHEN s.settlement_type = 'prepayment' THEN 0
          ELSE NULL
        END AS remaining_amount
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      LEFT JOIN users approver ON s.approved_by = approver.user_id
      LEFT JOIN payers p ON s.payer_id = p.payer_id
      LEFT JOIN customers pc ON p.customer_id = pc.customer_id
      LEFT JOIN (
        SELECT source_settlement_id, SUM(amount) AS used_amount
        FROM settlement_payment_allocations
        WHERE payment_source_type = 'prepayment'
        GROUP BY source_settlement_id
      ) prepay_used ON prepay_used.source_settlement_id = s.settlement_id
      LEFT JOIN (
        SELECT settlement_id,
               SUM(CASE WHEN payment_source_type = 'prepayment' THEN amount ELSE 0 END) AS prepaid_amount
        FROM settlement_payment_allocations
        GROUP BY settlement_id
      ) payment_summary ON payment_summary.settlement_id = s.settlement_id
      ${whereSql}
      ORDER BY s.invoice_date DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, safePageSize, offset]);
    
    await attachDepartmentAllocationAmounts(pool, rows);
    res.json({
      data: rows,
      total: Number(countRows[0]?.total || 0),
      page: safePage,
      pageSize: safePageSize
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/invoice-summary', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const {
      q = '',
      page = 1,
      pageSize = 100,
      order_month,
      order_months,
      invoice_status,
      invoice_overdue,
      payment_overdue,
      export_all
    } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 100));
    const offset = (safePage - 1) * safePageSize;
    const shouldExportAll = export_all === '1' || export_all === 'true';
    const orderFilters = [];
    const orderParams = [];
    const finalFilters = [];
    const finalParams = [];
    const searchKeyword = String(q || '').trim();
    let matchingOrdersCteSql = '';
    let matchingOrdersJoinSql = '';
    const matchingOrdersParams = [];

    function parseSettlementOrderIds(orderIds) {
      return String(orderIds || '')
        .split('-')
        .map(id => id.trim())
        .filter(Boolean);
    }

    function addOrderIdSetFilter(ids) {
      if (!ids || ids.length === 0) {
        orderFilters.push('1 = 0');
        return;
      }
      orderFilters.push(`o.order_id IN (${ids.map(() => '?').join(',')})`);
      orderParams.push(...ids);
    }

    function parseOrderMonths(value) {
      const values = Array.isArray(value)
        ? value
        : String(value || '').split(',');
      return Array.from(new Set(
        values
          .map(item => String(item || '').trim())
          .filter(item => /^\d{6}$/.test(item))
      ));
    }

    function toDateOnly(value) {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function getOrderMonthDeadline(orderId) {
      const match = String(orderId || '').match(/^JC(\d{2})(\d{2})/);
      if (!match) return null;
      const year = 2000 + Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
      return new Date(year, monthIndex + 4, 0);
    }

    function addDays(date, days) {
      if (!date || days === null || days === undefined || days === '') return null;
      const dayCount = Number(days);
      if (!Number.isFinite(dayCount)) return null;
      const next = new Date(date);
      next.setDate(next.getDate() + dayCount);
      return next;
    }

    let overdueOrderSetsPromise = null;
    async function getOverdueOrderSets() {
      if (overdueOrderSetsPromise) return overdueOrderSetsPromise;
      overdueOrderSetsPromise = (async () => {
        const [orderRows] = await pool.query(
          `SELECT o.order_id, p.payment_term_days
           FROM orders o
           LEFT JOIN payers p ON o.payer_id = p.payer_id
           WHERE CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) >= '202601'
             AND EXISTS (
             SELECT 1
             FROM test_items active_ti
             WHERE active_ti.order_id = o.order_id
               AND active_ti.status != 'cancelled'
               AND (active_ti.business_confirmed = 1 OR active_ti.business_confirmed = '1')
           )`
        );
        const [settlementRows] = await pool.query(
          `SELECT settlement_id, order_ids, invoice_date, received_date, created_at
           FROM settlements
           WHERE settlement_type = 'invoice'`
        );

        const latestSettlementByOrderId = new Map();
        const rankValue = (row) => [
          toDateOnly(row.invoice_date)?.getTime() ?? -Infinity,
          row.created_at ? new Date(row.created_at).getTime() : -Infinity,
          Number(row.settlement_id) || 0
        ];
        const isLater = (next, current) => {
          if (!current) return true;
          const a = rankValue(next);
          const b = rankValue(current);
          return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
        };

        settlementRows.forEach(row => {
          parseSettlementOrderIds(row.order_ids).forEach(orderId => {
            const current = latestSettlementByOrderId.get(orderId);
            if (isLater(row, current)) latestSettlementByOrderId.set(orderId, row);
          });
        });

        const today = toDateOnly(new Date());
        const invoiceOverdueIds = [];
        const invoiceNotOverdueIds = [];
        const paymentOverdueIds = [];
        const paymentNotOverdueIds = [];

        orderRows.forEach(row => {
          const orderId = row.order_id;
          const settlement = latestSettlementByOrderId.get(orderId);
          const invoiceDate = toDateOnly(settlement?.invoice_date);
          const receivedDate = toDateOnly(settlement?.received_date);
          const invoiceDeadline = getOrderMonthDeadline(orderId);
          if (invoiceDeadline) {
            const invoiceCheckDate = invoiceDate || today;
            if (invoiceCheckDate > invoiceDeadline) {
              invoiceOverdueIds.push(orderId);
            } else {
              invoiceNotOverdueIds.push(orderId);
            }
          }

          const paymentDeadline = invoiceDate ? addDays(invoiceDate, row.payment_term_days) : null;
          if (!paymentDeadline) {
            paymentNotOverdueIds.push(orderId);
          } else {
            const paymentCheckDate = receivedDate || today;
            if (paymentCheckDate > paymentDeadline) {
              paymentOverdueIds.push(orderId);
            } else {
              paymentNotOverdueIds.push(orderId);
            }
          }
        });

        return { invoiceOverdueIds, invoiceNotOverdueIds, paymentOverdueIds, paymentNotOverdueIds };
      })();
      return overdueOrderSetsPromise;
    }

    if (searchKeyword) {
      const like = `%${searchKeyword}%`;
      matchingOrdersCteSql = `
        matching_order_ids AS (
          SELECT o.order_id
          FROM orders o
          LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
          LEFT JOIN payers p ON o.payer_id = p.payer_id
          LEFT JOIN users order_sales ON p.owner_user_id = order_sales.user_id
          WHERE o.order_id LIKE ?
             OR comm.commissioner_name LIKE ?
             OR p.contact_name LIKE ?
             OR order_sales.name LIKE ?
          UNION
          SELECT DISTINCT o.order_id
          FROM (
            SELECT search_s.order_ids
            FROM settlements search_s
            LEFT JOIN users search_u ON search_s.assignee_id = search_u.user_id
            WHERE search_s.settlement_type = 'invoice'
              AND (
                search_s.invoice_number LIKE ?
                OR search_s.customer_name LIKE ?
                OR search_u.name LIKE ?
              )
          ) matched_settlements
          JOIN orders o
            ON CONCAT('-', REPLACE(matched_settlements.order_ids, ' ', ''), '-') LIKE CONCAT('%-', o.order_id, '-%')
        )`;
      matchingOrdersJoinSql = 'JOIN matching_order_ids moi ON moi.order_id = o.order_id';
      matchingOrdersParams.push(like, like, like, like, like, like, like);
    }

    const selectedOrderMonths = parseOrderMonths(order_months || order_month);
    if (selectedOrderMonths.length > 0) {
      orderFilters.push(`CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) IN (${selectedOrderMonths.map(() => '?').join(',')})`);
      orderParams.push(...selectedOrderMonths);
    }

    orderFilters.push(`CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) >= '202601'`);

    orderFilters.push(`EXISTS (
      SELECT 1
      FROM test_items active_ti
      WHERE active_ti.order_id = o.order_id
        AND active_ti.status != 'cancelled'
        AND (active_ti.business_confirmed = 1 OR active_ti.business_confirmed = '1')
    )`);

    if (invoice_status === 'invoiced' || invoice_status === 'uninvoiced') {
      const [statusRows] = await pool.query(
        `SELECT order_ids
         FROM settlements
         WHERE settlement_type = 'invoice'
           AND invoice_number IS NOT NULL
           AND invoice_number <> ''`
      );
      const invoicedOrderIds = Array.from(new Set(
        statusRows.flatMap(row => parseSettlementOrderIds(row.order_ids))
      ));

      if (invoice_status === 'invoiced') {
        if (invoicedOrderIds.length === 0) {
          orderFilters.push('1 = 0');
        } else {
          orderFilters.push(`o.order_id IN (${invoicedOrderIds.map(() => '?').join(',')})`);
          orderParams.push(...invoicedOrderIds);
        }
      } else if (invoicedOrderIds.length > 0) {
        orderFilters.push(`o.order_id NOT IN (${invoicedOrderIds.map(() => '?').join(',')})`);
        orderParams.push(...invoicedOrderIds);
      }
    }

    if (invoice_overdue === 'overdue') {
      const { invoiceOverdueIds } = await getOverdueOrderSets();
      addOrderIdSetFilter(invoiceOverdueIds);
    } else if (invoice_overdue === 'not_overdue') {
      const { invoiceNotOverdueIds } = await getOverdueOrderSets();
      addOrderIdSetFilter(invoiceNotOverdueIds);
    }

    if (payment_overdue === 'overdue') {
      const { paymentOverdueIds } = await getOverdueOrderSets();
      addOrderIdSetFilter(paymentOverdueIds);
    } else if (payment_overdue === 'not_overdue') {
      const { paymentNotOverdueIds } = await getOverdueOrderSets();
      addOrderIdSetFilter(paymentNotOverdueIds);
    }

    const orderWhereSql = orderFilters.length ? `WHERE ${orderFilters.join(' AND ')}` : '';
    const finalWhereSql = finalFilters.length ? `WHERE ${finalFilters.join(' AND ')}` : '';
    const commonCtes = [matchingOrdersCteSql].filter(Boolean);
    const ctePrefixSql = commonCtes.length ? `WITH ${commonCtes.join(',')},` : 'WITH';
    const pageLimitSql = shouldExportAll ? '' : 'LIMIT ? OFFSET ?';

    if (finalFilters.length === 0) {
      const fastCountWithSql = commonCtes.length ? `WITH ${commonCtes.join(',')}` : '';
      const fastRowsWithSql = commonCtes.length ? `${fastCountWithSql},` : 'WITH';
      const fastRowParams = shouldExportAll
        ? [...matchingOrdersParams, ...orderParams]
        : [...matchingOrdersParams, ...orderParams, safePageSize, offset];

      const [countRows] = await pool.query(
        `${fastCountWithSql}
         SELECT COUNT(*) AS total
         FROM orders o
         ${matchingOrdersJoinSql}
         ${orderWhereSql}`,
        [...matchingOrdersParams, ...orderParams]
      );

      const [rows] = await pool.query(
        `${fastRowsWithSql} page_orders AS (
          SELECT
            o.order_id,
            o.invoice_summary_remark,
            CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) AS order_month,
            comm.commissioner_name AS order_customer_name,
            p.contact_name AS payer_contact_name,
            p.payment_term_days,
            order_sales.user_id AS order_assignee_id,
            order_sales.name AS order_assignee_name
          FROM orders o
          LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
          LEFT JOIN payers p ON o.payer_id = p.payer_id
          LEFT JOIN users order_sales ON p.owner_user_id = order_sales.user_id
          ${matchingOrdersJoinSql}
          ${orderWhereSql}
          ORDER BY o.order_id DESC
          ${pageLimitSql}
        ),
        item_totals AS (
          SELECT
            ti.order_id,
            SUM(CASE
              WHEN (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
                AND ti.final_unit_price IS NOT NULL
                AND ti.final_unit_price <> ''
              THEN ti.final_unit_price
              ELSE 0
            END) AS lims_total_amount,
            SUM(CASE
              WHEN ti.unpaid_amount IS NULL OR ti.unpaid_amount = '' THEN 0
              ELSE ti.unpaid_amount
            END) AS order_invoice_amount,
            SUM(CASE
              WHEN ti.unpaid_amount IS NULL OR ti.unpaid_amount = '' THEN 0
              ELSE 1
            END) AS order_invoice_amount_count,
            SUM(CASE
              WHEN ti.invoice_status = '已到账'
                AND ti.unpaid_amount IS NOT NULL
                AND ti.unpaid_amount <> ''
              THEN ti.unpaid_amount
              ELSE 0
            END) AS order_received_amount,
            SUM(CASE
              WHEN ti.invoice_status = '已到账'
                AND ti.unpaid_amount IS NOT NULL
                AND ti.unpaid_amount <> ''
              THEN 1
              ELSE 0
            END) AS order_received_amount_count
          FROM test_items ti
          JOIN page_orders po ON ti.order_id = po.order_id
          WHERE ti.status != 'cancelled'
          GROUP BY ti.order_id
        ),
        settlement_ranked AS (
          SELECT
            s.*,
            po.order_id AS matched_order_id,
            ROW_NUMBER() OVER (
              PARTITION BY po.order_id
              ORDER BY s.invoice_date DESC, s.created_at DESC, s.settlement_id DESC
            ) AS rn
          FROM page_orders po
          JOIN settlements s
            ON s.settlement_type = 'invoice'
           AND CONCAT('-', REPLACE(s.order_ids, ' ', ''), '-') LIKE CONCAT('%-', po.order_id, '-%')
        )
        SELECT
          base.*,
          CASE
            WHEN base.invoice_amount IS NULL THEN NULL
            ELSE base.invoice_amount - base.lims_total_amount
          END AS invoice_amount_diff,
          CASE WHEN base.invoice_number IS NOT NULL AND base.invoice_number <> '' THEN '已开票' ELSE '未开票' END AS invoice_status
        FROM (
          SELECT
            po.order_id,
            po.invoice_summary_remark,
            po.order_month,
            po.order_customer_name,
            po.payer_contact_name,
            po.payment_term_days,
            po.order_assignee_id AS assignee_id,
            po.order_assignee_name AS assignee_name,
            COALESCE(ti.lims_total_amount, 0) AS lims_total_amount,
            CASE
              WHEN COALESCE(ti.order_invoice_amount_count, 0) = 0 THEN NULL
              ELSE COALESCE(ti.order_invoice_amount, 0)
            END AS invoice_amount,
            s.invoice_date,
            s.invoice_number,
            s.customer_name AS invoice_customer_name,
            s.remarks AS invoice_remark,
            s.received_date,
            CASE
              WHEN COALESCE(ti.order_received_amount_count, 0) = 0 THEN NULL
              ELSE COALESCE(ti.order_received_amount, 0)
            END AS received_amount,
            LAST_DAY(DATE_ADD(
              STR_TO_DATE(CONCAT(po.order_month, '01'), '%Y%m%d'),
              INTERVAL 3 MONTH
            )) AS invoice_deadline_date,
            CASE
              WHEN s.invoice_date IS NULL OR po.payment_term_days IS NULL THEN NULL
              ELSE DATE_ADD(s.invoice_date, INTERVAL po.payment_term_days DAY)
            END AS payment_deadline_date,
            CASE
              WHEN COALESCE(s.invoice_date, CURDATE()) > LAST_DAY(DATE_ADD(
                STR_TO_DATE(CONCAT(po.order_month, '01'), '%Y%m%d'),
                INTERVAL 3 MONTH
              ))
              THEN DATEDIFF(
                COALESCE(s.invoice_date, CURDATE()),
                LAST_DAY(DATE_ADD(
                  STR_TO_DATE(CONCAT(po.order_month, '01'), '%Y%m%d'),
                  INTERVAL 3 MONTH
                ))
              )
              ELSE 0
            END AS invoice_overdue_days,
            CASE
              WHEN s.invoice_date IS NULL OR po.payment_term_days IS NULL THEN NULL
              WHEN COALESCE(s.received_date, CURDATE()) > DATE_ADD(s.invoice_date, INTERVAL po.payment_term_days DAY)
              THEN DATEDIFF(COALESCE(s.received_date, CURDATE()), DATE_ADD(s.invoice_date, INTERVAL po.payment_term_days DAY))
              ELSE 0
            END AS payment_overdue_days
          FROM page_orders po
          LEFT JOIN item_totals ti ON ti.order_id = po.order_id
          LEFT JOIN settlement_ranked s ON s.matched_order_id = po.order_id AND s.rn = 1
        ) base
        ORDER BY base.order_id DESC`,
        fastRowParams
      );

      return res.json({
        data: rows,
        total: Number(countRows[0]?.total || 0),
        page: safePage,
        pageSize: shouldExportAll ? rows.length : safePageSize
      });
    }

    const countParams = [...matchingOrdersParams, ...orderParams, ...finalParams];
    const rowParams = shouldExportAll
      ? [...matchingOrdersParams, ...orderParams, ...finalParams]
      : [...matchingOrdersParams, ...orderParams, ...finalParams, safePageSize, offset];
    const invoiceSummaryBaseCtesSql = `${ctePrefixSql} eligible_orders AS (
        SELECT
          o.order_id,
          o.invoice_summary_remark,
          CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) AS order_month,
          comm.commissioner_name AS order_customer_name,
          p.contact_name AS payer_contact_name,
          p.payment_term_days,
          order_sales.user_id AS order_assignee_id,
          order_sales.name AS order_assignee_name
        FROM orders o
        LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
        LEFT JOIN payers p ON o.payer_id = p.payer_id
        LEFT JOIN users order_sales ON p.owner_user_id = order_sales.user_id
        ${matchingOrdersJoinSql}
        ${orderWhereSql}
      ),
      settlement_ranked AS (
        SELECT
          s.*,
          eo.order_id AS matched_order_id,
          ROW_NUMBER() OVER (
            PARTITION BY eo.order_id
            ORDER BY s.invoice_date DESC, s.created_at DESC, s.settlement_id DESC
          ) AS rn
        FROM eligible_orders eo
        JOIN settlements s
          ON s.settlement_type = 'invoice'
         AND CONCAT('-', REPLACE(s.order_ids, ' ', ''), '-') LIKE CONCAT('%-', eo.order_id, '-%')
      ),
      order_base AS (
        SELECT
          eo.order_id,
          eo.invoice_summary_remark,
          eo.order_month,
          eo.order_customer_name,
          eo.payer_contact_name,
          eo.payment_term_days,
          eo.order_assignee_id,
          eo.order_assignee_name,
          s.invoice_date,
          s.invoice_number,
          s.customer_name AS invoice_customer_name,
          s.remarks AS invoice_remark,
          s.received_date,
          LAST_DAY(DATE_ADD(
            STR_TO_DATE(CONCAT(eo.order_month, '01'), '%Y%m%d'),
            INTERVAL 3 MONTH
          )) AS invoice_deadline_date,
          CASE
            WHEN s.invoice_date IS NULL OR eo.payment_term_days IS NULL THEN NULL
            ELSE DATE_ADD(s.invoice_date, INTERVAL eo.payment_term_days DAY)
          END AS payment_deadline_date,
          CASE
            WHEN COALESCE(s.invoice_date, CURDATE()) > LAST_DAY(DATE_ADD(
              STR_TO_DATE(CONCAT(eo.order_month, '01'), '%Y%m%d'),
              INTERVAL 3 MONTH
            ))
            THEN DATEDIFF(
              COALESCE(s.invoice_date, CURDATE()),
              LAST_DAY(DATE_ADD(
                STR_TO_DATE(CONCAT(eo.order_month, '01'), '%Y%m%d'),
                INTERVAL 3 MONTH
              ))
            )
            ELSE 0
          END AS invoice_overdue_days,
          CASE
            WHEN s.invoice_date IS NULL OR eo.payment_term_days IS NULL THEN NULL
            WHEN COALESCE(s.received_date, CURDATE()) > DATE_ADD(s.invoice_date, INTERVAL eo.payment_term_days DAY)
            THEN DATEDIFF(COALESCE(s.received_date, CURDATE()), DATE_ADD(s.invoice_date, INTERVAL eo.payment_term_days DAY))
            ELSE 0
          END AS payment_overdue_days
        FROM eligible_orders eo
        LEFT JOIN settlement_ranked s ON s.matched_order_id = eo.order_id AND s.rn = 1
      )`;

    const [countRows] = await pool.query(
      `${invoiceSummaryBaseCtesSql}
       SELECT COUNT(*) AS total
       FROM order_base base
       ${finalWhereSql}`,
      countParams
    );

    const [rows] = await pool.query(
      `${invoiceSummaryBaseCtesSql},
      page_orders AS (
        SELECT base.*
        FROM order_base base
        ${finalWhereSql}
        ORDER BY base.order_id DESC
        ${pageLimitSql}
      ),
      item_totals AS (
        SELECT
          ti.order_id,
          SUM(CASE
            WHEN (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
              AND ti.final_unit_price IS NOT NULL
              AND ti.final_unit_price <> ''
            THEN ti.final_unit_price
            ELSE 0
          END) AS lims_total_amount,
          SUM(CASE
            WHEN ti.unpaid_amount IS NULL OR ti.unpaid_amount = '' THEN 0
            ELSE ti.unpaid_amount
          END) AS order_invoice_amount,
          SUM(CASE
            WHEN ti.unpaid_amount IS NULL OR ti.unpaid_amount = '' THEN 0
            ELSE 1
          END) AS order_invoice_amount_count,
          SUM(CASE
            WHEN ti.invoice_status = '已到账'
              AND ti.unpaid_amount IS NOT NULL
              AND ti.unpaid_amount <> ''
            THEN ti.unpaid_amount
            ELSE 0
          END) AS order_received_amount,
          SUM(CASE
            WHEN ti.invoice_status = '已到账'
              AND ti.unpaid_amount IS NOT NULL
              AND ti.unpaid_amount <> ''
            THEN 1
            ELSE 0
          END) AS order_received_amount_count
        FROM test_items ti
        JOIN page_orders po ON ti.order_id = po.order_id
        WHERE ti.status != 'cancelled'
        GROUP BY ti.order_id
      )
      SELECT
        base.*,
        CASE
          WHEN base.invoice_amount IS NULL THEN NULL
          ELSE base.invoice_amount - base.lims_total_amount
        END AS invoice_amount_diff,
        CASE WHEN base.invoice_number IS NOT NULL AND base.invoice_number <> '' THEN '已开票' ELSE '未开票' END AS invoice_status
      FROM (
        SELECT
          po.order_id,
          po.invoice_summary_remark,
          po.order_month,
          po.order_customer_name,
          po.payer_contact_name,
          po.payment_term_days,
          po.order_assignee_id AS assignee_id,
          po.order_assignee_name AS assignee_name,
          COALESCE(ti.lims_total_amount, 0) AS lims_total_amount,
          CASE
            WHEN COALESCE(ti.order_invoice_amount_count, 0) = 0 THEN NULL
            ELSE COALESCE(ti.order_invoice_amount, 0)
          END AS invoice_amount,
          po.invoice_date,
          po.invoice_number,
          po.invoice_customer_name,
          po.invoice_remark,
          po.received_date,
          CASE
            WHEN COALESCE(ti.order_received_amount_count, 0) = 0 THEN NULL
            ELSE COALESCE(ti.order_received_amount, 0)
          END AS received_amount,
          po.invoice_deadline_date,
          po.payment_deadline_date,
          po.invoice_overdue_days,
          po.payment_overdue_days
        FROM page_orders po
        LEFT JOIN item_totals ti ON ti.order_id = po.order_id
      ) base
      ORDER BY base.order_id DESC`,
      rowParams
    );

    res.json({
      data: rows,
      total: Number(countRows[0]?.total || 0),
      page: safePage,
      pageSize: shouldExportAll ? rows.length : safePageSize
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/invoice-summary/:orderId/summary-remark', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ error: '委托单号不能为空' });
    }

    const rawRemark = req.body?.invoice_summary_remark;
    const invoiceSummaryRemark = rawRemark === null || rawRemark === undefined || String(rawRemark).trim() === ''
      ? null
      : String(rawRemark).trim();
    const [result] = await pool.query(
      `UPDATE orders
       SET invoice_summary_remark = ?
       WHERE order_id = ?`,
      [invoiceSummaryRemark, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '未找到对应委托单' });
    }

    res.json({
      order_id: orderId,
      invoice_summary_remark: invoiceSummaryRemark
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/invoice-summary/months', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT
         CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) AS order_month
       FROM orders o
       WHERE o.order_id REGEXP '^JC[0-9]{4}'
         AND CONCAT('20', SUBSTRING(o.order_id, 3, 2), SUBSTRING(o.order_id, 5, 2)) >= '202601'
         AND EXISTS (
           SELECT 1
           FROM test_items active_ti
           WHERE active_ti.order_id = o.order_id
             AND active_ti.status != 'cancelled'
             AND (active_ti.business_confirmed = 1 OR active_ti.business_confirmed = '1')
         )
       ORDER BY order_month DESC`
    );
    res.json(rows.map(row => row.order_month).filter(Boolean));
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
router.get('/test-items/:testItemId/payment-allocations', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT
         sia.item_allocation_id,
         sia.settlement_id,
         sia.test_item_id,
         sia.payment_source_type,
         sia.source_settlement_id,
         sia.invoice_number,
         sia.invoice_date,
         sia.amount,
         s.settlement_serial_number,
         s.settlement_method,
         s.invoice_number AS settlement_invoice_number,
         s.invoice_date AS settlement_invoice_date,
         s.approval_status
       FROM settlement_item_payment_allocations sia
       JOIN settlements s ON s.settlement_id = sia.settlement_id
       WHERE sia.test_item_id = ?
       ORDER BY s.invoice_date DESC, sia.settlement_id DESC, sia.item_allocation_id ASC`,
      [req.params.testItemId]
    );
    const totalAmount = normalizeAmount(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)) || 0;
    res.json({ test_item_id: req.params.testItemId, total_amount: totalAmount, allocations: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  const settlementType = req.body?.settlement_type === 'prepayment' ? 'prepayment' : 'invoice';
  const settlementMethod = SETTLEMENT_METHODS.has(req.body?.settlement_method) ? req.body.settlement_method : 'invoice';
  
  // 普通结算沿用原权限；预存充值允许业务员发起，后续由admin审批。
  if (settlementType === 'prepayment' ? !canCreatePrepayment(user) : !canCreateSettlement(user)) {
    return res.status(403).json({ error: '只有管理员和特定部门领导可以创建结算记录' });
  }
  
  const { 
    invoice_number,
    invoice_date, 
    order_ids, 
    invoice_amount, 
    received_amount,
    gift_amount,
    prepayment_total_amount,
    prepayment_type,
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
  const giftAmountNum = normalizeAmount(gift_amount) || 0;
  const prepaymentType = settlementType === 'prepayment'
    ? (PREPAYMENT_TYPES.has(prepayment_type) ? prepayment_type : 'normal')
    : null;
  const prepaymentTotalAmountNum = settlementType === 'prepayment'
    ? (normalizeAmount(prepayment_total_amount) || normalizeAmount(invoiceAmountNum + giftAmountNum) || invoiceAmountNum)
    : null;
  const effectiveInvoiceDate = settlementType === 'prepayment'
    ? (invoice_date || new Date().toISOString().slice(0, 10))
    : (invoice_date || null);
  const effectiveReceivedAmount = settlementType === 'invoice' && settlementMethod === 'prepaid'
    ? invoiceAmountNum
    : normalizeAmount(received_amount);
  const effectivePaymentStatus = settlementType === 'invoice' && settlementMethod === 'prepaid'
    ? '已到款'
    : (payment_status || '未到款');
  if (invoice_amount === null || invoice_amount === undefined || invoice_amount === '' || !Number.isFinite(invoiceAmountNum) || invoiceAmountNum < 0) {
    return res.status(400).json({ error: '开票金额为必填项，且开票金额须为大于等于0的数字' });
  }
  if (settlementType === 'invoice' && !order_ids) {
    return res.status(400).json({ error: '普通开票结算必须关联委托单号组' });
  }
  if (settlementType === 'prepayment' && !payer_id) {
    return res.status(400).json({ error: '预存充值必须选择付款方' });
  }
  if (settlementType === 'prepayment' && !assignee_id) {
    return res.status(400).json({ error: '预存充值必须绑定业务员' });
  }
  if (settlementType === 'prepayment' && prepaymentTotalAmountNum < invoiceAmountNum) {
    return res.status(400).json({ error: 'Prepayment total amount cannot be less than invoice amount' });
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
    if (!final_customer_nature && final_payer_id) {
      const [payerNatureRows] = await connection.query(
        `SELECT c.nature
         FROM payers p
         JOIN customers c ON c.customer_id = p.customer_id
         WHERE p.payer_id = ?
         LIMIT 1`,
        [final_payer_id]
      );
      final_customer_nature = payerNatureRows[0]?.nature || null;
    }
    let settlementSerialNumbers = [];
    let mixedSplit = null;
    if (settlementType === 'invoice' && settlementMethod === 'mixed') {
      const lots = await getPrepaymentLots(connection, final_payer_id);
      const fifo = buildFifoPrepaymentAllocations(lots, invoiceAmountNum);
      if (fifo.prepaidAmount <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: '当前付款方没有可用于组合支付的预存余额' });
      }
      if (fifo.deficitAmount <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: '预存余额足够，请选择余额支付，无需组合支付' });
      }
      settlementSerialNumbers = [
        await generateDailySerial(connection, 'settlement'),
        await generateDailySerial(connection, 'settlement')
      ];
      mixedSplit = {
        prepaidAmount: fifo.prepaidAmount,
        invoiceAmount: fifo.deficitAmount
      };
    } else if (settlementType === 'invoice') {
      settlementSerialNumbers = [await generateDailySerial(connection, 'settlement')];
    }
    const settlementSerialNumber = settlementSerialNumbers.length > 0
      ? settlementSerialNumbers.join(',')
      : null;
    const prepaymentSerialNumber = settlementType === 'prepayment' ? await generateDailySerial(connection, 'prepayment') : null;

    // 如果有test_item_ids，需要进行验证和处理
    const test_item_ids_json = settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) ? JSON.stringify(test_item_ids) : null;
    
    // 验证逻辑：检查开票预填价和开票状态
    if (settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) && test_item_ids.length > 0) {
      // 获取所有选中的test_items
      const placeholders = test_item_ids.map(() => '?').join(',');
      const [testItems] = await connection.query(
        `SELECT test_item_id, invoice_prefill_price, final_unit_price, business_confirmed, invoice_status FROM test_items WHERE test_item_id IN (${placeholders})`,
        test_item_ids
      );

      const invalidFinalPriceItems = testItems.filter(item => {
        const finalPrice = Number(item.final_unit_price);
        const confirmed = item.business_confirmed === 1 || item.business_confirmed === true || item.business_confirmed === '1';
        return !confirmed || item.final_unit_price === null || item.final_unit_price === undefined || item.final_unit_price === '' || !Number.isFinite(finalPrice);
      });
      if (invalidFinalPriceItems.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: '存在未确认测试总价的检测项目，无法发起结算' });
      }

      // 检查是否有已结算的项目
      const settledItems = testItems.filter(item => item.invoice_status && item.invoice_status !== '未结算');
      if (settledItems.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: '有检测项目已经结算过，不能进行二次结算' });
      }

      for (const item of testItems) {
        const prefillPrice = item.invoice_prefill_price === null || item.invoice_prefill_price === undefined || item.invoice_prefill_price === ''
          ? Number(item.final_unit_price)
          : Number(item.invoice_prefill_price);
        await connection.query(
          `UPDATE test_items
           SET invoice_prefill_price = ?, invoice_prefill_confirmed = 1
           WHERE test_item_id = ?`,
          [prefillPrice, item.test_item_id]
        );
      }
    }
    
    // 插入结算记录，包含test_item_ids
    const insertSettlementSql = `INSERT INTO settlements
       (settlement_serial_number, prepayment_serial_number, settlement_type, settlement_method, prepayment_type, invoice_number, new_invoice_number, invoice_date, order_ids, test_item_ids, invoice_amount, gift_amount, prepayment_total_amount, new_invoice_amount, received_amount, received_date, remarks, customer_id, customer_name, assignee_id, customer_nature, payer_id, payment_status, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
    const baseInsertValues = [
        prepaymentSerialNumber,
        settlementType,
        settlementType === 'prepayment' ? 'invoice' : settlementMethod,
        prepaymentType,
        invoice_number || null,
        settlementMethod === 'prepaid' ? null : invoice_number || null,
        effectiveInvoiceDate,
        settlementType === 'prepayment' ? prepaymentSerialNumber : order_ids,
        test_item_ids_json,
        invoiceAmountNum,
        settlementType === 'prepayment' ? giftAmountNum : 0,
        prepaymentTotalAmountNum,
        null,
        effectiveReceivedAmount,
        received_date || null,
        remarks || null,
        final_customer_id,
        final_customer_name,
        assignee_id || null,
        final_customer_nature,
        final_payer_id || null,
        effectivePaymentStatus
    ];
    const insertedSettlementIds = [];
    if (mixedSplit) {
      const splitRows = [
        {
          serial: settlementSerialNumbers[0],
          method: 'prepaid',
          amount: mixedSplit.prepaidAmount,
          receivedAmount: mixedSplit.prepaidAmount,
          paymentStatus: '已到款',
          remarks: remarks || null
        },
        {
          serial: settlementSerialNumbers[1],
          method: 'invoice',
          amount: mixedSplit.invoiceAmount,
          receivedAmount: null,
          paymentStatus: '未到款',
          remarks: remarks || null
        }
      ];
      for (const splitRow of splitRows) {
        const values = [
          splitRow.serial,
          null,
          'invoice',
          splitRow.method,
          null,
          null,
          null,
          null,
          order_ids,
          test_item_ids_json,
          splitRow.amount,
          0,
          null,
          null,
          splitRow.receivedAmount,
          null,
          splitRow.remarks,
          final_customer_id,
          final_customer_name,
          assignee_id || null,
          final_customer_nature,
          final_payer_id || null,
          splitRow.paymentStatus
        ];
        const [splitResult] = await connection.query(insertSettlementSql, values);
        insertedSettlementIds.push(splitResult.insertId);
      }
    } else {
      const [result] = await connection.query(insertSettlementSql, [
        settlementSerialNumber,
        ...baseInsertValues
      ]);
      insertedSettlementIds.push(result.insertId);
    }
    
    // 如果有test_item_ids，按开票预填价比例分配开票金额，并更新开票状态
    if (settlementType === 'invoice' && test_item_ids && Array.isArray(test_item_ids) && test_item_ids.length > 0) {
      // 获取所有test_items的开票预填价
      const placeholders = test_item_ids.map(() => '?').join(',');
      const [testItems] = await connection.query(
        `SELECT test_item_id, invoice_prefill_price, final_unit_price FROM test_items WHERE test_item_id IN (${placeholders})`,
        test_item_ids
      );
      
      // 计算总开票预填价
      const totalPrefillPrice = testItems.reduce((sum, item) => {
        const amount = item.invoice_prefill_price === null || item.invoice_prefill_price === undefined || item.invoice_prefill_price === ''
          ? item.final_unit_price
          : item.invoice_prefill_price;
        return sum + (parseFloat(amount) || 0);
      }, 0);
      
      if (totalPrefillPrice > 0) {
        // 按开票预填价比例分配开票金额
        const allocations = testItems.map((item) => {
          const amount = item.invoice_prefill_price === null || item.invoice_prefill_price === undefined || item.invoice_prefill_price === ''
            ? item.final_unit_price
            : item.invoice_prefill_price;
          const prefillPrice = parseFloat(amount) || 0;
          const proportion = prefillPrice / totalPrefillPrice;
          const allocatedAmount = parseFloat((invoiceAmountNum * proportion).toFixed(2));
          return {
            test_item_id: item.test_item_id,
            unpaid_amount: allocatedAmount,
            _basis: prefillPrice
          };
        });
        
        // 处理精度问题：确保总和等于开票金额
        const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
        const difference = invoiceAmountNum - allocatedTotal;
        const lastPositiveIndex = allocations.map((item, index) => ({ item, index })).filter(({ item }) => item._basis > 0).pop()?.index;
        if (Math.abs(difference) > 0.01 && lastPositiveIndex !== undefined) {
          // 将差额加到最后一个项目
          allocations[lastPositiveIndex].unpaid_amount = parseFloat((allocations[lastPositiveIndex].unpaid_amount + difference).toFixed(2));
        }
        
        // 批量更新test_items表的unpaid_amount和invoice_status
        for (const allocation of allocations) {
          await connection.query(
            `UPDATE test_items 
             SET unpaid_amount = ?, invoice_status = '已申请', settlement_serial_number = ?
             WHERE test_item_id = ?`,
            [allocation.unpaid_amount, settlementSerialNumber, allocation.test_item_id]
          );
        }
      } else if (invoiceAmountNum === 0) {
        // 开票预填价合计为 0 时无法按比例分摊；整单开票金额为 0 时各行记 0 并标记已结算
        for (const item of testItems) {
          await connection.query(
            `UPDATE test_items 
             SET unpaid_amount = 0, invoice_status = '已申请', settlement_serial_number = ?
             WHERE test_item_id = ?`,
            [settlementSerialNumber, item.test_item_id]
          );
        }
      }
    }
    
    // 获取刚插入的记录
    const [newRecord] = await connection.query(
      `SELECT 
        s.settlement_id,
        s.settlement_serial_number,
        s.prepayment_serial_number,
        s.settlement_type,
        s.settlement_method,
        s.prepayment_type,
        s.invoice_number,
        s.new_invoice_number,
        s.invoice_date,
        s.order_ids,
        s.test_item_ids,
        s.invoice_amount,
        s.gift_amount,
        s.prepayment_total_amount,
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
      WHERE s.settlement_id IN (${insertedSettlementIds.map(() => '?').join(',')})
      ORDER BY s.settlement_id ASC`,
      insertedSettlementIds
    );
    
    await connection.commit();
    const responseRecord = newRecord.find(row => row.settlement_method === 'invoice') || newRecord[0];
    res.status(201).json({
      ...responseRecord,
      settlement_serial_number: settlementSerialNumber,
      settlement_serial_numbers: settlementSerialNumbers,
      split_settlements: newRecord
    });
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
    invoice_date,
    invoice_amount,
    received_amount, 
    gift_amount,
    prepayment_total_amount,
    prepayment_type,
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

    const syncTestItemsInvoiceStatusForSettlement = async (executor, settlementId) => {
      const [settlementRows] = await executor.query(
        'SELECT order_ids, test_item_ids, invoice_number, payment_status FROM settlements WHERE settlement_id = ?',
        [settlementId]
      );
      if (!settlementRows || settlementRows.length === 0) return;

      const {
        order_ids: orderIdsStr,
        test_item_ids: testItemIdsStr,
        invoice_number: invoiceNumber,
        payment_status: paymentStatus
      } = settlementRows[0];
      const targetInvoiceStatus = (paymentStatus === '已到款' || paymentStatus === '部分到款')
        ? '已到账'
        : (invoiceNumber ? '已开票' : '已申请');

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
           AND invoice_status IN ('已申请','已开票','已到账')`,
        [targetInvoiceStatus, ...uniqueIds]
      );
    };

    const updateFields = [];
    const updateValues = [];

    if (invoice_number !== undefined) {
      updateFields.push('invoice_number = ?');
      updateValues.push(invoice_number || null);
      updateFields.push(`new_invoice_number = CASE
        WHEN settlement_type = 'invoice' AND settlement_method <> 'prepaid' THEN ?
        ELSE new_invoice_number
      END`);
      updateValues.push(invoice_number || null);
    }

    if (invoice_date !== undefined) {
      let formattedDate = invoice_date;
      if (invoice_date !== null && invoice_date !== '') {
        try {
          if (typeof invoice_date === 'string' && (invoice_date.includes('T') || invoice_date.includes('Z'))) {
            const date = new Date(invoice_date);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              formattedDate = `${year}-${month}-${day}`;
            }
          } else if (typeof invoice_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoice_date)) {
            formattedDate = invoice_date;
          }
        } catch (e) {
          formattedDate = invoice_date;
        }
      }
      updateFields.push('invoice_date = ?');
      updateValues.push(formattedDate === '' ? null : formattedDate);
    }
    
    if (received_amount !== undefined) {
      updateFields.push('received_amount = ?');
      updateValues.push(received_amount);
    }

    if (gift_amount !== undefined) {
      updateFields.push('gift_amount = ?');
      updateValues.push(normalizeAmount(gift_amount) || 0);
    }

    if (prepayment_total_amount !== undefined) {
      updateFields.push('prepayment_total_amount = ?');
      updateValues.push(normalizeAmount(prepayment_total_amount));
    }

    if (prepayment_type !== undefined) {
      updateFields.push('prepayment_type = ?');
      updateValues.push(PREPAYMENT_TYPES.has(prepayment_type) ? prepayment_type : 'normal');
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
        await syncInvoiceStatusForSettlement(connection, req.params.id);
        await syncSettlementDebit(connection, req.params.id, user.user_id);
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
            `SELECT test_item_id, invoice_prefill_price, final_unit_price FROM test_items WHERE test_item_id IN (${placeholders}) AND status != 'cancelled'`,
            testItemIds
          );

          const totalPrefillPrice = testItems.reduce((sum, item) => {
            const amount = item.invoice_prefill_price === null || item.invoice_prefill_price === undefined || item.invoice_prefill_price === ''
              ? item.final_unit_price
              : item.invoice_prefill_price;
            return sum + (parseFloat(amount) || 0);
          }, 0);

          if (totalPrefillPrice > 0) {
            const allocations = testItems.map((item) => {
              const amount = item.invoice_prefill_price === null || item.invoice_prefill_price === undefined || item.invoice_prefill_price === ''
                ? item.final_unit_price
                : item.invoice_prefill_price;
              const prefillPrice = parseFloat(amount) || 0;
              const proportion = prefillPrice / totalPrefillPrice;
              const allocatedAmount = parseFloat((newInvoiceAmount * proportion).toFixed(2));
              return {
                test_item_id: item.test_item_id,
                unpaid_amount: allocatedAmount,
                _basis: prefillPrice
              };
            });

            const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
            const difference = newInvoiceAmount - allocatedTotal;
            const lastPositiveIndex = allocations.map((item, index) => ({ item, index })).filter(({ item }) => item._basis > 0).pop()?.index;
            if (Math.abs(difference) > 0.01 && lastPositiveIndex !== undefined) {
              allocations[lastPositiveIndex].unpaid_amount = parseFloat(
                (allocations[lastPositiveIndex].unpaid_amount + difference).toFixed(2)
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
      await syncInvoiceStatusForSettlement(pool, req.params.id);
      await syncSettlementDebit(pool, req.params.id, user.user_id);
      await syncReceiptCredit(pool, req.params.id, user.user_id);
      await syncPrepaymentCredit(pool, req.params.id, user.user_id);
    }
    
    // 获取更新后的记录
    const [updatedRecord] = await pool.query(
      `SELECT 
        s.settlement_id,
        s.settlement_serial_number,
        s.prepayment_serial_number,
        s.prepayment_type,
        s.invoice_number,
        s.new_invoice_number,
        s.invoice_date,
        s.order_ids,
        s.invoice_amount,
        s.gift_amount,
        s.prepayment_total_amount,
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
  if (!isSettlementApprover(user)) {
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
              received_amount, payer_id, payment_status, approval_status, test_item_ids
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
    if (settlement.approval_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ error: 'Only pending settlement records can be approved or rejected' });
    }

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
        const debitResult = await syncSettlementDebit(connection, settlement.settlement_id, user.user_id);
        if (
          settlement.settlement_method === 'prepaid' &&
          Number(settlement.invoice_amount) > 0 &&
          !debitResult.synced
        ) {
          throw new Error('预存抵扣及支付分配未生成，审批已取消，请检查付款方预存余额');
        }
        await syncReceiptCredit(connection, settlement.settlement_id, user.user_id);
        await syncInvoiceStatusForSettlement(connection, settlement.settlement_id);
      } else if (settlement.settlement_type === 'prepayment') {
        await syncPrepaymentCredit(connection, settlement.settlement_id, user.user_id);
      }
    } else {
      await connection.query('DELETE FROM settlement_item_payment_allocations WHERE settlement_id = ?', [settlement.settlement_id]);
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
  
  const pool = await getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 先获取要删除的结算记录（与创建/更新一致：优先按 test_item_ids 恢复，否则按委托单号组内未取消项目）
    const [settlementRows] = await connection.query(
      'SELECT settlement_type, invoice_number, approval_status, order_ids, test_item_ids FROM settlements WHERE settlement_id = ?',
      [req.params.id]
    );
    
    if (settlementRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    const settlement = settlementRows[0];
    const canDeleteByManager = canManageSettlement(user);
    const canDeleteBySales =
      user.role === 'sales' &&
      settlement.settlement_type === 'invoice' &&
      !settlement.invoice_number &&
      settlement.approval_status !== 'approved';
    if (!canDeleteByManager && !canDeleteBySales) {
      await connection.rollback();
      return res.status(403).json({ error: '当前结算记录已有票号或已审批通过，仅管理员可删除' });
    }

    const { order_ids: orderIdsStr, test_item_ids: testItemIdsStr } = settlement;

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

    await connection.query(
      'DELETE FROM payer_balance_transactions WHERE settlement_id = ?',
      [req.params.id]
    );

    await connection.query(
      'DELETE FROM settlement_item_payment_allocations WHERE settlement_id = ?',
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

    if (testItemIds.length > 0) {
      const uniqueIds = Array.from(new Set(testItemIds.map(Number).filter(Number.isFinite)));
      const [remainingRows] = await connection.query(
        `SELECT settlement_id, settlement_serial_number, invoice_amount
         FROM settlements
         WHERE settlement_type = 'invoice'
           AND approval_status <> 'rejected'
           AND test_item_ids IS NOT NULL
           AND JSON_VALID(test_item_ids) = 1
           AND JSON_CONTAINS(test_item_ids, CAST(? AS JSON), '$')
         ORDER BY settlement_id ASC`,
        [uniqueIds[0]]
      );

      if (remainingRows.length === 0) {
        const ph = uniqueIds.map(() => '?').join(',');
        await connection.query(
          `UPDATE test_items
           SET unpaid_amount = 0,
               settlement_serial_number = NULL,
               invoice_status = '未结算',
               invoice_prefill_confirmed = 0
           WHERE test_item_id IN (${ph})`,
          uniqueIds
        );
      } else {
        const serialNumbers = remainingRows.map(row => row.settlement_serial_number).filter(Boolean).join(',');
        const totalRemainingAmount = normalizeAmount(
          remainingRows.reduce((sum, row) => sum + (Number(row.invoice_amount) || 0), 0)
        ) || 0;
        const ph = uniqueIds.map(() => '?').join(',');
        const [items] = await connection.query(
          `SELECT test_item_id, invoice_prefill_price, final_unit_price
           FROM test_items
           WHERE test_item_id IN (${ph})`,
          uniqueIds
        );
        const weightedRows = items.map(item => ({
          ...item,
          weight: getSettlementItemBasis(item, ['final_unit_price'])
        }));
        const allocations = allocateAmountByWeight(weightedRows, totalRemainingAmount, 'weight');
        const amountByItem = new Map(allocations.map(row => [Number(row.test_item_id), row.amount]));
        for (const item of items) {
          await connection.query(
            `UPDATE test_items
             SET unpaid_amount = ?, settlement_serial_number = ?
             WHERE test_item_id = ?`,
            [amountByItem.get(Number(item.test_item_id)) || 0, serialNumbers, item.test_item_id]
          );
        }
        await syncInvoiceStatusForSettlement(connection, remainingRows[0].settlement_id);
      }
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
