import express from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 获取委托单列表
router.get('/', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.order_id,
        c.customer_name,
        comm.contact_name as commissioner_name,
        p.contact_name as payer_name,
        o.total_price as total_amount,
        o.total_price as discounted_amount,
        o.settlement_status,
        o.created_at,
        o.updated_at,
        COUNT(ti.test_item_id) as test_item_count,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.quantity * ti.unit_price) as calculated_total,
        GROUP_CONCAT(DISTINCT ti.detail_name SEPARATOR ', ') as test_items,
        COUNT(CASE WHEN ti.status = 'outsource' THEN ti.test_item_id END) as outsource_count,
        GROUP_CONCAT(DISTINCT CASE WHEN ti.status = 'outsource' THEN ti.detail_name END SEPARATOR ', ') as outsource_items
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
      LEFT JOIN payers p ON o.payer_id = p.payer_id
      LEFT JOIN test_items ti ON o.order_id = ti.order_id
       GROUP BY o.order_id, c.customer_name, comm.contact_name, p.contact_name, o.total_price, o.settlement_status, o.created_at, o.updated_at
      ORDER BY o.created_at DESC
    `);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取委托单基本信息（包含payer_id）
router.get('/:id', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.order_id,
        o.customer_id,
        o.commissioner_id,
        o.payer_id,
        o.total_price,
        o.settlement_status,
        o.period_type,
        o.created_at,
        c.customer_name,
        comm.contact_name as commissioner_name,
        p.contact_name as payer_name,
        p.discount_rate
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
      LEFT JOIN payers p ON o.payer_id = p.payer_id
      WHERE o.order_id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '委托单不存在' });
    }
    
    res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取内部委托详情
router.get('/internal/:id', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        ti.test_item_id,
        ti.order_id,
        ti.detail_name,
        ti.test_code,
        ti.quantity,
        ti.unit_price,
        ti.discounted_unit_price,
        ti.status,
        ti.supervisor_id,
        u1.name as supervisor_name,
        ti.technician_id,
        u2.name as technician_name,
        c.customer_name,
        comm.contact_name as commissioner_name,
        p.contact_name as payer_name,
        o.total_price as total_amount,
        o.total_price as discounted_amount,
        o.settlement_status,
        o.remarks
      FROM test_items ti
      LEFT JOIN orders o ON ti.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
      LEFT JOIN payers p ON o.payer_id = p.payer_id
      LEFT JOIN users u1 ON ti.supervisor_id = u1.user_id
      LEFT JOIN users u2 ON ti.technician_id = u2.user_id
      WHERE ti.order_id = ? AND ti.status != 'outsource'
      ORDER BY ti.created_at
    `, [req.params.id]);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取委外委托详情
router.get('/outsource/:id', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        ti.test_item_id,
        ti.order_id,
        ti.detail_name,
        ti.test_code,
        ti.quantity,
        ti.unit_price,
        ti.status,
        c.customer_name,
        comm.contact_name as commissioner_name,
        p.contact_name as payer_name,
        o.total_price as total_amount,
        o.total_price as discounted_amount,
        oi.outsource_supplier,
        oi.outsource_contact,
        oi.outsource_phone,
        oi.outsource_price,
        oi.outsource_status,
        oi.outsource_report_path,
        oi.return_tracking_number
      FROM test_items ti
      LEFT JOIN orders o ON ti.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
      LEFT JOIN payers p ON o.payer_id = p.payer_id
      LEFT JOIN outsource_info oi ON ti.test_item_id = oi.test_item_id
      WHERE ti.order_id = ? AND ti.status = 'outsource'
      ORDER BY ti.created_at
    `, [req.params.id]);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 更新委托单结算状态
router.put('/:id/settlement', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以更新结算状态
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can update settlement status' });
  }
  
  const { settlement_status } = req.body;
  const pool = await getPool();
  
  try {
    await pool.query('UPDATE orders SET settlement_status = ?, updated_at = NOW() WHERE order_id = ?', 
      [settlement_status, req.params.id]);
    
    res.json({ ok: true, message: 'Settlement status updated successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取委托单统计信息
router.get('/stats', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT o.order_id) as total_orders,
        COUNT(CASE WHEN ti.status != 'outsource' THEN ti.test_item_id END) as internal_items,
        COUNT(CASE WHEN ti.status = 'outsource' THEN ti.test_item_id END) as outsource_items,
        SUM(CASE WHEN ti.status != 'outsource' THEN ti.quantity * ti.unit_price ELSE 0 END) as internal_amount,
        SUM(CASE WHEN ti.status = 'outsource' THEN oi.outsource_price ELSE 0 END) as outsource_amount,
        COUNT(CASE WHEN o.settlement_status = 'paid' THEN o.order_id END) as paid_orders,
        COUNT(CASE WHEN o.settlement_status = 'unpaid' THEN o.order_id END) as unpaid_orders
      FROM orders o
      LEFT JOIN test_items ti ON o.order_id = ti.order_id
      LEFT JOIN outsource_info oi ON ti.test_item_id = oi.test_item_id
    `);
    
    res.json(stats[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;