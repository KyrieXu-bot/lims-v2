import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

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
    const category = req.body.category || 'experiment_report';
    const categoryDir = path.join(uploadDir, category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    cb(null, categoryDir);
  },
  filename: (req, file, cb) => {
    // 处理中文文件名编码问题
    const originalName = decodeFileName(file.originalname);
    const uniqueName = `${uuidv4()}_${originalName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB限制
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-rar-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'), false);
    }
  }
});

// 所有路由都需要认证
router.use(requireAuth);

// 上传文件
router.post('/upload', requireAnyRole(['admin', 'leader', 'supervisor', 'employee']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有选择文件' });
    }

    const { category, order_id, test_item_id, sample_id } = req.body;
    const user = req.user;

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

    res.json({
      success: true,
      file_id: result.insertId,
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
router.get('/', requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']), async (req, res) => {
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
router.get('/download/:id', requireAnyRole(['admin', 'leader', 'supervisor', 'employee', 'sales']), async (req, res) => {
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
router.delete('/:id', requireAnyRole(['admin', 'leader', 'supervisor']), async (req, res) => {
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
