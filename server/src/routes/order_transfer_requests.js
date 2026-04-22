import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import { createNotification } from './notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(requireAuth);

function emitNewNotification(io, pool, targetUserId, payload) {
  if (!io || !targetUserId) return Promise.resolve();
  return pool
    .query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [targetUserId])
    .then(([countRows]) => {
      const unreadCount = countRows[0].count;
      io.to(`user-${targetUserId}`).emit('new-notification', {
        ...payload,
        unread_count: unreadCount,
        created_at: new Date()
      });
    });
}

function getBeijingNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toPrefixFromYearMonth(year, month1to12) {
  const yy = String(year).slice(-2);
  const mm = pad2(month1to12);
  return `JC${yy}${mm}`;
}

function getAllowedTransferPrefixes(now) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const current = toPrefixFromYearMonth(y, m);
  if (d >= 6) return [current];
  const prevDate = new Date(y, m - 2, 1);
  const prev = toPrefixFromYearMonth(prevDate.getFullYear(), prevDate.getMonth() + 1);
  return [prev, current];
}

function normalizeOrderId(v) {
  if (v == null) return '';
  return String(v).trim().toUpperCase();
}

/** 新单号由开单员线下确定时为空，通知文案中不展示拟转新单号 */
function formatTargetOrderFragment(targetOrderId) {
  const t = targetOrderId != null ? String(targetOrderId).trim() : '';
  return t ? `，拟转新单号：${t}` : '';
}

function getTransferRequestMode(orderId, now = getBeijingNow()) {
  const normalized = normalizeOrderId(orderId);
  const allowed = getAllowedTransferPrefixes(now);
  return allowed.some((p) => normalized.startsWith(p)) ? 'direct_sales' : 'leader_then_sales';
}

async function fetchLeaderApprovers(pool, departmentId) {
  if (departmentId == null) return [];
  const [rows] = await pool.query(
    `SELECT user_id
     FROM users
     WHERE group_role = 'leader' AND is_active = 1 AND department_id = ?`,
    [departmentId]
  );
  return rows || [];
}

async function notifyUser(pool, io, payload) {
  const notificationId = await createNotification(pool, payload);
  if (io) {
    await emitNewNotification(io, pool, payload.user_id, {
      notification_id: notificationId,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      related_order_id: payload.related_order_id ?? null,
      related_test_item_id: payload.related_test_item_id ?? null,
      related_file_id: payload.related_file_id ?? null,
      related_addon_request_id: payload.related_addon_request_id ?? null,
      related_order_transfer_request_id: payload.related_order_transfer_request_id ?? null,
      order_transfer_request_status: payload.order_transfer_request_status,
      order_transfer_target_order_id: payload.order_transfer_target_order_id,
      order_transfer_current_step: payload.order_transfer_current_step,
      order_transfer_approval_flow: payload.order_transfer_approval_flow,
      order_transfer_reason: payload.order_transfer_reason ?? null
    });
  }
  return notificationId;
}

/** 检测项目快照（只读展示，字段与委托单列表对齐） */
async function fetchTestItemSnapshot(pool, testItemId) {
  const [rows] = await pool.query(
    `SELECT 
      ti.test_item_id,
      ti.order_id,
      o.original_order_id,
      o.root_order_id,
      o.is_transferred,
      CASE 
        WHEN ti.is_add_on IN (1, 2) THEN ti.created_at 
        ELSE o.created_at 
      END as order_created_at,
      ti.created_at as test_item_created_at,
      c.customer_name,
      comm.contact_name as customer_contact_name,
      comm.commissioner_name as commissioner_name,
      u.name as assignee_name,
      ti.current_assignee,
      CONCAT(ti.category_name, ' - ', ti.detail_name) as test_item_name,
      ti.category_name,
      ti.detail_name,
      ti.sample_name,
      ti.material,
      ti.original_no,
      ti.test_code,
      ti.department_id,
      d.department_name,
      lg.group_name,
      ti.seq_no,
      ti.unit_price as standard_price,
      ti.discount_rate,
      CASE 
        WHEN ti.service_urgency = 'normal' THEN '不加急'
        WHEN ti.service_urgency = 'urgent_1_5x' THEN '加急1.5倍'
        WHEN ti.service_urgency = 'urgent_2x' THEN '特急2倍'
        ELSE ti.service_urgency
      END as service_urgency,
      ti.field_test_time,
      ti.note,
      e.equipment_name,
      tech.name as technician_name,
      ti.assignment_note,
      ti.actual_sample_quantity,
      ti.work_hours,
      ti.machine_hours,
      ti.test_notes,
      ti.unit,
      ti.line_total,
      ti.final_unit_price,
      ti.lab_price,
      ti.actual_delivery_date,
      ti.business_note,
      ti.invoice_note,
      ti.abnormal_condition,
      ti.status,
      ti.quantity,
      ti.arrival_mode,
      ti.sample_arrival_status,
      ti.price_note,
      ti.is_add_on,
      ti.addon_reason,
      ti.addon_target,
      sup.name as supervisor_name,
      ti.supervisor_id,
      ti.technician_id
    FROM test_items ti
    LEFT JOIN orders o ON o.order_id = ti.order_id
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN commissioners comm ON comm.commissioner_id = o.commissioner_id
    LEFT JOIN users u ON u.user_id = ti.current_assignee
    LEFT JOIN users tech ON tech.user_id = ti.technician_id
    LEFT JOIN users sup ON sup.user_id = ti.supervisor_id
    LEFT JOIN departments d ON d.department_id = ti.department_id
    LEFT JOIN lab_groups lg ON lg.group_id = ti.group_id
    LEFT JOIN equipment e ON e.equipment_id = ti.equipment_id
    WHERE ti.test_item_id = ?`,
    [testItemId]
  );
  return rows[0] || null;
}

