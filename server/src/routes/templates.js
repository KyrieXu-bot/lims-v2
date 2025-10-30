import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

// 获取__dirname的ES6模块等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 统一需要登录
router.use(requireAuth);

// 生成委托单模板
// 仅管理员
router.post('/generate-order-template', requireAnyRole(['admin']), async (req, res) => {
  try {
    const templateData = req.body;
    console.log('收到委托单模板数据，字段数量:', Object.keys(templateData).length);
    
    // 模板文件路径
    const templatePath = path.join(__dirname, '..', 'templates', 'order_template.docx');
    console.log('模板文件路径:', templatePath);
    
    // 检查模板文件是否存在
    try {
      await fs.access(templatePath);
      console.log('模板文件存在');
    } catch (error) {
      console.error('模板文件不存在:', error);
      return res.status(404).json({ error: '委托单模板文件不存在' });
    }

    // 读取模板文件
    console.log('开始读取模板文件...');
    const templateBuffer = await fs.readFile(templatePath);
    console.log('模板文件大小:', templateBuffer.length);
    
    if (templateBuffer.length === 0) {
      throw new Error('模板文件为空');
    }
    
    // 生成文档
    console.log('开始创建PizZip...');
    const zip = new PizZip(templateBuffer);
    console.log('PizZip创建成功');
    
    console.log('开始创建Docxtemplater...');
    const doc = new Docxtemplater(zip);
    console.log('Docxtemplater创建成功');
    
    // 设置数据
    console.log('开始设置数据...');
    doc.setData(templateData);
    console.log('数据设置成功');
    
    // 渲染文档
    console.log('开始渲染文档...');
    try {
      doc.render();
      console.log('文档渲染成功');
    } catch (renderError) {
      console.error('文档渲染失败:', renderError);
      throw new Error(`文档渲染失败: ${renderError.message}`);
    }
    
    // 生成最终文档
    console.log('开始生成最终文档...');
    const report = doc.getZip().generate({ type: 'nodebuffer' });
    console.log('文档生成成功，大小:', report.length);

    // 设置响应头（命名：委托单号+客户名称+委托联系人名称）
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const safe = (s) => (typeof s === 'string' ? s.trim() : '');
    const fileName = `${safe(templateData.order_num)}-${safe(templateData.customer_name)}-${safe(templateData.customer_contactName)}.docx`;
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    
    // 发送文档
    console.log('开始发送文档...');
    res.send(report);
    console.log('文档发送完成');
  } catch (error) {
    console.error('生成委托单模板错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: '生成委托单模板失败', details: error.message });
  }
});

// 生成流转单模板
// 仅管理员
router.post('/generate-process-template', requireAnyRole(['admin']), async (req, res) => {
  try {
    const flowData = req.body;
    console.log('收到流转单模板数据，字段数量:', Object.keys(flowData).length);
    
    // 模板文件路径
    const templatePath = path.join(__dirname, '..', 'templates', 'process_template.docx');
    console.log('流转单模板文件路径:', templatePath);
    
    // 检查模板文件是否存在
    try {
      await fs.access(templatePath);
      console.log('流转单模板文件存在');
    } catch (error) {
      console.error('流转单模板文件不存在:', error);
      return res.status(404).json({ error: '流转单模板文件不存在' });
    }

    // 读取模板文件
    console.log('开始读取流转单模板文件...');
    const templateBuffer = await fs.readFile(templatePath);
    console.log('流转单模板文件大小:', templateBuffer.length);
    
    if (templateBuffer.length === 0) {
      throw new Error('流转单模板文件为空');
    }
    
    // 生成文档
    console.log('开始创建流转单PizZip...');
    const zip = new PizZip(templateBuffer);
    console.log('流转单PizZip创建成功');
    
    console.log('开始创建流转单Docxtemplater...');
    const doc = new Docxtemplater(zip);
    console.log('流转单Docxtemplater创建成功');
    
    // 设置数据
    console.log('开始设置流转单数据...');
    doc.setData(flowData);
    console.log('流转单数据设置成功');
    
    // 渲染文档
    console.log('开始渲染流转单文档...');
    try {
      doc.render();
      console.log('流转单文档渲染成功');
    } catch (renderError) {
      console.error('流转单文档渲染失败:', renderError);
      throw new Error(`流转单文档渲染失败: ${renderError.message}`);
    }
    
    // 生成最终文档
    console.log('开始生成最终流转单文档...');
    const report = doc.getZip().generate({ type: 'nodebuffer' });
    console.log('流转单文档生成成功，大小:', report.length);

    // 设置响应头（命名：{委托单号}_流转单.docx）
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const fileName = `${flowData.order_num}_流转单.docx`;
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    
    // 发送文档
    console.log('开始发送流转单文档...');
    res.send(report);
    console.log('流转单文档发送完成');
  } catch (error) {
    console.error('生成流转单模板错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: '生成流转单模板失败', details: error.message });
  }
});

// 物化报告（WH）导出
// 仅物化部门(2)用户可用
router.post('/generate-wh-report', async (req, res) => {
  try {
    if (String(req.user?.department_id) !== '2') {
      return res.status(403).json({ error: '仅物化部门可导出物化报告' });
    }
    const { order_id, test_item_ids = [] } = req.body || {};
    if (!order_id || !Array.isArray(test_item_ids) || test_item_ids.length === 0) {
      return res.status(400).json({ error: 'order_id 和 test_item_ids 必填' });
    }

    const { getPool } = await import('../db.js');
    const pool = await getPool();

    const [orderRows] = await pool.query(
      `SELECT o.order_id, o.created_at, c.customer_name, c.address AS customer_address
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.customer_id
       WHERE o.order_id = ?`,
      [order_id]
    );
    if (orderRows.length === 0) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    const order = orderRows[0];

    const placeholders = test_item_ids.map(()=>'?').join(',');
    const [tiRows] = await pool.query(
      `SELECT 
         ti.test_item_id,
         ti.order_id,
         ti.original_no,
         CONCAT(ti.category_name, ' - ', ti.detail_name) AS test_item,
         ti.standard_code AS test_method,
         '' as size,
         ti.quantity,
         ti.sample_name,
         ti.sample_type,
         ti.material,
         e.equipment_name,
         e.model,
         e.parameters_and_accuracy,
         e.validity_period,
         e.report_title,
         e.equipment_no,
         sup.account AS supervisor_account,
         tech.account AS technician_account,
         ti.department_id
       FROM test_items ti
       LEFT JOIN equipment e ON e.equipment_id = ti.equipment_id
       LEFT JOIN users sup ON sup.user_id = ti.supervisor_id
       LEFT JOIN users tech ON tech.user_id = ti.technician_id
       WHERE ti.test_item_id IN (${placeholders})`,
      test_item_ids
    );

    if (tiRows.length === 0) return res.status(400).json({ error: '未找到检测项目' });
    const uniqueOrders = new Set(tiRows.map(r=>r.order_id));
    if (uniqueOrders.size !== 1 || !uniqueOrders.has(order_id)) {
      return res.status(400).json({ error: '必须选择同一委托单号下的项目' });
    }
    const nonWH = tiRows.find(r=>String(r.department_id) !== '2');
    if (nonWH) return res.status(403).json({ error: '仅支持物化部门项目导出' });

    const first = tiRows[0] || {};
    const managerFirst = (first.supervisor_account || '') || '';
    const testerFirst = (first.technician_account || '') || '';

    const sanitizedItems = tiRows.map((item, idx) => ({
      sample_no: `${order.order_id}-${idx + 1}`,
      sample_name: item.sample_name || '',
      original_no: item.original_no || '',
      test_item: item.test_item || '',
      test_method: item.test_method || '',
      size: item.size || '',
      material: item.material || '',
      sample_type: item.sample_type || '',
      quantity: item.quantity ?? '',
      equipment_no: item.equipment_no || '',
      equipment_name: item.equipment_name || '',
      model: item.model || '',
      parameters_and_accuracy: item.parameters_and_accuracy || '',
      validity_period: item.validity_period || '',
      report_title: item.report_title || ''
    }));

    const equipmentMap = new Map();
    for (const it of tiRows) {
      if (it.equipment_name) {
        const key = `${it.equipment_name}||${it.model}`;
        if (!equipmentMap.has(key)) {
          equipmentMap.set(key, {
            equipment_no: it.equipment_no,
            equipment_name: it.equipment_name,
            model: it.model,
            parameters_and_accuracy: it.parameters_and_accuracy || '',
            validity_period: it.validity_period || '',
            report_title: it.report_title || ''
          });
        }
      }
    }
    const equipments = Array.from(equipmentMap.values());
    const totalCount = tiRows.reduce((sum, it) => sum + (it.quantity || 0), 0);

    let leaderAccount = '';
    try {
      const [leaders] = await pool.query(
        `SELECT u.account FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE r.role_code = 'leader' AND u.department_id = 2
         ORDER BY u.user_id ASC LIMIT 1`
      );
      leaderAccount = leaders[0]?.account || '';
    } catch {}

    const templateData = {
      report_title: '物化实验报告',
      order_num: order.order_id,
      create_time: new Date(order.created_at).toISOString().slice(0,10),
      customer_name: order.customer_name || '',
      customer_address: order.customer_address || '',
      test_items: sanitizedItems,
      total_count: totalCount,
      equipments,
      signature_manager: managerFirst ? `${managerFirst}.png` : '',
      signature_tester: testerFirst ? `${testerFirst}.png` : '',
      signature_leader: leaderAccount ? `${leaderAccount}.png` : ''
    };

    const templatePath = path.join(__dirname, '..', 'templates', 'WH_template.docx');
    await fs.access(templatePath);
    const templateBuffer = await fs.readFile(templatePath);
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip);
    doc.setData(templateData);
    doc.render();
    const report = doc.getZip().generate({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const fileName = `${order.order_id}_物化报告.docx`;
    const encoded = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.send(report);
  } catch (error) {
    console.error('生成物化报告失败:', error);
    res.status(500).json({ error: '生成物化报告失败', details: error.message });
  }
});
export default router;
