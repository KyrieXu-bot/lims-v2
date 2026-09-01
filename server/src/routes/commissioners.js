import { Router } from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import {
  commissionerSignaturesDirectory,
  commissionerSignatureExists,
  commissionerSignaturePath,
  isPngBuffer,
  normalizeCommissionerId
} from '../services/commissionerSignature.js';

const router = Router();
router.use(requireAuth);
const signatureRoles = requireAnyRole(['admin', 'sales']);
const MAX_SIGNATURE_SIZE = 5 * 1024 * 1024;
const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIGNATURE_SIZE, files: 1 }
}).single('signature');

function receiveSignature(req, res, next) {
  signatureUpload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '委托人电子签名图片不能超过 5MB' });
    }
    return res.status(400).json({ error: '电子签名图片上传失败，请检查文件后重试' });
  });
}

async function commissionerExists(pool, commissionerId) {
  const [rows] = await pool.query(
    'SELECT commissioner_id FROM commissioners WHERE commissioner_id = ?',
    [commissionerId]
  );
  return rows.length > 0;
}

// list with joins (payer + customer)
router.get('/', async (req, res) => {
  const { q = '', page = 1, pageSize = 20, is_active } = req.query;
  const offset = (Number(page)-1) * Number(pageSize);
  const pool = await getPool();
  const like = `%${q}%`;
  const filters = [];
  const params = [];

  filters.push('(m.contact_name LIKE ? OR m.contact_phone LIKE ? OR m.commissioner_name LIKE ? OR p.contact_name LIKE ? OR c.customer_name LIKE ?)');
  params.push(like, like, like, like, like);
  if (is_active === '0' || is_active === '1') {
    filters.push('m.is_active = ?');
    params.push(Number(is_active));
  }
  const where = 'WHERE ' + filters.join(' AND ');

  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}
     ORDER BY m.commissioner_id DESC
     LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset]
  );
  const [cnt] = await pool.query(
    `SELECT COUNT(*) as cnt
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     ${where}`, params
  );
  const data = await Promise.all(rows.map(async (row) => ({
    ...row,
    signature_available: await commissionerSignatureExists(row.commissioner_id)
  })));
  res.json({ data, total: cnt[0].cnt });
});

router.post('/', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const { payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active = 1 } = req.body || {};
  if (!payer_id || !contact_name) return res.status(400).json({ error: 'payer_id and contact_name are required' });
  const pool = await getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO commissioners (payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [payer_id, contact_name, contact_phone, email, commissioner_name, address, Number(is_active)]
    );
    const [rows] = await pool.query(
      `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
       FROM commissioners m
       JOIN payers p ON p.payer_id = m.payer_id
       JOIN customers c ON c.customer_id = p.customer_id
       WHERE m.commissioner_id = ?`, [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id/signature', signatureRoles, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const commissionerId = normalizeCommissionerId(req.params.id);
    if (!commissionerId) return res.status(400).json({ error: '委托人 ID 不正确' });
    const pool = await getPool();
    if (!(await commissionerExists(pool, commissionerId))) {
      return res.status(404).json({ error: '委托人不存在' });
    }
    if (!(await commissionerSignatureExists(commissionerId))) {
      return res.status(404).json({ error: '该委托人尚未上传电子签名' });
    }
    return res.type('png').sendFile(commissionerSignaturePath(commissionerId));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/signature', signatureRoles, receiveSignature, async (req, res) => {
  try {
    const commissionerId = normalizeCommissionerId(req.params.id);
    if (!commissionerId) return res.status(400).json({ error: '委托人 ID 不正确' });
    if (!req.file) return res.status(400).json({ error: '请选择 PNG 格式的电子签名图片' });
    if (!isPngBuffer(req.file.buffer)) {
      return res.status(400).json({ error: '委托人电子签名必须是有效的 PNG 图片' });
    }
    const pool = await getPool();
    if (!(await commissionerExists(pool, commissionerId))) {
      return res.status(404).json({ error: '委托人不存在' });
    }

    await fs.mkdir(commissionerSignaturesDirectory, { recursive: true });
    const replaced = await commissionerSignatureExists(commissionerId);
    await fs.writeFile(commissionerSignaturePath(commissionerId), req.file.buffer);
    return res.status(201).json({
      ok: true,
      commissioner_id: Number(commissionerId),
      filename: `${commissionerId}.png`,
      replaced
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE m.commissioner_id = ?`, [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.put('/:id', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const { payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active } = req.body || {};
  const pool = await getPool();
  await pool.query(
    `UPDATE commissioners SET
      payer_id = COALESCE(?, payer_id),
      contact_name = COALESCE(?, contact_name),
      contact_phone = COALESCE(?, contact_phone),
      email = COALESCE(?, email),
      commissioner_name = COALESCE(?, commissioner_name),
      address = COALESCE(?, address),
      is_active = COALESCE(?, is_active)
     WHERE commissioner_id = ?`,
    [payer_id, contact_name, contact_phone, email, commissioner_name, address, is_active, req.params.id]
  );
  const [rows] = await pool.query(
    `SELECT m.*, p.contact_name AS payer_contact, c.customer_name
     FROM commissioners m
     JOIN payers p ON p.payer_id = m.payer_id
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE m.commissioner_id = ?`, [req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', requireAnyRole(['admin', 'sales']), async (req, res) => {
  const pool = await getPool();
  try {
    const [chk] = await pool.query('SELECT commissioner_id FROM commissioners WHERE commissioner_id = ?', [req.params.id]);
    if (chk.length === 0) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM commissioners WHERE commissioner_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: referenced by other tables' });
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
