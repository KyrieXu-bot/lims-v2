import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// options for selects (id + label)
router.get('/options', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT p.payer_id, p.customer_id, p.contact_name, c.customer_name
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.is_active = 1 AND c.is_active = 1
     ORDER BY c.customer_name, p.contact_name`
  );
  res.json(rows.map(r => ({
    payer_id: r.payer_id,
    customer_id: r.customer_id,
    contact_name: r.contact_name,
    customer_name: r.customer_name,
    label: `${r.contact_name} (${r.customer_name})`
  })));
});

// list with join
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active, customer_id } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(p.contact_name LIKE ? OR p.contact_phone LIKE ? OR c.customer_name LIKE ?)');
  params.push(like, like, like);
  if (is_active === '0' || is_active === '1') {
    filters.push('p.is_active = ?');
    params.push(Number(is_active));
  }
  if (customer_id !== undefined && String(customer_id).trim() !== '') {
    filters.push('p.customer_id = ?');
    params.push(customer_id);
  }
  const where = 'WHERE ' + filters.join(' AND ');

  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}`, params
  );

  const [baseRows] = await pool.query(
    `SELECT
       p.*,
       c.customer_name,
       u.name AS owner_name
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     LEFT JOIN users u ON u.user_id = p.owner_user_id
     ${where}
     ORDER BY p.payer_id DESC
     LIMIT ? OFFSET ?`,
    [...params, safePageSize, offset]
  );

  if (baseRows.length === 0) {
    return res.json({ data: [], total: cnt[0].cnt });
  }

  const payerIds = baseRows.map(row => row.payer_id);
  const placeholders = payerIds.map(() => '?').join(',');

  const [balanceRows] = await pool.query(
    `SELECT
       payer_id,
       SUM(CASE WHEN transaction_type = 'prepayment_credit' AND direction = 'credit' THEN amount ELSE 0 END) AS prepaid_balance,
       SUM(CASE WHEN transaction_type = 'settlement_debit' AND direction = 'debit' THEN amount ELSE 0 END) AS settlement_debit_amount,
       SUM(CASE WHEN transaction_type = 'invoice_receipt_credit' AND direction = 'credit' THEN amount ELSE 0 END) AS receipt_credit_amount,
       SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS current_balance
     FROM payer_balance_transactions
     WHERE payer_id IN (${placeholders})
     GROUP BY payer_id`,
    payerIds
  );

  const [testStatusRows] = await pool.query(
    `SELECT
       o.payer_id,
       SUM(CASE WHEN COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '未结算' THEN COALESCE(ti.final_unit_price, 0) ELSE 0 END) AS unsettled_amount,
       SUM(CASE WHEN COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已申请' THEN COALESCE(ti.final_unit_price, 0) ELSE 0 END) AS applied_amount
     FROM test_items ti
     JOIN orders o ON o.order_id = ti.order_id
     WHERE o.payer_id IN (${placeholders})
       AND (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
       AND ti.final_unit_price IS NOT NULL
       AND ti.final_unit_price <> ''
       AND ti.status != 'cancelled'
     GROUP BY o.payer_id`,
    payerIds
  );

  const [settlementStatusRows] = await pool.query(
    `SELECT
       s.payer_id,
       SUM(CASE
         WHEN EXISTS (
           SELECT 1
           FROM test_items ti
           WHERE ti.status != 'cancelled'
             AND COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已开票'
             AND (
               (s.test_item_ids IS NOT NULL AND s.test_item_ids <> '' AND JSON_VALID(s.test_item_ids) = 1 AND JSON_CONTAINS(s.test_item_ids, CAST(ti.test_item_id AS JSON), '$'))
               OR
               ((s.test_item_ids IS NULL OR s.test_item_ids = '' OR JSON_VALID(s.test_item_ids) = 0) AND s.order_ids IS NOT NULL AND s.order_ids <> '' AND FIND_IN_SET(ti.order_id, REPLACE(s.order_ids, '-', ',')) > 0)
             )
         )
         THEN COALESCE(s.invoice_amount, 0)
         ELSE 0
       END) AS invoiced_amount,
       SUM(CASE
         WHEN EXISTS (
           SELECT 1
           FROM test_items ti
           WHERE ti.status != 'cancelled'
             AND COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已到账'
             AND (
               (s.test_item_ids IS NOT NULL AND s.test_item_ids <> '' AND JSON_VALID(s.test_item_ids) = 1 AND JSON_CONTAINS(s.test_item_ids, CAST(ti.test_item_id AS JSON), '$'))
               OR
               ((s.test_item_ids IS NULL OR s.test_item_ids = '' OR JSON_VALID(s.test_item_ids) = 0) AND s.order_ids IS NOT NULL AND s.order_ids <> '' AND FIND_IN_SET(ti.order_id, REPLACE(s.order_ids, '-', ',')) > 0)
             )
         )
         THEN COALESCE(s.received_amount, 0)
         ELSE 0
       END) AS received_amount
     FROM settlements s
     WHERE s.payer_id IN (${placeholders})
       AND s.settlement_type = 'invoice'
     GROUP BY s.payer_id`,
    payerIds
  );

  const byPayerId = rows => new Map(rows.map(row => [String(row.payer_id), row]));
  const balanceMap = byPayerId(balanceRows);
  const testStatusMap = byPayerId(testStatusRows);
  const settlementStatusMap = byPayerId(settlementStatusRows);

  const rows = baseRows.map(row => {
    const key = String(row.payer_id);
    const balance = balanceMap.get(key) || {};
    const testStatus = testStatusMap.get(key) || {};
    const settlementStatus = settlementStatusMap.get(key) || {};
    return {
      ...row,
      prepaid_balance: balance.prepaid_balance || 0,
      settlement_debit_amount: balance.settlement_debit_amount || 0,
      receipt_credit_amount: balance.receipt_credit_amount || 0,
      current_balance: balance.current_balance || 0,
      unsettled_amount: testStatus.unsettled_amount || 0,
      applied_amount: testStatus.applied_amount || 0,
      invoiced_amount: settlementStatus.invoiced_amount || 0,
      received_amount: settlementStatus.received_amount || 0
    };
  });

  res.json({ data: rows, total: cnt[0].cnt });
});

