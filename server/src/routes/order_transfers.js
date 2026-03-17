import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// 获取转单链路（根据任意单号获取完整链路）- 允许 viewer 角色查看
router.get('/chain/:order_id', requireAnyRole(['admin', 'leader', 'sales', 'viewer']), async (req, res) => {
  try {
    const { order_id } = req.params;
    const pool = await getPool();
    
    // 1. 先获取这个order的信息（包括root_order_id和original_order_id）
    const [orderRows] = await pool.query(
      'SELECT order_id, original_order_id, root_order_id, is_transferred FROM orders WHERE order_id = ?',
      [order_id]
    );
    
    if (!orderRows || orderRows.length === 0) {
      return res.status(404).json({ error: '委托单不存在' });
    }
    
    const currentOrder = orderRows[0];
    const rootOrderId = currentOrder.root_order_id || order_id;
    
    // 2. 获取完整的转单历史链路（从root开始）
    const [historyRows] = await pool.query(
      `SELECT 
        h.history_id,
        h.order_id,
        h.previous_order_id,
        h.transfer_date,
        h.created_by,
        h.created_at,
        h.note,
        u.name as creator_name
      FROM order_transfer_history h
      LEFT JOIN users u ON u.user_id = h.created_by
      WHERE h.order_id IN (
        SELECT o.order_id FROM orders o WHERE o.root_order_id = ? OR o.order_id = ?
      )
      OR h.previous_order_id IN (
        SELECT o.order_id FROM orders o WHERE o.root_order_id = ? OR o.order_id = ?
      )
      ORDER BY h.created_at ASC`,
      [rootOrderId, rootOrderId, rootOrderId, rootOrderId]
    );
    
    // 3. 构建链路数组
    const chain = [];
    const orderSet = new Set();
    
    // 先添加根单号
    chain.push(rootOrderId);
    orderSet.add(rootOrderId);
    
    // 通过历史记录构建链路
    let currentNode = rootOrderId;
    for (const history of historyRows) {
      if (history.previous_order_id === currentNode && !orderSet.has(history.order_id)) {
        chain.push(history.order_id);
        orderSet.add(history.order_id);
        currentNode = history.order_id;
      }
    }
    
    res.json({
      chain,
      history: historyRows,
      currentOrderId: order_id,
      rootOrderId
    });
  } catch (err) {
    console.error('获取转单链路失败:', err);
    res.status(500).json({ error: '获取转单链路失败' });
  }
});

// 创建转单记录 - 仅允许 admin、leader、sales
router.post('/create', requireAnyRole(['admin', 'leader', 'sales']), async (req, res) => {
  try {
    const { order_id, previous_order_id, transfer_date, note } = req.body;
    const pool = await getPool();
    const userId = req.user.user_id;
    
    // 验证新单号和原单号都存在
    const [orderCheck] = await pool.query(
      'SELECT order_id FROM orders WHERE order_id IN (?, ?)',
      [order_id, previous_order_id]
    );
    
    if (orderCheck.length !== 2) {
      return res.status(400).json({ error: '委托单号不存在' });
    }
    
    // 获取原单号的root_order_id
    const [previousOrderInfo] = await pool.query(
      'SELECT root_order_id FROM orders WHERE order_id = ?',
      [previous_order_id]
    );
    
    const rootOrderId = previousOrderInfo[0]?.root_order_id || previous_order_id;
    
    // 开始事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // 1. 更新新单号的转单信息
      await connection.query(
        `UPDATE orders 
         SET original_order_id = ?, 
             root_order_id = ?, 
             is_transferred = 1 
         WHERE order_id = ?`,
        [previous_order_id, rootOrderId, order_id]
      );
      
      // 2. 插入转单历史记录
      await connection.query(
        `INSERT INTO order_transfer_history 
         (order_id, previous_order_id, transfer_date, created_by, note) 
         VALUES (?, ?, ?, ?, ?)`,
        [order_id, previous_order_id, transfer_date || new Date(), userId, note]
      );
      
      await connection.commit();
      connection.release();
      
      res.json({ success: true, message: '转单记录创建成功' });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (err) {
    console.error('创建转单记录失败:', err);
    res.status(500).json({ error: '创建转单记录失败' });
  }
});

// 根据单号搜索所有相关单号（包括转单）- 允许 viewer 角色查看
router.get('/search-related/:order_id', requireAnyRole(['admin', 'leader', 'sales', 'viewer']), async (req, res) => {
  try {
    const { order_id } = req.params;
    const pool = await getPool();
    
    // 1. 获取当前单号的root_order_id
    const [orderRows] = await pool.query(
      'SELECT order_id, original_order_id, root_order_id FROM orders WHERE order_id = ?',
      [order_id]
    );
    
    if (!orderRows || orderRows.length === 0) {
      return res.json({ relatedOrders: [] });
    }
    
    const currentOrder = orderRows[0];
    const rootOrderId = currentOrder.root_order_id || order_id;
    
    // 2. 查找所有相关的单号（同一个root_order_id）
    const [relatedRows] = await pool.query(
      `SELECT order_id, original_order_id, root_order_id, is_transferred
       FROM orders 
       WHERE root_order_id = ? OR order_id = ?
       ORDER BY created_at ASC`,
      [rootOrderId, rootOrderId]
    );
    
    res.json({ relatedOrders: relatedRows.map(r => r.order_id) });
  } catch (err) {
    console.error('搜索相关单号失败:', err);
    res.status(500).json({ error: '搜索相关单号失败' });
  }
});

export default router;
