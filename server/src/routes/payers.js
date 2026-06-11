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
  const offset = (Number(page)-1) * Number(pageSize);
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

  const [rows] = await pool.query(
    `SELECT
       p.*,
       c.customer_name,
       u.name AS owner_name,
       COALESCE(b.prepaid_balance, 0) AS prepaid_balance,
       COALESCE(b.settlement_debit_amount, 0) AS settlement_debit_amount,
       COALESCE(b.receipt_credit_amount, 0) AS receipt_credit_amount,
       COALESCE(b.current_balance, 0) AS current_balance,
       COALESCE(us.unsettled_amount, 0) AS unsettled_amount,
       COALESCE(ps.pending_settlement_amount, 0) AS pending_settlement_amount
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     LEFT JOIN users u ON u.user_id = p.owner_user_id
     LEFT JOIN (
       SELECT
         payer_id,
         SUM(CASE WHEN transaction_type = 'prepayment_credit' AND direction = 'credit' THEN amount ELSE 0 END) AS prepaid_balance,
         SUM(CASE WHEN transaction_type = 'settlement_debit' AND direction = 'debit' THEN amount ELSE 0 END) AS settlement_debit_amount,
         SUM(CASE WHEN transaction_type = 'invoice_receipt_credit' AND direction = 'credit' THEN amount ELSE 0 END) AS receipt_credit_amount,
         SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS current_balance
       FROM payer_balance_transactions
       GROUP BY payer_id
     ) b ON b.payer_id = p.payer_id
     LEFT JOIN (
       SELECT payer_id, SUM(GREATEST(COALESCE(invoice_amount, 0) - COALESCE(received_amount, 0), 0)) AS pending_settlement_amount
       FROM settlements
       WHERE settlement_type = 'invoice'
         AND invoice_number IS NOT NULL
         AND invoice_number <> ''
         AND payment_status IN ('未到款', '部分到款')
       GROUP BY payer_id
     ) ps ON ps.payer_id = p.payer_id
     LEFT JOIN (
       SELECT o.payer_id, SUM(COALESCE(ti.final_unit_price, 0)) AS unsettled_amount
       FROM test_items ti
       JOIN orders o ON o.order_id = ti.order_id
       WHERE o.payer_id IS NOT NULL
         AND (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
         AND ti.final_unit_price IS NOT NULL
         AND COALESCE(ti.invoice_status, '未结算') = '未结算'
         AND ti.status != 'cancelled'
       GROUP BY o.payer_id
     ) us ON us.payer_id = p.payer_id
     ${where}
     ORDER BY p.payer_id DESC
     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt
     FROM payers p
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}`, params
  );
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
  const [pendingRows] = await pool.query(
    `SELECT COALESCE(SUM(GREATEST(COALESCE(invoice_amount, 0) - COALESCE(received_amount, 0), 0)), 0) AS pending_settlement_amount
     FROM settlements
     WHERE payer_id = ?
       AND settlement_type = 'invoice'
       AND invoice_number IS NOT NULL
       AND invoice_number <> ''
       AND payment_status IN ('未到款', '部分到款')`,
    [req.params.id]
  );
  const [unsettledRows] = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(ti.final_unit_price, 0)), 0) AS unsettled_amount
     FROM test_items ti
     JOIN orders o ON o.order_id = ti.order_id
     WHERE o.payer_id = ?
       AND (ti.business_confirmed = 1 OR ti.business_confirmed = '1')
       AND ti.final_unit_price IS NOT NULL
       AND COALESCE(ti.invoice_status, '未结算') = '未结算'
       AND ti.status != 'cancelled'`,
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
      unsettled_amount: unsettledRows[0]?.unsettled_amount || 0,
      pending_settlement_amount: pendingRows[0]?.pending_settlement_amount || 0
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
