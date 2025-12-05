import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import { createNotification } from './notifications.js';
import { getIO } from '../socket.js';

// 处理中文文件名编码的辅助函数
function decodeFileName(originalName) {
  try {
    // 尝试从latin1解码为utf8
    return Buffer.from(originalName, 'latin1').toString('utf8');
  } catch (error) {
    // 如果解码失败，返回原始名称
    console.warn('文件名解码失败:', error.message);
    return originalName;
  }
}

const router = Router();

// 创建上传目录
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const category = req.body.category || 'experiment_report';
      const categoryDir = path.join(uploadDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
      cb(null, categoryDir);
    } catch (error) {
      console.error('创建上传目录失败:', error);
      cb(new Error('无法创建上传目录，请检查服务器权限'), false);
    }
  },
  filename: (req, file, cb) => {
    try {
      // 处理中文文件名编码问题
      const originalName = decodeFileName(file.originalname);
      const uniqueName = `${uuidv4()}_${originalName}`;
      cb(null, uniqueName);
    } catch (error) {
      console.error('处理文件名失败:', error);
      cb(new Error('文件名处理失败: ' + error.message), false);
    }
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB限制（服务器有14T容量，设置较大的限制以支持大文件上传）
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型 MIME
    const allowedMimeTypes = [
      // 图片类型
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      // 文档类型
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 文本类型
      'text/plain', 
      'text/csv',
      'text/xml',
      'text/html',
      'text/yaml',
      'text/x-yaml',
      // YAML 相关
      'application/x-yaml',
      'application/yaml',
      // 压缩文件
      'application/zip', 
      'application/x-rar-compressed',
      'application/x-7z-compressed'
    ];
    
    // 允许的文件扩展名（作为后备方案，当 MIME 类型不确定或系统无法识别时使用）
    const allowedExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
      'pdf',
      'doc', 'docx',
      'xls', 'xlsx',
      'txt', 'csv', 'xml', 'html',
      'yaml', 'yml',
      'zip', 'rar', '7z'
    ];
    
    // 获取文件扩展名
    const fileExt = file.originalname.split('.').pop()?.toLowerCase();
    const mimeType = file.mimetype || '';
    
    // 1. 首先检查 MIME 类型是否在允许列表中
    if (mimeType && allowedMimeTypes.includes(mimeType)) {
      return cb(null, true);
    }
    
    // 2. 如果 MIME 类型不在允许列表中，或者为空/无法识别（如 application/octet-stream）
    // 检查文件扩展名作为后备验证方案
    // 这处理了某些浏览器或系统无法正确识别文件类型的情况（特别是 YAML 和某些文本文件）
    if (fileExt && allowedExtensions.includes(fileExt)) {
      console.log(`文件 ${file.originalname} (扩展名: ${fileExt}) 的 MIME 类型为 ${mimeType || '未知'}，但扩展名已允许`);
      return cb(null, true);
    }
    
    // 3. 都不匹配，拒绝文件
    console.warn(`文件类型被拒绝: ${file.originalname}, MIME: ${mimeType}, 扩展名: ${fileExt}`);
    cb(new Error(`不支持的文件类型: ${mimeType || '未知类型'}。允许的类型包括：图片、PDF、Office文档、文本文件、YAML文件等。文件扩展名: ${fileExt || '无'}`), false);
  }
});

// Multer 错误处理中间件
const handleMulterError = (err, req, res, next) => {
  if (err) {
    console.error('Multer 错误:', err);
    
    // multer 错误代码
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大5GB）。如果您的文件超过此限制，请联系管理员' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: '不支持的文件字段名，请使用 "file" 作为字段名' });
    }
    if (err.code === 'LIMIT_PART_COUNT') {
      return res.status(400).json({ error: '文件数量超过限制' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '文件数量超过限制' });
    }
    if (err.code === 'LIMIT_FIELD_KEY') {
      return res.status(400).json({ error: '字段名过长' });
    }
    if (err.code === 'LIMIT_FIELD_VALUE') {
      return res.status(400).json({ error: '字段值过长' });
    }
    if (err.code === 'LIMIT_FIELD_COUNT') {
      return res.status(400).json({ error: '字段数量超过限制' });
    }
    
    // fileFilter 或其他自定义错误
    if (err.message) {
      return res.status(400).json({ error: err.message });
    }
    
    // 其他未处理的 multer 错误
    return res.status(400).json({ error: '文件上传失败: ' + (err.message || '未知错误') });
  }
  next();
};

