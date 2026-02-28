import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole, requireRole } from '../middleware/auth.js';
import { createNotification } from './notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(requireAuth);

// 创建取消/删除申请
router.post('/', requireAnyRole(['supervisor', 'employee']), async (req, res) => {
  try {
    const user = req.user;
    const pool = await getPool();
    
    // 获取申请数据
    const { test_item_id, request_type, reason } = req.body; // request_type: 'cancel' 或 'delete'
    
    if (!test_item_id || !request_type || !reason) {
      return res.status(400).json({ error: '缺少必要参数：test_item_id, request_type, reason' });
    }
    
    if (request_type !== 'cancel' && request_type !== 'delete') {
      return res.status(400).json({ error: 'request_type 必须是 "cancel" 或 "delete"' });
    }
    
    // 检查检测项目是否存在并获取业务员信息
    const [testItemRows] = await pool.query(
      `SELECT ti.*, o.order_id as order_id_display
       FROM test_items ti
       LEFT JOIN orders o ON o.order_id = ti.order_id
       WHERE ti.test_item_id = ?`,
      [test_item_id]
    );
    
    if (testItemRows.length === 0) {
      return res.status(404).json({ error: '检测项目不存在' });
    }
    
    const testItem = testItemRows[0];
    
    // 检查是否已有待处理的申请
    const [existingRows] = await pool.query(
      `SELECT request_id FROM cancellation_requests 
       WHERE test_item_id = ? AND status = 'pending'`,
      [test_item_id]
    );
    
    if (existingRows.length > 0) {
      return res.status(400).json({ error: '该检测项目已有待处理的申请' });
    }
    
    // 插入申请记录
    const [result] = await pool.query(
      `INSERT INTO cancellation_requests 
       (applicant_id, test_item_id, request_type, reason, status, created_at) 
       VALUES (?, ?, ?, ?, 'pending', NOW(3))`,
      [
        user.user_id,
        test_item_id,
        request_type,
        reason
      ]
    );
    
    const requestId = result.insertId;
    
    // 通知业务员（current_assignee）
    const io = getIO();
    if (testItem.current_assignee) {
      const notificationId = await createNotification(pool, {
        user_id: testItem.current_assignee,
        title: request_type === 'cancel' ? '取消申请' : '删除申请',
        content: `${user.name || user.user_id} 提交了${request_type === 'cancel' ? '取消' : '删除'}申请，原因：${reason}。委托单号：${testItem.order_id_display || '未知'}。申请ID：${requestId}`,
        type: request_type === 'cancel' ? 'cancel_request' : 'delete_request',
        related_order_id: testItem.order_id || null,
        related_test_item_id: test_item_id,
        related_file_id: null,
        related_addon_request_id: null
      });
      
      // 通过WebSocket推送通知
      if (io) {
        const [countRows] = await pool.query(
          'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
          [testItem.current_assignee]
        );
        const unreadCount = countRows[0].count;
        
        io.to(`user-${testItem.current_assignee}`).emit('new-notification', {
          notification_id: notificationId,
          title: request_type === 'cancel' ? '取消申请' : '删除申请',
          content: `${user.name || user.user_id} 提交了${request_type === 'cancel' ? '取消' : '删除'}申请，原因：${reason}。委托单号：${testItem.order_id_display || '未知'}。申请ID：${requestId}`,
          type: request_type === 'cancel' ? 'cancel_request' : 'delete_request',
          related_order_id: testItem.order_id || null,
          related_test_item_id: test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_cancellation_request_id: requestId,
          cancellation_request_status: 'pending',
          cancellation_request_type: request_type,
          unread_count: unreadCount,
          created_at: new Date()
        });
      }
    }
    
    res.json({
      success: true,
      request_id: requestId,
      message: '申请已提交，等待业务员审核'
    });
  } catch (error) {
    console.error('创建取消/删除申请失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 业务员批准申请
router.put('/:id/approve', requireAnyRole(['sales', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();
    
    // 获取申请详情
    const [requestRows] = await pool.query(
      `SELECT cr.*, ti.current_assignee, ti.order_id, o.order_id as order_id_display
       FROM cancellation_requests cr
       LEFT JOIN test_items ti ON ti.test_item_id = cr.test_item_id
       LEFT JOIN orders o ON o.order_id = ti.order_id
       WHERE cr.request_id = ? AND cr.status = 'pending'`,
      [id]
    );
    
    if (requestRows.length === 0) {
      return res.status(404).json({ error: '申请不存在或已被处理' });
    }
    
    const request = requestRows[0];
    
    // 检查权限：业务员只能批准分配给自己的项目
    if (user.role === 'sales' && request.current_assignee !== user.user_id) {
      return res.status(403).json({ error: '无权批准此申请' });
    }
    
    // 更新申请状态
    await pool.query(
      'UPDATE cancellation_requests SET status = ?, approved_by = ?, approved_at = NOW(3) WHERE request_id = ?',
      ['approved', user.user_id, id]
    );
    
    // 通知开单员（user_id = 'JC0089'），告知申请已通过，可以执行操作
    const [clerkUsers] = await pool.query(
      `SELECT u.user_id 
       FROM users u
       WHERE u.user_id = 'JC0089' AND u.is_active = 1`
    );
    
    const io = getIO();
    const notificationPromises = clerkUsers.map(async (clerkUser) => {
      const notificationId = await createNotification(pool, {
        user_id: clerkUser.user_id,
        title: request.request_type === 'cancel' ? '取消申请已通过' : '删除申请已通过',
        content: `业务员已批准${request.request_type === 'cancel' ? '取消' : '删除'}申请，可以执行操作。原因：${request.reason}。委托单号：${request.order_id_display || '未知'}。申请ID：${id}`,
        type: request.request_type === 'cancel' ? 'cancel_request' : 'delete_request',
        related_order_id: request.order_id || null,
        related_test_item_id: request.test_item_id,
        related_file_id: null,
        related_addon_request_id: null
      });
      
      // 通过WebSocket推送通知
      if (io) {
        const [countRows] = await pool.query(
          'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
          [clerkUser.user_id]
        );
        const unreadCount = countRows[0].count;
        
        io.to(`user-${clerkUser.user_id}`).emit('new-notification', {
          notification_id: notificationId,
          title: request.request_type === 'cancel' ? '取消申请已通过' : '删除申请已通过',
          content: `业务员已批准${request.request_type === 'cancel' ? '取消' : '删除'}申请，可以执行操作。原因：${request.reason}。委托单号：${request.order_id_display || '未知'}。申请ID：${id}`,
          type: request.request_type === 'cancel' ? 'cancel_request' : 'delete_request',
          related_order_id: request.order_id || null,
          related_test_item_id: request.test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_cancellation_request_id: id,
          cancellation_request_status: 'approved',
          cancellation_request_type: request.request_type,
          unread_count: unreadCount,
          created_at: new Date()
        });
      }
    });
    
    await Promise.all(notificationPromises);
    
    res.json({
      success: true,
      message: '申请已批准，已通知开单员'
    });
  } catch (error) {
    console.error('批准申请失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 开单员执行取消/删除操作
router.put('/:id/execute', requireAnyRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();
    
    // 检查是否是开单员（user_id = 'JC0089'）或管理员
    if (user.user_id !== 'JC0089' && user.role !== 'admin') {
      return res.status(403).json({ error: '无权执行此操作' });
    }
    
    // 获取申请详情
    const [requestRows] = await pool.query(
      `SELECT cr.*, ti.*, o.order_id as order_id_display
       FROM cancellation_requests cr
       LEFT JOIN test_items ti ON ti.test_item_id = cr.test_item_id
       LEFT JOIN orders o ON o.order_id = ti.order_id
       WHERE cr.request_id = ? AND cr.status = 'approved'`,
      [id]
    );
    
    if (requestRows.length === 0) {
      return res.status(404).json({ error: '申请不存在或未通过审核' });
    }
    
    const request = requestRows[0];
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      let testItemBackup = null;
      
      if (request.request_type === 'cancel') {
        // 执行取消操作
        await pool.query(
          'UPDATE test_items SET status = ? WHERE test_item_id = ?',
          ['cancelled', request.test_item_id]
        );
      } else if (request.request_type === 'delete') {
        // 执行删除操作前，先备份test_item数据
        const [testItemRows] = await pool.query(
          'SELECT * FROM test_items WHERE test_item_id = ?',
          [request.test_item_id]
        );
        
        if (testItemRows.length > 0) {
          testItemBackup = JSON.stringify(testItemRows[0]);
        }
        
        // 先处理外键约束：将notifications表中的related_test_item_id设置为NULL
        await pool.query(
          'UPDATE notifications SET related_test_item_id = NULL WHERE related_test_item_id = ?',
          [request.test_item_id]
        );
        
        // 删除关联表中的记录
        await pool.query('DELETE FROM assignments WHERE test_item_id = ?', [request.test_item_id]);
        await pool.query('DELETE FROM outsource_info WHERE test_item_id = ?', [request.test_item_id]);
        await pool.query('DELETE FROM sample_return_info WHERE test_item_id = ?', [request.test_item_id]);
        await pool.query('DELETE FROM sample_tracking WHERE test_item_id = ?', [request.test_item_id]);
        await pool.query('DELETE FROM samples WHERE test_item_id = ?', [request.test_item_id]);
        
        // 删除主表记录
        await pool.query(
          'DELETE FROM test_items WHERE test_item_id = ?',
          [request.test_item_id]
        );
      }
      
      // 更新申请状态，如果是删除操作，保存备份数据
      if (testItemBackup) {
        await pool.query(
          'UPDATE cancellation_requests SET status = ?, executed_by = ?, executed_at = NOW(3), test_item_backup = ? WHERE request_id = ?',
          ['executed', user.user_id, testItemBackup, id]
        );
      } else {
        await pool.query(
          'UPDATE cancellation_requests SET status = ?, executed_by = ?, executed_at = NOW(3) WHERE request_id = ?',
          ['executed', user.user_id, id]
        );
      }
      
      // 提交事务
      await pool.query('COMMIT');
      
      // 通知业务员（批准人）知悉操作已执行
      if (request.approved_by) {
        const [approvedByRows] = await pool.query(
          'SELECT user_id FROM users WHERE user_id = ?',
          [request.approved_by]
        );
        
        const io = getIO();
        if (approvedByRows.length > 0) {
          const notificationId = await createNotification(pool, {
            user_id: request.approved_by,
            title: request.request_type === 'cancel' ? '取消操作已执行' : '删除操作已执行',
            content: `开单员已执行${request.request_type === 'cancel' ? '取消' : '删除'}操作，原因：${request.reason}。委托单号：${request.order_id_display || '未知'}。申请ID：${id}`,
            type: request.request_type === 'cancel' ? 'cancel_request' : 'delete_request',
            related_order_id: request.order_id || null,
            related_test_item_id: request.test_item_id,
            related_file_id: null,
            related_addon_request_id: null
          });
          
          // 通过WebSocket推送通知
          if (io) {
            const [countRows] = await pool.query(
              'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
              [request.approved_by]
            );
            const unreadCount = countRows[0].count;
            
            io.to(`user-${request.approved_by}`).emit('new-notification', {
              notification_id: notificationId,
              title: request.request_type === 'cancel' ? '取消操作已执行' : '删除操作已执行',
              content: `开单员已执行${request.request_type === 'cancel' ? '取消' : '删除'}操作，原因：${request.reason}。委托单号：${request.order_id_display || '未知'}。申请ID：${id}`,
              type: request.request_type === 'cancel' ? 'cancel_request' : 'delete_request',
              related_order_id: request.order_id || null,
              related_test_item_id: request.test_item_id,
              related_file_id: null,
              related_addon_request_id: null,
              related_cancellation_request_id: id,
              cancellation_request_status: 'executed',
              cancellation_request_type: request.request_type,
              unread_count: unreadCount,
              created_at: new Date()
            });
          }
        }
      }
      
      res.json({
        success: true,
        message: request.request_type === 'cancel' ? '取消操作已执行' : '删除操作已执行'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('执行取消/删除操作失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 取消执行操作（撤回已执行的操作）- 开单员可以撤回
router.put('/:id/revert', requireAnyRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();
    
    // 检查是否是开单员（user_id = 'JC0089'）或管理员
    if (user.user_id !== 'JC0089' && user.role !== 'admin') {
      return res.status(403).json({ error: '无权撤回此操作' });
    }
    
    // 获取申请详情（包括备份数据）
    const [requestRows] = await pool.query(
      `SELECT cr.*, o.order_id as order_id_display
       FROM cancellation_requests cr
       LEFT JOIN orders o ON o.order_id = (
         SELECT order_id FROM test_items WHERE test_item_id = cr.test_item_id LIMIT 1
       )
       WHERE cr.request_id = ? AND cr.status = 'executed'`,
      [id]
    );
    
    if (requestRows.length === 0) {
      return res.status(404).json({ error: '申请不存在或未执行' });
    }
    
    const request = requestRows[0];
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      if (request.request_type === 'cancel') {
        // 检查test_item是否还存在
        const [testItemCheck] = await pool.query(
          'SELECT test_item_id, supervisor_id FROM test_items WHERE test_item_id = ?',
          [request.test_item_id]
        );
        
        if (testItemCheck.length === 0) {
          await pool.query('ROLLBACK');
          return res.status(404).json({ error: '检测项目不存在，无法恢复' });
        }
        
        // 恢复项目状态：根据是否有负责人来决定恢复为什么状态
        const newStatus = testItemCheck[0].supervisor_id ? 'assigned' : 'new';
        
        // 恢复取消操作
        await pool.query(
          'UPDATE test_items SET status = ? WHERE test_item_id = ?',
          [newStatus, request.test_item_id]
        );
      } else if (request.request_type === 'delete') {
        // 恢复删除操作：从备份中恢复test_item
        if (!request.test_item_backup) {
          await pool.query('ROLLBACK');
          return res.status(400).json({ error: '未找到备份数据，无法恢复删除操作' });
        }
        
        let testItemData;
        try {
          testItemData = typeof request.test_item_backup === 'string' 
            ? JSON.parse(request.test_item_backup) 
            : request.test_item_backup;
        } catch (parseError) {
          await pool.query('ROLLBACK');
          return res.status(400).json({ error: '备份数据格式错误，无法恢复' });
        }
        
        // 从备份数据中提取字段并重新插入
        const {
          order_id, price_id, category_name, detail_name, sample_name, material, sample_type, original_no,
          test_code, standard_code, department_id, group_id, quantity, unit_price, discount_rate,
          final_unit_price, line_total, machine_hours, work_hours, is_add_on, is_outsourced,
          seq_no, sample_preparation, note, status, current_assignee, supervisor_id, technician_id,
          arrival_mode, sample_arrival_status, equipment_id, check_notes, test_notes,
          actual_sample_quantity, actual_delivery_date, field_test_time, price_note,
          assignment_note, business_note, service_urgency, unit, addon_reason, addon_target
        } = testItemData;
        
        // 重新插入test_item（使用原来的test_item_id）
        const sqlFields = [
          'test_item_id', 'order_id', 'price_id', 'category_name', 'detail_name', 'sample_name', 'material', 'sample_type', 'original_no',
          'test_code', 'standard_code', 'department_id', 'group_id', 'quantity', 'unit_price', 'discount_rate',
          'final_unit_price', 'line_total', 'machine_hours', 'work_hours', 'is_add_on', 'is_outsourced',
          'seq_no', 'sample_preparation', 'note', 'status', 'current_assignee', 'supervisor_id', 'technician_id',
          'arrival_mode', 'sample_arrival_status', 'equipment_id', 'check_notes', 'test_notes',
          'actual_sample_quantity', 'actual_delivery_date', 'field_test_time', 'price_note',
          'assignment_note', 'business_note', 'service_urgency', 'unit', 'addon_reason', 'addon_target'
        ];
        
        const placeholders = sqlFields.map(() => '?').join(', ');
        const paramArray = [
          request.test_item_id, // 使用原来的test_item_id
          order_id || null,
          price_id || null,
          category_name || '',
          detail_name || '',
          sample_name || null,
          material || null,
          sample_type || null,
          original_no || null,
          test_code || null,
          standard_code || null,
          department_id || null,
          group_id || null,
          quantity || 1,
          unit_price || null,
          discount_rate || null,
          final_unit_price || null,
          line_total || null,
          machine_hours || 0,
          work_hours || 0,
          is_add_on || 0,
          is_outsourced || 0,
          seq_no || null,
          sample_preparation || null,
          note || null,
          status || 'new',
          current_assignee || null,
          supervisor_id || null,
          technician_id || null,
          arrival_mode || null,
          sample_arrival_status || 'not_arrived',
          equipment_id || null,
          check_notes || null,
          test_notes || null,
          actual_sample_quantity || null,
          actual_delivery_date || null,
          field_test_time || null,
          price_note || null,
          assignment_note || null,
          business_note || null,
          service_urgency || 'normal',
          unit || '机时',
          addon_reason || null,
          addon_target || null
        ];
        
        const insertSql = `INSERT INTO test_items (${sqlFields.join(', ')}) VALUES (${placeholders})`;
        await pool.query(insertSql, paramArray);
      }
      
      // 更新申请状态为已撤回（回到approved状态）
      await pool.query(
        'UPDATE cancellation_requests SET status = ?, executed_by = NULL, executed_at = NULL, test_item_backup = NULL WHERE request_id = ?',
        ['approved', id]
      );
      
      // 提交事务
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: '操作已撤回'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('撤回操作失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取申请详情
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    
    const [rows] = await pool.query(
      `SELECT cr.*, 
              u.name as applicant_name,
              ti.test_item_id,
              o.order_id as order_id_display
       FROM cancellation_requests cr
       LEFT JOIN users u ON u.user_id = cr.applicant_id
       LEFT JOIN test_items ti ON ti.test_item_id = cr.test_item_id
       LEFT JOIN orders o ON o.order_id = ti.order_id
       WHERE cr.request_id = ?`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '申请不存在' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('获取申请详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
