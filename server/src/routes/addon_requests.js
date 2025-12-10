import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole, requireRole } from '../middleware/auth.js';
import { createNotification } from './notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(requireAuth);

// 创建加测申请
router.post('/', requireAnyRole(['sales', 'leader', 'supervisor', 'employee']), async (req, res) => {
  try {
    const user = req.user;
    const pool = await getPool();
    
    // 获取申请数据
    const requestData = req.body;
    
    // 插入加测申请记录
    const [result] = await pool.query(
      `INSERT INTO addon_requests 
       (applicant_id, order_id, test_item_data, status, note, created_at) 
       VALUES (?, ?, ?, 'pending', ?, NOW(3))`,
      [
        user.user_id,
        requestData.order_id || null,
        JSON.stringify(requestData.test_item_data),
        requestData.note || null
      ]
    );

    const requestId = result.insertId;

    // 只通知指定用户（user_id = 'JC0089'）
    const [targetUsers] = await pool.query(
      `SELECT u.user_id 
       FROM users u
       WHERE u.user_id = 'JC0089' AND u.is_active = 1`
    );

    // 为指定用户创建通知
    const io = getIO();
    const notificationPromises = targetUsers.map(async (targetUser) => {
      // 在content中包含申请ID，方便前端解析
      const notificationId = await createNotification(pool, {
        user_id: targetUser.user_id,
        title: '加测申请',
        content: `${user.name || user.user_id} 提交了加测申请，委托单号：${requestData.order_id || '未知'}`,
        type: 'addon_request',
        related_order_id: requestData.order_id || null,
        related_test_item_id: null,
        related_file_id: null,
        related_addon_request_id: requestId
      });

      // 通过WebSocket推送通知
      if (io) {
        const [countRows] = await pool.query(
          'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
          [targetUser.user_id]
        );
        const unreadCount = countRows[0].count;

        io.to(`user-${targetUser.user_id}`).emit('new-notification', {
          notification_id: notificationId,
          title: '加测申请',
          content: `${user.name || user.user_id} 提交了加测申请，委托单号：${requestData.order_id || '未知'}`,
          type: 'addon_request',
          related_order_id: requestData.order_id || null,
          related_test_item_id: null,
          related_file_id: null,
          related_addon_request_id: requestId,
          unread_count: unreadCount,
          created_at: new Date()
        });
      }
    });

    await Promise.all(notificationPromises);

    res.json({
      success: true,
      request_id: requestId,
      message: '加测申请已提交，等待管理员审核'
    });
  } catch (error) {
    console.error('创建加测申请失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取加测申请列表（管理员）
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const pool = await getPool();

    let whereConditions = [];
    let params = [];

    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT ar.*, 
              u.name as applicant_name,
              u.user_id as applicant_id,
              o.order_id as order_id_display
       FROM addon_requests ar
       LEFT JOIN users u ON ar.applicant_id = u.user_id
       LEFT JOIN orders o ON ar.order_id = o.order_id
       ${whereClause}
       ORDER BY ar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total
       FROM addon_requests
       ${whereClause}`,
      params
    );

    // 安全解析test_item_data JSON
    const requests = rows.map(row => {
      let testItemData = {};
      try {
        if (typeof row.test_item_data === 'string') {
          testItemData = JSON.parse(row.test_item_data);
        } else if (row.test_item_data && typeof row.test_item_data === 'object') {
          testItemData = row.test_item_data;
        }
      } catch (parseError) {
        console.error('解析test_item_data失败:', parseError);
        testItemData = {};
      }
      return {
        ...row,
        test_item_data: testItemData
      };
    });

    res.json({
      data: requests,
      total: countResult[0].total,
      page: Number(page),
      pageSize: Number(pageSize)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个加测申请详情（管理员或申请人本人可以查看）
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const [rows] = await pool.query(
      `SELECT ar.*, 
              u.name as applicant_name,
              u.user_id as applicant_id,
              o.order_id as order_id_display,
              comm.commissioner_name,
              comm.contact_name as commissioner_contact_name
       FROM addon_requests ar
       LEFT JOIN users u ON ar.applicant_id = u.user_id
       LEFT JOIN orders o ON ar.order_id = o.order_id
       LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
       WHERE ar.request_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '加测申请不存在' });
    }

    // 权限检查：管理员或申请人本人可以查看
    const isAdmin = req.user.role === 'admin';
    const isApplicant = rows[0].applicant_id === req.user.user_id;
    
    if (!isAdmin && !isApplicant) {
      return res.status(403).json({ error: '无权查看此申请' });
    }

    // 安全解析JSON：如果已经是对象就直接使用，否则尝试解析
    let testItemData = {};
    try {
      if (typeof rows[0].test_item_data === 'string') {
        testItemData = JSON.parse(rows[0].test_item_data);
      } else if (rows[0].test_item_data && typeof rows[0].test_item_data === 'object') {
        testItemData = rows[0].test_item_data;
      }
    } catch (parseError) {
      console.error('解析test_item_data失败:', parseError);
      console.error('原始数据:', rows[0].test_item_data);
      testItemData = {};
    }

    const request = {
      ...rows[0],
      test_item_data: testItemData
    };

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 同意加测申请并创建检测项目
router.put('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    // 获取申请详情
    const [requestRows] = await pool.query(
      'SELECT * FROM addon_requests WHERE request_id = ? AND status = ?',
      [id, 'pending']
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ error: '加测申请不存在或已被处理' });
    }

    const request = requestRows[0];
    
    // 安全解析test_item_data JSON
    let testItemData = {};
    try {
      if (typeof request.test_item_data === 'string') {
        testItemData = JSON.parse(request.test_item_data);
      } else if (request.test_item_data && typeof request.test_item_data === 'object') {
        testItemData = request.test_item_data;
      }
    } catch (parseError) {
      console.error('解析test_item_data失败:', parseError);
      testItemData = {};
    }

    // 使用管理员提交的数据（可能已修改）
    const finalTestItemData = req.body.test_item_data || testItemData;

    // 验证委托单是否存在
    if (request.order_id) {
      const [orderRows] = await pool.query(
        'SELECT * FROM orders WHERE order_id = ?',
        [request.order_id]
      );

      if (orderRows.length === 0) {
        return res.status(400).json({ error: '委托单不存在' });
      }
    }

    // 开始事务
    await pool.query('START TRANSACTION');

    try {
      // 处理日期字段
      const processDate = (value) => {
        if (value === '' || value === undefined || value === null) return null;
        if (typeof value === 'string' && value.includes('T')) {
          return value.split('T')[0];
        }
        return value;
      };

      const processDateTime = (value) => {
        if (value === '' || value === undefined || value === null) return null;
        if (typeof value === 'string' && value.includes('T')) {
          return value.replace('T', ' ').replace('Z', '').split('.')[0];
        }
        return value;
      };

      // 创建检测项目 - 使用与test_items.js相同的字段顺序（不包含有默认值的字段：service_urgency, unit, business_confirmed）
      const sqlFields = [
        'order_id', 'price_id', 'category_name', 'detail_name', 'sample_name', 'material', 'sample_type', 'original_no',
        'test_code', 'standard_code', 'department_id', 'group_id', 'quantity', 'unit_price', 'discount_rate',
        'final_unit_price', 'line_total', 'machine_hours', 'work_hours', 'is_add_on', 'is_outsourced',
        'seq_no', 'sample_preparation', 'note', 'status', 'current_assignee', 'supervisor_id', 'technician_id',
        'arrival_mode', 'sample_arrival_status', 'equipment_id', 'check_notes', 'test_notes',
        'actual_sample_quantity', 'actual_delivery_date', 'field_test_time', 'price_note',
        'assignment_note', 'business_note', 'service_urgency', 'unit', 'addon_reason'
      ];
      
      const placeholders = sqlFields.map(() => '?').join(', ');
      
      const paramArray = [
        request.order_id || null,
        finalTestItemData.price_id || null,
        finalTestItemData.category_name || '',
        finalTestItemData.detail_name || '',
        finalTestItemData.sample_name || null,
        finalTestItemData.material || null,
        finalTestItemData.sample_type || null,
        finalTestItemData.original_no || null,
        finalTestItemData.test_code || null,
        finalTestItemData.standard_code || null,
        finalTestItemData.department_id || null,
        finalTestItemData.group_id || null,
        finalTestItemData.quantity || 1,
        finalTestItemData.unit_price || null,
        finalTestItemData.discount_rate || null,
        finalTestItemData.final_unit_price || null,
        finalTestItemData.line_total || null,
        finalTestItemData.machine_hours || 0,
        finalTestItemData.work_hours || 0,
        1, // is_add_on = 1 表示加测
        finalTestItemData.is_outsourced || 0,
        finalTestItemData.seq_no || null,
        finalTestItemData.sample_preparation || null,
        finalTestItemData.note || null,
        'new',
        finalTestItemData.current_assignee || null,
        finalTestItemData.supervisor_id || null,
        finalTestItemData.technician_id || null,
        finalTestItemData.arrival_mode || null,
        finalTestItemData.sample_arrival_status || 'not_arrived',
        finalTestItemData.equipment_id || null,
        finalTestItemData.check_notes || null,
        finalTestItemData.test_notes || null,
        finalTestItemData.actual_sample_quantity || null,
        processDate(finalTestItemData.actual_delivery_date),
        processDateTime(finalTestItemData.field_test_time),
        (finalTestItemData.price_note !== undefined && finalTestItemData.price_note !== null) ? finalTestItemData.price_note : null,
        finalTestItemData.assignment_note || null,
        finalTestItemData.business_note || null,
        finalTestItemData.service_urgency || 'normal',
        finalTestItemData.unit || '机时',
        finalTestItemData.addon_reason || null
      ];

      const sql = `INSERT INTO test_items (${sqlFields.join(', ')}) VALUES (${placeholders})`;
      const [testItemResult] = await pool.query(sql, paramArray);

      const testItemId = testItemResult.insertId;

      // 更新申请状态
      await pool.query(
        'UPDATE addon_requests SET status = ?, approved_by = ?, approved_at = NOW(3), test_item_id = ? WHERE request_id = ?',
        ['approved', user.user_id, testItemId, id]
      );

      // 提交事务
      await pool.query('COMMIT');

      // 通知申请人
      const [applicantRows] = await pool.query(
        'SELECT user_id, name FROM users WHERE user_id = ?',
        [request.applicant_id]
      );

      if (applicantRows.length > 0) {
        const notificationId = await createNotification(pool, {
          user_id: request.applicant_id,
          title: '加测申请已通过',
          content: `您的加测申请已通过审核，检测项目已创建。委托单号：${request.order_id || '未知'}`,
          type: 'addon_request',
          related_order_id: request.order_id || null,
          related_test_item_id: testItemId,
          related_file_id: null,
          related_addon_request_id: id
        });

        // 通过WebSocket推送通知
        const io = getIO();
        if (io) {
          const [countRows] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [request.applicant_id]
          );
          const unreadCount = countRows[0].count;

          io.to(`user-${request.applicant_id}`).emit('new-notification', {
            notification_id: notificationId,
            title: '加测申请已通过',
            content: `您的加测申请已通过审核，检测项目已创建。委托单号：${request.order_id || '未知'}`,
            type: 'addon_request',
            related_order_id: request.order_id || null,
            related_test_item_id: testItemId,
            related_file_id: null,
            related_addon_request_id: id,
            unread_count: unreadCount,
            created_at: new Date()
          });
        }
      }

      res.json({
        success: true,
        test_item_id: testItemId,
        message: '加测申请已通过，检测项目已创建'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('同意加测申请失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