// 所有路由都需要认证
router.use(requireAuth);

const UPLOAD_ROLES = ['admin', 'leader', 'supervisor', 'employee', 'viewer'];

// 上传文件
router.post('/upload', 
  requireAnyRole(UPLOAD_ROLES), 
  upload.single('file'),
  handleMulterError,
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有选择文件' });
    }

    const { category, order_id, test_item_id, sample_id } = req.body;
    const user = req.user;

    // 验证用户信息
    if (!user || !user.user_id) {
      // 删除已上传的文件
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(401).json({ error: '用户信息无效' });
    }

    // 验证文件类别 - 三大类
    const validCategories = ['order_attachment', 'raw_data', 'experiment_report'];
    if (!validCategories.includes(category)) {
      // 删除已上传的文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '无效的文件类别' });
    }

    // 处理中文文件名编码
    const originalName = decodeFileName(req.file.originalname);
    
    const pool = await getPool();
    const [result] = await pool.query(
      `INSERT INTO project_files 
       (category, filename, filepath, order_id, test_item_id, sample_id, uploaded_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category,
        originalName,
        req.file.path,
        order_id || null,
        test_item_id || null,
        sample_id || null,
        user.user_id
      ]
    );

    const fileId = result.insertId;

    // 如果是实验原始数据文件，且有关联的检测项目，则通知业务员
    if (category === 'raw_data' && test_item_id) {
      try {
        // 查询检测项目的current_assignee和order_id
        const [testItemRows] = await pool.query(
          `SELECT current_assignee, order_id 
           FROM test_items 
           WHERE test_item_id = ?`,
          [test_item_id]
        );

        if (testItemRows.length > 0 && testItemRows[0].current_assignee) {
          const currentAssignee = testItemRows[0].current_assignee;
          const orderId = testItemRows[0].order_id;

          // 创建通知
          const notificationId = await createNotification(pool, {
            user_id: currentAssignee,
            title: '原始数据文件上传通知',
            content: `您有委托单号 ${orderId || '未知'} 下的原始数据未下载。`,
            type: 'raw_data_upload',
            related_order_id: orderId,
            related_test_item_id: test_item_id,
            related_file_id: fileId
          });

          // 通过WebSocket推送通知
          const io = getIO();
          if (io) {
            // 获取该用户的未读通知数量
            const [countRows] = await pool.query(
              'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
              [currentAssignee]
            );
            const unreadCount = countRows[0].count;

            // 发送通知给该用户
            io.to(`user-${currentAssignee}`).emit('new-notification', {
              notification_id: notificationId,
              title: '原始数据文件上传通知',
              content: `您有委托单号 ${orderId || '未知'} 下的原始数据未下载。`,
              type: 'raw_data_upload',
              related_order_id: orderId,
              related_test_item_id: test_item_id,
              related_file_id: fileId,
              unread_count: unreadCount,
              created_at: new Date()
            });
          }
        }
      } catch (notifyError) {
        // 通知失败不影响文件上传，只记录错误
        console.error('创建通知失败:', notifyError);
      }
    }

    res.json({
      success: true,
      file_id: fileId,
      filename: originalName,
      filepath: req.file.path,
      category
    });
  } catch (error) {
    // 如果数据库操作失败，删除已上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// 获取文件列表
router.get('/', requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer']), async (req, res) => {
  try {
    const { 
      category, 
      order_id, 
      test_item_id, 
      sample_id, 
      page = 1, 
      pageSize = 20,
      q = '' 
    } = req.query;
    
    const offset = (Number(page) - 1) * Number(pageSize);
    const pool = await getPool();
    
    let whereConditions = [];
    let params = [];
    
    // 搜索条件
    if (q) {
      whereConditions.push('(pf.filename LIKE ? OR u.name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    
    // 筛选条件
    if (category) {
      whereConditions.push('pf.category = ?');
      params.push(category);
    }
    
    if (order_id) {
      whereConditions.push('pf.order_id = ?');
      params.push(order_id);
    }
    
    if (test_item_id) {
      whereConditions.push('pf.test_item_id = ?');
      params.push(test_item_id);
    }
    
    if (sample_id) {
      whereConditions.push('pf.sample_id = ?');
      params.push(sample_id);
    }
    
    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const [rows] = await pool.query(
      `SELECT pf.*, u.name as uploaded_by_name, u.department_id
       FROM project_files pf
       LEFT JOIN users u ON pf.uploaded_by = u.user_id
       ${whereClause}
       ORDER BY pf.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total
       FROM project_files pf
       LEFT JOIN users u ON pf.uploaded_by = u.user_id
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

// 下载文件
router.get('/download/:id', requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales', 'viewer']), async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      'SELECT * FROM project_files WHERE file_id = ?',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    const file = rows[0];
    
    if (!fs.existsSync(file.filepath)) {
      return res.status(404).json({ error: '文件已被删除' });
    }
    
    // 更新下载记录
    await pool.query(
      'UPDATE project_files SET last_download_time = NOW(3), last_download_by = ? WHERE file_id = ?',
      [req.user.name || req.user.user_id, req.params.id]
    );
    
    // 设置正确的响应头，支持中文文件名
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.download(file.filepath, file.filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除文件
router.delete('/:id', requireAnyRole(['admin', 'leader', 'supervisor', 'employee']), async (req, res) => {
  try {
    const pool = await getPool();
    const user = req.user;
    
    const [rows] = await pool.query(
      'SELECT * FROM project_files WHERE file_id = ?',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    const file = rows[0];
    
    // 权限检查：实验员只能删除自己上传的原始数据文件
    if (user.role === 'employee') {
      // 实验员只能删除自己上传的文件
      if (file.uploaded_by !== user.user_id) {
        return res.status(403).json({ error: '您只能删除自己上传的文件' });
      }
      // 实验员只能删除原始数据类型的文件
      if (file.category !== 'raw_data') {
        return res.status(403).json({ error: '实验员只能删除原始数据文件' });
      }
    }
    
    // 删除数据库记录
    await pool.query('DELETE FROM project_files WHERE file_id = ?', [req.params.id]);
    
    // 删除物理文件
    if (fs.existsSync(file.filepath)) {
      fs.unlinkSync(file.filepath);
    }
    
    res.json({ success: true, message: '文件删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量上传文件
router.post('/batch-upload', 
  requireAnyRole(['admin', 'leader', 'supervisor', 'employee']), 
  upload.single('file'),
  handleMulterError,
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有选择文件' });
    }

    const { testItemIds } = req.body;
    const user = req.user;

    // 验证用户信息
    if (!user || !user.user_id) {
      // 删除已上传的文件
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(401).json({ error: '用户信息无效' });
    }

    // 解析testItemIds
    let testItemIdArray;
    try {
      testItemIdArray = JSON.parse(testItemIds);
    } catch (e) {
      // 删除已上传的文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '无效的检测项目ID列表' });
    }

    if (!Array.isArray(testItemIdArray) || testItemIdArray.length === 0) {
      // 删除已上传的文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '检测项目ID列表不能为空' });
    }

    // 处理中文文件名编码
    const originalName = decodeFileName(req.file.originalname);
    
    const pool = await getPool();
    
    // 为每个检测项目创建文件记录
    const insertPromises = testItemIdArray.map(testItemId => 
      pool.query(
        `INSERT INTO project_files 
         (category, filename, filepath, test_item_id, uploaded_by) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          'order_attachment', // 默认类别为实验报告
          originalName,
          req.file.path,
          testItemId,
          user.user_id
        ]
      )
    );

    await Promise.all(insertPromises);

    res.json({
      success: true,
      filename: originalName,
      filepath: req.file.path,
      affectedRows: testItemIdArray.length,
      testItemIds: testItemIdArray
    });
  } catch (error) {
    // 如果数据库操作失败，删除已上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// 获取文件统计信息
router.get('/stats', requireAnyRole(['admin', 'leader', 'supervisor']), async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recent_count
      FROM project_files 
      GROUP BY category
      ORDER BY count DESC
    `);
    
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
