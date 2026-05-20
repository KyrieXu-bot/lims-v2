import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAnyRole(['admin', 'viewer']));

function toArrayParam(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** @param {unknown} val */
function parseJsonArray(val) {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

const ALLOWED_SEALS = new Set(['normal', 'cnas', 'cma']);

/**
 * GET: 按订单列出报告配置；筛选：q、seal[]（印章）、report_type[]（文档类型 1–6）
 */
router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const sealFilters = toArrayParam(req.query.seal)
    .map((s) => String(s).toLowerCase())
    .filter((s) => ALLOWED_SEALS.has(s));
  const typeFilters = toArrayParam(req.query.report_type)
    .map((t) => Number(t))
    .filter((t) => Number.isInteger(t) && t >= 1 && t <= 6);

  const pool = await getPool();
  const filters = [
    `EXISTS (
      SELECT 1 FROM test_items ti
      WHERE ti.order_id = o.order_id AND ti.status <> 'cancelled'
    )`,
  ];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    filters.push(
      '(o.order_id LIKE ? OR c.customer_name LIKE ? OR comm.commissioner_name LIKE ? OR comm.contact_name LIKE ?)'
    );
    params.push(like, like, like, like);
  }

  if (sealFilters.length > 0) {
    const ors = sealFilters.map(() => {
      return "JSON_CONTAINS(r.report_seals, JSON_QUOTE(?), '$')";
    });
    params.push(...sealFilters);
    filters.push(`(${ors.join(' OR ')})`);
  }

  if (typeFilters.length > 0) {
    const ors = typeFilters.map(() => "JSON_CONTAINS(r.report_type, CAST(? AS JSON), '$')");
    params.push(...typeFilters);
    filters.push(`(${ors.join(' OR ')})`);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const baseFrom = `
    FROM orders o
    LEFT JOIN reports r ON r.order_id = o.order_id
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
    ${whereSql}
  `;

  try {
    const [cntRows] = await pool.query(
      `SELECT COUNT(*) AS cnt ${baseFrom}`,
      params
    );
    const total = Number(cntRows[0]?.cnt) || 0;

    const listParams = [...params, pageSize, offset];
    const [rows] = await pool.query(
      `SELECT
        o.order_id,
        c.customer_name,
        COALESCE(comm.commissioner_name, c.customer_name) AS commissioner_display,
        comm.contact_name AS commissioner_contact_name,
        r.report_id,
        r.report_type,
        r.report_seals,
        r.paper_report_shipping_type,
        r.report_additional_info,
        r.header_type,
        r.header_other,
        r.format_type,
        r.created_at AS report_created_at,
        r.updated_at AS report_updated_at,
        o.created_at AS order_created_at,
        (
          SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(ti.sample_type), '') SEPARATOR ', ')
          FROM test_items ti
          WHERE ti.order_id = o.order_id AND ti.status <> 'cancelled'
        ) AS sample_types_raw
      ${baseFrom}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({ data: rows, total, page, pageSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:order_id', requireAdmin, async (req, res) => {
  const orderId = String(req.params.order_id || '').trim();
  if (!orderId) {
    return res.status(400).json({ error: '缺少委托单号' });
  }

  const body = req.body || {};
  const reportTypeRaw = body.report_type;
  const reportSealsRaw = body.report_seals;

  const reportType = parseJsonArray(reportTypeRaw)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  const reportSeals = parseJsonArray(reportSealsRaw)
    .map((s) => String(s).toLowerCase())
    .filter((s) => ALLOWED_SEALS.has(s));
  const uniqSeals = [...new Set(reportSeals)];

  const paperReportShippingType =
    body.paper_report_shipping_type === null || body.paper_report_shipping_type === '' || body.paper_report_shipping_type === undefined
      ? null
      : Number(body.paper_report_shipping_type);
  if (
    paperReportShippingType !== null &&
    (!Number.isInteger(paperReportShippingType) || paperReportShippingType < 1 || paperReportShippingType > 3)
  ) {
    return res.status(400).json({ error: '纸质寄送方式无效（1~3）' });
  }

  const headerType =
    body.header_type === null || body.header_type === '' || body.header_type === undefined
      ? null
      : Number(body.header_type);
  if (
    headerType !== null &&
    (!Number.isInteger(headerType) || headerType < 1 || headerType > 2)
  ) {
    return res.status(400).json({ error: '报告抬头类型无效（1~2）' });
  }

  const formatType =
    body.format_type === null || body.format_type === '' || body.format_type === undefined
      ? null
      : Number(body.format_type);
  if (formatType !== null && (!Number.isInteger(formatType) || formatType < 1 || formatType > 2)) {
    return res.status(400).json({ error: '报告版式无效（1~2）' });
  }

  const headerOther =
    body.header_other === null || body.header_other === undefined ? null : String(body.header_other).slice(0, 500);
  const reportAdditionalInfo =
    body.report_additional_info === null || body.report_additional_info === undefined
      ? null
      : String(body.report_additional_info).slice(0, 500);

  const pool = await getPool();
  try {
    const [exists] = await pool.query('SELECT order_id FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    if (!exists.length) {
      return res.status(404).json({ error: '委托单不存在' });
    }

    const [existing] = await pool.query('SELECT report_id FROM reports WHERE order_id = ? LIMIT 1', [orderId]);

    const reportTypeJson = JSON.stringify([...new Set(reportType)].sort((a, b) => a - b));
    const reportSealsJson = JSON.stringify(uniqSeals);

    if (existing.length) {
      await pool.query(
        `UPDATE reports SET
            report_type = CAST(? AS JSON),
            report_seals = CAST(? AS JSON),
            paper_report_shipping_type = ?,
            report_additional_info = ?,
            header_type = ?,
            header_other = ?,
            format_type = ?
         WHERE order_id = ?`,
        [
          reportTypeJson,
          reportSealsJson,
          paperReportShippingType,
          reportAdditionalInfo,
          headerType,
          headerOther,
          formatType,
          orderId,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO reports (
            order_id, report_type, report_seals, paper_report_shipping_type,
            report_additional_info, header_type, header_other, format_type
          ) VALUES (?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?)`,
        [
          orderId,
          reportTypeJson,
          reportSealsJson,
          paperReportShippingType,
          reportAdditionalInfo,
          headerType,
          headerOther,
          formatType,
        ]
      );
    }

    const [updated] = await pool.query(
      `SELECT
        o.order_id,
        c.customer_name,
        COALESCE(comm.commissioner_name, c.customer_name) AS commissioner_display,
        comm.contact_name AS commissioner_contact_name,
        r.report_id,
        r.report_type,
        r.report_seals,
        r.paper_report_shipping_type,
        r.report_additional_info,
        r.header_type,
        r.header_other,
        r.format_type,
        r.created_at AS report_created_at,
        r.updated_at AS report_updated_at,
        o.created_at AS order_created_at,
        (
          SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(ti.sample_type), '') SEPARATOR ', ')
          FROM test_items ti
          WHERE ti.order_id = o.order_id AND ti.status <> 'cancelled'
        ) AS sample_types_raw
      FROM orders o
      LEFT JOIN reports r ON r.order_id = o.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
      WHERE o.order_id = ?`,
      [orderId]
    );

    res.json(updated[0] || { order_id: orderId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
