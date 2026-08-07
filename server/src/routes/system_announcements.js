import { Router } from 'express';
import crypto from 'crypto';
import { getPool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ORDER_TRANSFER_KEY = 'order_transfer_reminder';
const ORDER_TRANSFER_TITLE = '转单提醒';
const ORDER_TRANSFER_SUMMARY = '次月单号可提前开具；跨月未完成项目请于次月5日前提交转单申请。';
const ORDER_TRANSFER_CONTENT = [
  '即日起支持提前开具次月单号。请各位业务同事结合实验室设备排期、工程师工作安排综合评估，按需开立次月单号，杜绝月底集中切换单号导致资源浪费。',
  '测试项目若无法在当月完成，请相关工程师及时提交转单申请，申请截止时间为次月5日。逾期提交将影响绩效核算，请务必按期办理。'
];
const BEIJING_NOW_SQL = 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR)';
const ANNOUNCEMENT_SELECT_SQL = `
  SELECT
    announcement_key,
    title,
    summary,
    content_json,
    is_active,
    run_id,
    DATE_FORMAT(auto_close_at, '%Y-%m-%d %H:%i:%s') AS auto_close_at,
    DATE_FORMAT(enabled_at, '%Y-%m-%d %H:%i:%s') AS enabled_at,
    enabled_by,
    DATE_FORMAT(disabled_at, '%Y-%m-%d %H:%i:%s') AS disabled_at,
    disabled_by
  FROM system_announcements
  WHERE announcement_key = ?
  LIMIT 1
`;

let ensured = false;

async function ensureTable(pool) {
  if (ensured) return;
  try {
    await pool.query('SELECT 1 FROM system_announcements LIMIT 0');
    ensured = true;
    return;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      throw error;
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_announcements (
      announcement_key varchar(80) NOT NULL,
      title varchar(120) NOT NULL,
      summary varchar(255) NOT NULL,
      content_json json NOT NULL,
      is_active tinyint(1) NOT NULL DEFAULT 0,
      run_id varchar(64) DEFAULT NULL,
      auto_close_at datetime(3) DEFAULT NULL,
      enabled_at datetime(3) DEFAULT NULL,
      enabled_by varchar(20) DEFAULT NULL,
      disabled_at datetime(3) DEFAULT NULL,
      disabled_by varchar(20) DEFAULT NULL,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (announcement_key),
      KEY idx_system_announcements_active (is_active, auto_close_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

async function autoCloseExpired(pool) {
  await pool.query(
    `UPDATE system_announcements
     SET is_active = 0, disabled_at = ${BEIJING_NOW_SQL}, disabled_by = 'system'
     WHERE announcement_key = ? AND is_active = 1 AND auto_close_at IS NOT NULL AND auto_close_at <= ${BEIJING_NOW_SQL}`,
    [ORDER_TRANSFER_KEY]
  );
}

function normalizeAnnouncement(row) {
  let content = ORDER_TRANSFER_CONTENT;
  if (row?.content_json) {
    try {
      const parsed = typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
      if (Array.isArray(parsed) && parsed.length > 0) content = parsed;
    } catch {
      content = ORDER_TRANSFER_CONTENT;
    }
  }

  return {
    key: ORDER_TRANSFER_KEY,
    title: row?.title || ORDER_TRANSFER_TITLE,
    summary: row?.summary || ORDER_TRANSFER_SUMMARY,
    content,
    is_active: Boolean(row?.is_active),
    run_id: row?.run_id || null,
    auto_close_at: row?.auto_close_at || null,
    enabled_at: row?.enabled_at || null,
    enabled_by: row?.enabled_by || null,
    disabled_at: row?.disabled_at || null,
    disabled_by: row?.disabled_by || null
  };
}

router.get('/order-transfer-reminder', async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);
    await autoCloseExpired(pool);

    const [rows] = await pool.query(ANNOUNCEMENT_SELECT_SQL, [ORDER_TRANSFER_KEY]);

    res.json(normalizeAnnouncement(rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/order-transfer-reminder/enable', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);

    const rawAutoCloseAt = String(req.body?.auto_close_at || '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(rawAutoCloseAt)) {
      return res.status(400).json({ error: '自动关闭时间格式无效' });
    }
    const autoCloseAt = rawAutoCloseAt.length === 16 ? `${rawAutoCloseAt}:00` : rawAutoCloseAt;
    const runId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await pool.query(
      `INSERT INTO system_announcements
        (announcement_key, title, summary, content_json, is_active, run_id, auto_close_at, enabled_at, enabled_by, disabled_at, disabled_by)
       VALUES (?, ?, ?, ?, 1, ?, ?, ${BEIJING_NOW_SQL}, ?, NULL, NULL)
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        summary = VALUES(summary),
        content_json = VALUES(content_json),
        is_active = 1,
        run_id = VALUES(run_id),
        auto_close_at = VALUES(auto_close_at),
        enabled_at = ${BEIJING_NOW_SQL},
        enabled_by = VALUES(enabled_by),
        disabled_at = NULL,
        disabled_by = NULL`,
      [
        ORDER_TRANSFER_KEY,
        ORDER_TRANSFER_TITLE,
        ORDER_TRANSFER_SUMMARY,
        JSON.stringify(ORDER_TRANSFER_CONTENT),
        runId,
        autoCloseAt,
        req.user.user_id
      ]
    );

    const [rows] = await pool.query(ANNOUNCEMENT_SELECT_SQL, [ORDER_TRANSFER_KEY]);
    res.json(normalizeAnnouncement(rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/order-transfer-reminder/disable', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);

    await pool.query(
      `UPDATE system_announcements
       SET is_active = 0, disabled_at = ${BEIJING_NOW_SQL}, disabled_by = ?
       WHERE announcement_key = ?`,
      [req.user.user_id, ORDER_TRANSFER_KEY]
    );

    const [rows] = await pool.query(ANNOUNCEMENT_SELECT_SQL, [ORDER_TRANSFER_KEY]);
    res.json(normalizeAnnouncement(rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
