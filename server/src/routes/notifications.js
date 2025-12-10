import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// 获取当前用户的通知列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, is_read, type } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const user = req.user;
    const pool = await getPool();

    let whereConditions = ['user_id = ?'];
    let params = [user.user_id];

    if (is_read !== undefined) {
      whereConditions.push('is_read = ?');
      params.push(is_read === 'true' || is_read === '1' ? 1 : 0);
    }

    if (type) {
      whereConditions.push('type = ?');
      params.push(type);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const [rows] = await pool.query(
      `SELECT n.*, 
              o.order_id as order_id_display,
              ti.test_item_id as test_item_id_display,
              pf.filename as file_name,
              ar.request_id as addon_request_id,
              ar.status as addon_request_status
       FROM notifications n
       LEFT JOIN orders o ON n.related_order_id = o.order_id
       LEFT JOIN test_items ti ON n.related_test_item_id = ti.test_item_id
       LEFT JOIN project_files pf ON n.related_file_id = pf.file_id
       LEFT JOIN addon_requests ar ON n.related_addon_request_id = ar.request_id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total
       FROM notifications
       ${whereClause}`,
      params
    );

    res.json({
      data: rows,
      total: countResult[0].total,
      page: Number(page),
      pageSize: Number(pageSize)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取未读通知数量
router.get('/unread-count', async (req, res) => {
  try {
    const user = req.user;
    const pool = await getPool();

    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [user.user_id]
    );

    res.json({ count: rows[0].count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 标记通知为已读
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    // 检查通知是否存在且属于当前用户
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE notification_id = ? AND user_id = ?',
      [id, user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '通知不存在或无权访问' });
    }

    // 更新为已读
    await pool.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW(3) WHERE notification_id = ?',
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量标记为已读
router.put('/read-all', async (req, res) => {
  try {
    const user = req.user;
    const pool = await getPool();

    await pool.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW(3) WHERE user_id = ? AND is_read = 0',
      [user.user_id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除通知
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    // 检查通知是否存在且属于当前用户
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE notification_id = ? AND user_id = ?',
      [id, user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '通知不存在或无权访问' });
    }

    await pool.query('DELETE FROM notifications WHERE notification_id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建通知（内部使用，不对外暴露，由其他路由调用）
export async function createNotification(pool, {
  user_id,
  title,
  content,
  type = 'other',
  related_order_id = null,
  related_test_item_id = null,
  related_file_id = null,
  related_addon_request_id = null
}) {
  try {
    const [result] = await pool.query(
      `INSERT INTO notifications 
       (user_id, title, content, type, related_order_id, related_test_item_id, related_file_id, related_addon_request_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, title, content, type, related_order_id, related_test_item_id, related_file_id, related_addon_request_id]
    );
    return result.insertId;
  } catch (error) {
    console.error('创建通知失败:', error);
    throw error;
  }
}

export default router;



