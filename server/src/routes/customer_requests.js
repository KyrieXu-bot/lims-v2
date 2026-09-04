import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import { createNotification } from './notifications.js';
import { getIO } from '../socket.js';

const router = Router();
const REVIEWER_ID = 'JC0089';
const REQUIRED_FIELDS = [
  ['applicant_customer_name', '委托方名称'],
  ['applicant_contact', '联系人'],
  ['applicant_address', '地址'],
  ['applicant_tel', '联系电话'],
  ['payer_name', '付款方名称'],
  ['payer_address', '付款方地址'],
  ['tax_no', '税号'],
  ['payer_contact', '付款联系人'],
  ['payer_contact_tel', '付款联系人电话']
];

router.use(requireAuth);

function canReview(user) {
  return user?.role === 'admin' || String(user?.user_id) === REVIEWER_ID;
}

function normalizePayload(payload = {}) {
  return {
    applicant_customer_name: String(payload.applicant_customer_name || '').trim(),
    applicant_contact: String(payload.applicant_contact || '').trim(),
    applicant_address: String(payload.applicant_address || '').trim(),
    applicant_tel: String(payload.applicant_tel || '').trim(),
    report_email: String(payload.report_email || '').trim(),
    payer_name: String(payload.payer_name || '').trim(),
    payer_address: String(payload.payer_address || '').trim(),
    payer_tel: String(payload.payer_tel || '').trim(),
    deposit_bank: String(payload.deposit_bank || '').trim(),
    tax_no: String(payload.tax_no || '').trim(),
    bank_account: String(payload.bank_account || '').trim(),
    payer_contact: String(payload.payer_contact || '').trim(),
    payer_contact_tel: String(payload.payer_contact_tel || '').trim(),
    payer_email: String(payload.payer_email || '').trim(),
    payment_term_days: String(payload.payment_term_days || '').trim(),
    discount_rate: String(payload.discount_rate || '').trim()
  };
}

function validatePayload(payload) {
  const missing = REQUIRED_FIELDS.filter(([key]) => !payload[key]).map(([, label]) => label);
  return missing.length ? `请填写必填项：${missing.join('、')}` : null;
}

async function pushNotification(pool, userId, data) {
  const notificationId = await createNotification(pool, { ...data, user_id: userId });
  try {
    const io = getIO();
    if (!io) return;
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    io.to(`user-${userId}`).emit('new-notification', {
      notification_id: notificationId,
      ...data,
      unread_count: rows[0]?.count || 0
    });
  } catch (error) {
    console.error('推送客户申请通知失败:', error);
  }
}

router.post('/', requireAnyRole(['sales']), async (req, res) => {
  const payload = normalizePayload(req.body?.payload);
  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  const pool = await getPool();
  const [reviewers] = await pool.query(
    'SELECT user_id FROM users WHERE user_id = ? AND is_active = 1',
    [REVIEWER_ID]
  );
  if (!reviewers.length) return res.status(409).json({ error: '开单员账号不存在或已停用' });

  const [result] = await pool.query(
    `INSERT INTO customer_requests (request_type, payload, applicant_id, status)
     VALUES ('customer', ?, ?, 'pending')`,
    [JSON.stringify(payload), req.user.user_id]
  );
  const requestId = result.insertId;
  const applicantName = req.user.name || req.user.username || req.user.user_id;
  await pushNotification(pool, REVIEWER_ID, {
    title: '客户申请',
    content: `${applicantName}提交了客户新增申请。申请ID：${requestId}`,
    type: 'customer_request',
    related_customer_request_id: requestId
  });
  res.status(201).json({ request_id: requestId, status: 'pending', message: '申请已提交，请等待开单员处理' });
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT cr.*, u.name AS applicant_name
     FROM customer_requests cr
     LEFT JOIN users u ON u.user_id = cr.applicant_id
     WHERE cr.request_id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '客户申请不存在' });
  const request = rows[0];
  if (!canReview(req.user) && String(request.applicant_id) !== String(req.user.user_id)) {
    return res.status(403).json({ error: '无权查看此客户申请' });
  }
  if (typeof request.payload === 'string') request.payload = JSON.parse(request.payload);
  res.json(request);
});

router.put('/:id/complete', async (req, res) => {
  if (!canReview(req.user)) return res.status(403).json({ error: '仅开单员或管理员可以确认客户已新增' });
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM customer_requests WHERE request_id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: '客户申请不存在' });
    }
    const request = rows[0];
    if (request.status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: '该申请已处理' });
    }
    const payload = typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;
    await conn.query(
      `UPDATE customer_requests SET status='approved', reviewer_id=?, reviewed_at=NOW(3) WHERE request_id=?`,
      [req.user.user_id, request.request_id]
    );
    await createNotification(conn, {
      user_id: request.applicant_id,
      title: '客户已创建',
      content: `客户（${payload.applicant_customer_name}-${payload.applicant_contact}）已创建，请上传电子签名。申请ID：${request.request_id}`,
      type: 'customer_request',
      related_customer_request_id: request.request_id
    });
    await conn.commit();

    try {
      const io = getIO();
      if (io) {
        const [counts] = await pool.query(
          'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
          [request.applicant_id]
        );
        io.to(`user-${request.applicant_id}`).emit('new-notification', {
          title: '客户已创建',
          type: 'customer_request',
          related_customer_request_id: request.request_id,
          unread_count: counts[0]?.count || 0
        });
      }
    } catch (error) {
      console.error('推送客户已创建通知失败:', error);
    }
    res.json({ success: true, message: '已标记为新增，并通知业务员上传电子签名' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

export default router;