router.get('/:id/ledger', async (req, res) => {
  const pool = await getPool();
  const [payerRows] = await pool.query(
    `SELECT p.*, c.customer_name
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.payer_id = ?`,
    [req.params.id]
  );
  if (payerRows.length === 0) return res.status(404).json({ error: 'Not found' });

  const [summaryRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'prepayment_credit' AND direction = 'credit' THEN amount ELSE 0 END), 0) AS prepaid_balance,
       COALESCE(SUM(CASE WHEN transaction_type = 'settlement_debit' AND direction = 'debit' THEN amount ELSE 0 END), 0) AS settlement_debit_amount,
       COALESCE(SUM(CASE WHEN transaction_type = 'invoice_receipt_credit' AND direction = 'credit' THEN amount ELSE 0 END), 0) AS receipt_credit_amount,
       COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS current_balance
     FROM payer_balance_transactions
     WHERE payer_id = ?`,
    [req.params.id]
  );
  const [statusAmountRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '未结算' THEN COALESCE(ti.final_unit_price, 0) ELSE 0 END), 0) AS unsettled_amount,
       COALESCE(SUM(CASE WHEN COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已申请' THEN COALESCE(ti.final_unit_price, 0) ELSE 0 END), 0) AS applied_amount
     FROM test_items ti
     JOIN orders o ON o.order_id = ti.order_id
     WHERE o.payer_id = ?
       AND (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
       AND ti.final_unit_price IS NOT NULL
       AND ti.final_unit_price <> ''
       AND ti.status != 'cancelled'`,
    [req.params.id]
  );
  const [settlementStatusRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN EXISTS (
           SELECT 1
           FROM test_items ti
           WHERE ti.status != 'cancelled'
             AND COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已开票'
             AND (
               (s.test_item_ids IS NOT NULL AND s.test_item_ids <> '' AND JSON_VALID(s.test_item_ids) = 1 AND JSON_CONTAINS(s.test_item_ids, CAST(ti.test_item_id AS JSON), '$'))
               OR
               ((s.test_item_ids IS NULL OR s.test_item_ids = '' OR JSON_VALID(s.test_item_ids) = 0) AND s.order_ids IS NOT NULL AND s.order_ids <> '' AND FIND_IN_SET(ti.order_id, REPLACE(s.order_ids, '-', ',')) > 0)
             )
         )
         THEN COALESCE(s.invoice_amount, 0)
         ELSE 0
       END), 0) AS invoiced_amount,
       COALESCE(SUM(CASE
         WHEN EXISTS (
           SELECT 1
           FROM test_items ti
           WHERE ti.status != 'cancelled'
             AND COALESCE(NULLIF(ti.invoice_status, ''), '未结算') = '已到账'
             AND (
               (s.test_item_ids IS NOT NULL AND s.test_item_ids <> '' AND JSON_VALID(s.test_item_ids) = 1 AND JSON_CONTAINS(s.test_item_ids, CAST(ti.test_item_id AS JSON), '$'))
               OR
               ((s.test_item_ids IS NULL OR s.test_item_ids = '' OR JSON_VALID(s.test_item_ids) = 0) AND s.order_ids IS NOT NULL AND s.order_ids <> '' AND FIND_IN_SET(ti.order_id, REPLACE(s.order_ids, '-', ',')) > 0)
             )
         )
         THEN COALESCE(s.received_amount, 0)
         ELSE 0
       END), 0) AS received_amount
     FROM settlements s
     WHERE s.payer_id = ?
       AND s.settlement_type = 'invoice'
       `,
    [req.params.id]
  );
  const [transactions] = await pool.query(
    `SELECT
       t.*,
       s.settlement_type,
       s.invoice_number,
       s.invoice_date,
       s.order_ids,
       s.payment_status,
       s.approval_status,
       u.name AS created_by_name
     FROM payer_balance_transactions t
     LEFT JOIN settlements s ON s.settlement_id = t.settlement_id
     LEFT JOIN users u ON u.user_id = t.created_by
     WHERE t.payer_id = ?
     ORDER BY t.occurred_at DESC, t.transaction_id DESC`,
    [req.params.id]
  );

  res.json({
    payer: payerRows[0],
    summary: {
      ...summaryRows[0],
      unsettled_amount: statusAmountRows[0]?.unsettled_amount || 0,
      applied_amount: statusAmountRows[0]?.applied_amount || 0,
      invoiced_amount: settlementStatusRows[0]?.invoiced_amount || 0,
      received_amount: settlementStatusRows[0]?.received_amount || 0
    },
    transactions
  });
});

router.post('/', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const { customer_id, contact_name, contact_phone, payment_term_days,
          discount_rate, owner_user_id, is_active = 1 } = req.body || {};
  if (!customer_id || !contact_name) return res.status(400).json({ error: 'customer_id and contact_name are required' });
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO payers (customer_id, contact_name, contact_phone, payment_term_days, discount_rate, owner_user_id, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [customer_id, contact_name, contact_phone, payment_term_days, discount_rate, owner_user_id || null, Number(is_active)]
    );
    const [rows] = await pool.query(
      `SELECT p.*, c.customer_name, u.name AS owner_name FROM payers p 
       JOIN customers c ON c.customer_id = p.customer_id 
       LEFT JOIN users u ON u.user_id = p.owner_user_id 
       WHERE p.payer_id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT p.*, c.customer_name, u.name AS owner_name FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     LEFT JOIN users u ON u.user_id = p.owner_user_id
     WHERE p.payer_id = ?`, [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.put('/:id', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const { customer_id, contact_name, contact_phone, payment_term_days,
          discount_rate, owner_user_id, is_active } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE payers SET
      customer_id = COALESCE(?, customer_id),
      contact_name = COALESCE(?, contact_name),
      contact_phone = COALESCE(?, contact_phone),
      payment_term_days = COALESCE(?, payment_term_days),
      discount_rate = COALESCE(?, discount_rate),
      owner_user_id = COALESCE(?, owner_user_id),
      is_active = COALESCE(?, is_active)
     WHERE payer_id = ?`,
    [customer_id, contact_name, contact_phone, payment_term_days,
     discount_rate, owner_user_id, is_active, req.params.id]
  );
  const [rows] = await pool.query(
    `SELECT p.*, c.customer_name, u.name AS owner_name FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     LEFT JOIN users u ON u.user_id = p.owner_user_id
     WHERE p.payer_id = ?`, [req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT payer_id FROM payers WHERE payer_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM payers WHERE payer_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: referenced by commissioners or others' });
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
