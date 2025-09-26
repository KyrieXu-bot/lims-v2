import express from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 获取委外检测项目列表
router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和工号为YWQXM的用户可以访问
  if (user.role !== 'admin' && user.user_id !== 'YWQXM') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
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
        ti.supervisor_id,
        u.name as supervisor_name,
        c.customer_name,
        comm.contact_name as commissioner_name,
        p.contact_name as payer_name,
        oi.outsource_supplier,
        oi.outsource_contact,
        oi.outsource_phone,
        oi.outsource_price,
        oi.outsource_report_path,
        oi.return_tracking_number,
        oi.outsource_status,
        oi.created_at,
        oi.updated_at
      FROM test_items ti
      LEFT JOIN orders o ON ti.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
      LEFT JOIN payers p ON o.payer_id = p.payer_id
      LEFT JOIN outsource_info oi ON ti.test_item_id = oi.test_item_id
      LEFT JOIN users u ON ti.supervisor_id = u.user_id
      WHERE ti.status = 'outsource'
      ORDER BY ti.created_at DESC
    `);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 更新委外信息
router.put('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和工号为YWQXM的用户可以访问
  if (user.role !== 'admin' && user.user_id !== 'YWQXM') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const { outsource_supplier, outsource_contact, outsource_phone, outsource_price, outsource_status } = req.body;
  const pool = await getPool();
  
  try {
    // 检查测试项目是否存在
    const [chk] = await pool.query('SELECT test_item_id FROM test_items WHERE test_item_id = ?', [req.params.id]);
    if (chk.length === 0) {
      return res.status(404).json({ error: 'Test item not found' });
    }
    
    // 更新或插入委外信息
    await pool.query(`
      INSERT INTO outsource_info 
      (test_item_id, outsource_supplier, outsource_contact, outsource_phone, outsource_price, outsource_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      outsource_supplier = VALUES(outsource_supplier),
      outsource_contact = VALUES(outsource_contact),
      outsource_phone = VALUES(outsource_phone),
      outsource_price = VALUES(outsource_price),
      outsource_status = VALUES(outsource_status),
      updated_at = NOW()
    `, [req.params.id, outsource_supplier, outsource_contact, outsource_phone, outsource_price, outsource_status]);
    
    res.json({ ok: true, message: 'Outsource info updated successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 上传委外报告
router.post('/:id/report', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和工号为YWQXM的用户可以访问
  if (user.role !== 'admin' && user.user_id !== 'YWQXM') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const { report_path } = req.body;
  const pool = await getPool();
  
  try {
    // 更新委外报告路径
    await pool.query(`
      INSERT INTO outsource_info 
      (test_item_id, outsource_report_path, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      outsource_report_path = VALUES(outsource_report_path),
      updated_at = NOW()
    `, [req.params.id, report_path]);
    
    res.json({ ok: true, message: 'Report uploaded successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 更新寄回快递单号
router.put('/:id/tracking', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和工号为YWQXM的用户可以访问
  if (user.role !== 'admin' && user.user_id !== 'YWQXM') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const { return_tracking_number } = req.body;
  const pool = await getPool();
  
  try {
    // 更新快递单号
    await pool.query(`
      INSERT INTO outsource_info 
      (test_item_id, return_tracking_number, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      return_tracking_number = VALUES(return_tracking_number),
      updated_at = NOW()
    `, [req.params.id, return_tracking_number]);
    
    res.json({ ok: true, message: 'Tracking number updated successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 完成委外检测
router.post('/:id/complete', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员和工号为YWQXM的用户可以访问
  if (user.role !== 'admin' && user.user_id !== 'YWQXM') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const pool = await getPool();
  
  try {
    // 更新测试项目状态为已完成
    await pool.query('UPDATE test_items SET status = ? WHERE test_item_id = ?', ['completed', req.params.id]);
    
    // 更新委外状态为已完成
    await pool.query(`
      INSERT INTO outsource_info 
      (test_item_id, outsource_status, updated_at)
      VALUES (?, 'completed', NOW())
      ON DUPLICATE KEY UPDATE
      outsource_status = 'completed',
      updated_at = NOW()
    `, [req.params.id]);
    
    res.json({ ok: true, message: 'Outsource completed successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