// 实验室提交转单申请
router.post('/', requireAnyRole(['leader', 'supervisor', 'employee']), async (req, res) => {
  try {
    const user = req.user;
    const pool = await getPool();
    const { test_item_id, target_order_id: rawTarget, transfer_reason: rawReason } = req.body;
    const target_order_id = typeof rawTarget === 'string' ? rawTarget.trim() : '';
    const transfer_reason = typeof rawReason === 'string' ? rawReason.trim() : '';

    if (!test_item_id) {
      return res.status(400).json({ error: '缺少必要参数：test_item_id' });
    }

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
    const transferMode = getTransferRequestMode(testItem.order_id);
    const requiresLeaderFlow = transferMode === 'leader_then_sales';

    if (requiresLeaderFlow && user.role !== 'supervisor') {
      return res.status(403).json({ error: '当前仅支持组长发起超期转单申请' });
    }
    if (requiresLeaderFlow && !transfer_reason) {
      return res.status(400).json({ error: '超期转单申请必须填写转单原因' });
    }

    if (!testItem.current_assignee) {
      return res.status(400).json({ error: '该项目未设置业务负责人，无法提交转单申请' });
    }

    if (testItem.status === 'cancelled') {
      return res.status(400).json({ error: '已取消的项目不能申请转单' });
    }

    const [existingRows] = await pool.query(
      `SELECT request_id FROM order_transfer_requests 
       WHERE test_item_id = ? AND status = 'pending'`,
      [test_item_id]
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ error: '该检测项目已有待处理的转单申请' });
    }

    const [result] = await pool.query(
      `INSERT INTO order_transfer_requests 
       (applicant_id, test_item_id, target_order_id, transfer_reason, approval_flow, current_step, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(3))`,
      [
        user.user_id,
        test_item_id,
        target_order_id,
        transfer_reason || null,
        transferMode,
        requiresLeaderFlow ? 'leader_review' : 'sales_review'
      ]
    );

    const requestId = result.insertId;
    const itemLabel =
      testItem.category_name && testItem.detail_name
        ? `${testItem.category_name} - ${testItem.detail_name}`
        : testItem.category_name || testItem.detail_name || '检测项目';

    const reasonSuffix = transfer_reason ? `。转单原因：${transfer_reason}` : '';
    const tgtFrag = formatTargetOrderFragment(target_order_id);
    const content = `${user.name || user.user_id} 提交转单申请。原委托单号：${
      testItem.order_id_display || testItem.order_id || '未知'
    }。检测项目：${itemLabel}${tgtFrag}${reasonSuffix}。申请ID：${requestId}`;

    const io = getIO();
    if (requiresLeaderFlow) {
      const leaders = await fetchLeaderApprovers(pool, testItem.department_id);
      if (!leaders.length) {
        return res.status(400).json({ error: '未找到可审批的室主任，无法提交超期转单申请' });
      }
      for (const leader of leaders) {
        await notifyUser(pool, io, {
          user_id: leader.user_id,
          title: '转单申请待室主任审批',
          content,
          type: 'order_transfer_request',
          related_order_id: testItem.order_id || null,
          related_test_item_id: test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_order_transfer_request_id: requestId,
          order_transfer_request_status: 'pending',
          order_transfer_target_order_id: target_order_id,
          order_transfer_current_step: 'leader_review',
          order_transfer_approval_flow: transferMode,
          order_transfer_reason: transfer_reason || null
        });
      }
    } else {
      await notifyUser(pool, io, {
        user_id: testItem.current_assignee,
        title: '转单申请',
        content,
        type: 'order_transfer_request',
        related_order_id: testItem.order_id || null,
        related_test_item_id: test_item_id,
        related_file_id: null,
        related_addon_request_id: null,
        related_order_transfer_request_id: requestId,
        order_transfer_request_status: 'pending',
        order_transfer_target_order_id: target_order_id,
        order_transfer_current_step: 'sales_review',
        order_transfer_approval_flow: transferMode,
        order_transfer_reason: transfer_reason || null
      });
    }

    res.json({
      success: true,
      request_id: requestId,
      message: requiresLeaderFlow
        ? '超期转单申请已提交，已通知室主任审批'
        : '转单申请已提交，已通知业务负责人'
    });
  } catch (error) {
    console.error('创建转单申请失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看申请详情（申请人、室主任、业务员、知晓人、管理员）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    const [reqRows] = await pool.query(
      `SELECT otr.*, 
              u.name as applicant_name,
              rej.name as rejected_by_name
       FROM order_transfer_requests otr
       LEFT JOIN users u ON u.user_id = otr.applicant_id
       LEFT JOIN users rej ON rej.user_id = otr.rejected_by
       WHERE otr.request_id = ?`,
      [id]
    );

    if (reqRows.length === 0) {
      return res.status(404).json({ error: '申请不存在' });
    }

    const requestRow = reqRows[0];
    const testItem = await fetchTestItemSnapshot(pool, requestRow.test_item_id);

    if (!testItem) {
      return res.status(404).json({ error: '检测项目不存在' });
    }

    const canView =
      user.role === 'admin' ||
      requestRow.applicant_id === user.user_id ||
      testItem.current_assignee === user.user_id ||
      (user.role === 'leader' && Number(user.department_id) === Number(testItem.department_id)) ||
      (user.user_id === 'JC0092' && ['pending', 'approved'].includes(requestRow.status)) ||
      (user.user_id === 'JC0089' && requestRow.status === 'approved');

    if (!canView) {
      return res.status(403).json({ error: '无权查看此申请' });
    }

    res.json({
      request: requestRow,
      test_item: testItem
    });
  } catch (error) {
    console.error('获取转单申请详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 审批通过：可能是室主任、业务员或许文凤通过
router.put('/:id/approve', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    const [requestRows] = await pool.query(
      `SELECT otr.*, ti.current_assignee, ti.order_id, ti.department_id, o.order_id as order_id_display
       FROM order_transfer_requests otr
       LEFT JOIN test_items ti ON ti.test_item_id = otr.test_item_id
       LEFT JOIN orders o ON o.order_id = ti.order_id
       WHERE otr.request_id = ? AND otr.status = 'pending'`,
      [id]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ error: '申请不存在或已处理' });
    }

    const request = requestRows[0];

    const io = getIO();
    const itemLabel =
      (await fetchTestItemSnapshot(pool, request.test_item_id))?.test_item_name || '检测项目';
    const reasonSuffix = request.transfer_reason ? `。转单原因：${request.transfer_reason}` : '';

    if (request.current_step === 'leader_review') {
      if (user.role !== 'leader' && user.role !== 'admin') {
        return res.status(403).json({ error: '当前仅室主任可审批该申请' });
      }
      if (user.role === 'leader' && Number(user.department_id) !== Number(request.department_id)) {
        return res.status(403).json({ error: '无权审批非本部门转单申请' });
      }
      await pool.query(
        `UPDATE order_transfer_requests
         SET current_step = 'sales_review',
             leader_approved_by = ?,
             leader_approved_at = NOW(3)
         WHERE request_id = ?`,
        [user.user_id, id]
      );
      const salesContent = `室主任已通过转单申请，等待业务员审批。原委托单号：${
        request.order_id_display || request.order_id || '未知'
      }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;
      await notifyUser(pool, io, {
        user_id: request.current_assignee,
        title: '转单申请待业务审批',
        content: salesContent,
        type: 'order_transfer_request',
        related_order_id: request.order_id || null,
        related_test_item_id: request.test_item_id,
        related_file_id: null,
        related_addon_request_id: null,
        related_order_transfer_request_id: Number(id),
        order_transfer_request_status: 'pending',
        order_transfer_target_order_id: request.target_order_id,
        order_transfer_current_step: 'sales_review',
        order_transfer_approval_flow: request.approval_flow,
        order_transfer_reason: request.transfer_reason || null
      });
      return res.json({ success: true, message: '室主任审批通过，已通知业务员' });
    }

    if (request.current_step === 'sales_review') {
      if (user.role === 'sales' && request.current_assignee !== user.user_id) {
        return res.status(403).json({ error: '无权处理此申请' });
      }
      // 仅超期流程需要许文凤审批；常规流程业务员通过即完结
      if (request.approval_flow === 'leader_then_sales') {
        await pool.query(
          `UPDATE order_transfer_requests
           SET current_step = 'xwf_review'
           WHERE request_id = ?`,
          [id]
        );
        const xwfContent = `业务员已通过转单申请，等待许文凤审批。原委托单号：${
          request.order_id_display || request.order_id || '未知'
        }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;
        await notifyUser(pool, io, {
          user_id: 'JC0092',
          title: '转单申请待许文凤审批',
          content: xwfContent,
          type: 'order_transfer_request',
          related_order_id: request.order_id || null,
          related_test_item_id: request.test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_order_transfer_request_id: Number(id),
          order_transfer_request_status: 'pending',
          order_transfer_target_order_id: request.target_order_id,
          order_transfer_current_step: 'xwf_review',
          order_transfer_approval_flow: request.approval_flow,
          order_transfer_reason: request.transfer_reason || null
        });
        return res.json({ success: true, message: '业务员审批通过，已通知许文凤审批' });
      }

      await pool.query(
        `UPDATE order_transfer_requests
         SET status = 'approved',
             current_step = 'done',
             approved_by = ?,
             approved_at = NOW(3),
             rejected_by = NULL,
             rejected_at = NULL
         WHERE request_id = ?`,
        [user.user_id, id]
      );

      const clerkContent = `业务员已同意转单申请。原委托单号：${
        request.order_id_display || request.order_id || '未知'
      }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;
      const applicantContent = `您的转单申请已审批通过。原委托单号：${
        request.order_id_display || request.order_id || '未知'
      }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;

      await notifyUser(pool, io, {
        user_id: 'JC0089',
        title: '转单申请已通过',
        content: clerkContent,
        type: 'order_transfer_request',
        related_order_id: request.order_id || null,
        related_test_item_id: request.test_item_id,
        related_file_id: null,
        related_addon_request_id: null,
        related_order_transfer_request_id: Number(id),
        order_transfer_request_status: 'approved',
        order_transfer_target_order_id: request.target_order_id,
        order_transfer_current_step: 'done',
        order_transfer_approval_flow: request.approval_flow,
        order_transfer_reason: request.transfer_reason || null
      });
      if (request.applicant_id) {
        await notifyUser(pool, io, {
          user_id: request.applicant_id,
          title: '转单申请已通过',
          content: applicantContent,
          type: 'order_transfer_request',
          related_order_id: request.order_id || null,
          related_test_item_id: request.test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_order_transfer_request_id: Number(id),
          order_transfer_request_status: 'approved',
          order_transfer_target_order_id: request.target_order_id,
          order_transfer_current_step: 'done',
          order_transfer_approval_flow: request.approval_flow,
          order_transfer_reason: request.transfer_reason || null
        });
      }
      return res.json({ success: true, message: '业务员审批通过，已通知开单员与申请人' });
    }

    if (request.current_step === 'xwf_review') {
      if (user.user_id !== 'JC0092' && user.role !== 'admin') {
        return res.status(403).json({ error: '当前仅许文凤可审批该申请' });
      }
      await pool.query(
        `UPDATE order_transfer_requests
         SET status = 'approved',
             current_step = 'done',
             approved_by = ?,
             approved_at = NOW(3),
             rejected_by = NULL,
             rejected_at = NULL
         WHERE request_id = ?`,
        [user.user_id, id]
      );
      const mtContent = `许文凤已通过转单申请，请知晓。原委托单号：${
        request.order_id_display || request.order_id || '未知'
      }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;
      const applicantContent = `您的转单申请已全部审批通过。原委托单号：${
        request.order_id_display || request.order_id || '未知'
      }。${itemLabel}${formatTargetOrderFragment(request.target_order_id)}${reasonSuffix}。申请ID：${id}`;
      await notifyUser(pool, io, {
        user_id: 'JC0089',
        title: '转单申请已通过',
        content: mtContent,
        type: 'order_transfer_request',
        related_order_id: request.order_id || null,
        related_test_item_id: request.test_item_id,
        related_file_id: null,
        related_addon_request_id: null,
        related_order_transfer_request_id: Number(id),
        order_transfer_request_status: 'approved',
        order_transfer_target_order_id: request.target_order_id,
        order_transfer_current_step: 'done',
        order_transfer_approval_flow: request.approval_flow,
        order_transfer_reason: request.transfer_reason || null
      });
      if (request.applicant_id) {
        await notifyUser(pool, io, {
          user_id: request.applicant_id,
          title: '转单申请已通过',
          content: applicantContent,
          type: 'order_transfer_request',
          related_order_id: request.order_id || null,
          related_test_item_id: request.test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_order_transfer_request_id: Number(id),
          order_transfer_request_status: 'approved',
          order_transfer_target_order_id: request.target_order_id,
          order_transfer_current_step: 'done',
          order_transfer_approval_flow: request.approval_flow,
          order_transfer_reason: request.transfer_reason || null
        });
      }
      return res.json({ success: true, message: '许文凤审批通过，已通知开单员与申请人' });
    }

    return res.status(400).json({ error: '当前申请不在可审批阶段' });
  } catch (error) {
    console.error('同意转单失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 审批拒绝：可能是室主任、业务员或许文凤拒绝
router.put('/:id/reject', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const pool = await getPool();

    const [requestRows] = await pool.query(
      `SELECT otr.*, ti.current_assignee, ti.order_id, ti.department_id
       FROM order_transfer_requests otr
       LEFT JOIN test_items ti ON ti.test_item_id = otr.test_item_id
       WHERE otr.request_id = ? AND otr.status = 'pending'`,
      [id]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ error: '申请不存在或已处理' });
    }

    const request = requestRows[0];

    if (request.current_step === 'leader_review') {
      if (user.role !== 'leader' && user.role !== 'admin') {
        return res.status(403).json({ error: '当前仅室主任可驳回该申请' });
      }
      if (user.role === 'leader' && Number(user.department_id) !== Number(request.department_id)) {
        return res.status(403).json({ error: '无权处理非本部门转单申请' });
      }
    } else if (request.current_step === 'sales_review') {
      if (user.role === 'sales' && request.current_assignee !== user.user_id) {
        return res.status(403).json({ error: '无权处理此申请' });
      }
    } else if (request.current_step === 'xwf_review') {
      if (user.user_id !== 'JC0092' && user.role !== 'admin') {
        return res.status(403).json({ error: '当前仅许文凤可驳回该申请' });
      }
    } else {
      return res.status(400).json({ error: '当前申请不在可驳回阶段' });
    }

    await pool.query(
      `UPDATE order_transfer_requests 
       SET status = 'rejected', current_step = 'done', rejected_by = ?, rejected_at = NOW(3) 
       WHERE request_id = ?`,
      [user.user_id, id]
    );

    const io = getIO();
    const rejectActor = user.name || user.user_id;
    const rejectContent =
      request.current_step === 'leader_review'
        ? `您的超期转单申请已被室主任 ${rejectActor} 拒绝。申请ID：${id}`
        : request.current_step === 'sales_review'
          ? `您的转单申请已被业务员 ${rejectActor} 拒绝。申请ID：${id}`
          : `您的转单申请已被许文凤 ${rejectActor} 拒绝。申请ID：${id}`;

    if (request.applicant_id) {
      const notificationId = await createNotification(pool, {
        user_id: request.applicant_id,
        title: '转单申请未通过',
        content: rejectContent,
        type: 'order_transfer_request',
        related_order_id: request.order_id || null,
        related_test_item_id: request.test_item_id,
        related_file_id: null,
        related_addon_request_id: null,
        related_order_transfer_request_id: Number(id)
      });

      if (io) {
        await emitNewNotification(io, pool, request.applicant_id, {
          notification_id: notificationId,
          title: '转单申请未通过',
          content: rejectContent,
          type: 'order_transfer_request',
          related_order_id: request.order_id || null,
          related_test_item_id: request.test_item_id,
          related_file_id: null,
          related_addon_request_id: null,
          related_order_transfer_request_id: Number(id),
          order_transfer_request_status: 'rejected',
          order_transfer_current_step: 'done',
          order_transfer_approval_flow: request.approval_flow,
          order_transfer_reason: request.transfer_reason || null
        });
      }
    }

    res.json({ success: true, message: '已拒绝该转单申请' });
  } catch (error) {
    console.error('拒绝转单失败:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
