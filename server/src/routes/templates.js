import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
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
    // 新版本 API：在构造函数中传入数据
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
    console.log('Docxtemplater创建成功');
    
    // 设置数据（新版本仍支持，但推荐使用构造函数）
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
    // 新版本 API：在构造函数中传入配置
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
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

    // 设置响应头（命名：{委托单号}-{客户名称}-{联系人}.docx，与委托单命名规则一致）
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const fileName = `${flowData.order_num}-${flowData.customer_name || ''}-${flowData.customer_contactName || ''}.docx`;
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
// 仅物化部门(2)用户可用，排除业务员角色
router.post('/generate-wh-report', async (req, res) => {
  try {
    // 排除业务员角色
    if (req.user?.role === 'sales') {
      return res.status(403).json({ error: '业务员无权导出物化报告' });
    }
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

    // 从所有检测项目中查找第一个有效的supervisor_account和technician_account
    let managerFirst = '';
    let testerFirst = '';
    
    // 调试：检查第一个项目的字段
    if (tiRows.length > 0) {
      console.log('第一个检测项目的字段:', {
        supervisor_account: tiRows[0].supervisor_account,
        technician_account: tiRows[0].technician_account,
        allKeys: Object.keys(tiRows[0])
      });
    }
    
    for (const item of tiRows) {
      if (!managerFirst && item.supervisor_account) {
        managerFirst = String(item.supervisor_account).trim();
      }
      if (!testerFirst && item.technician_account) {
        testerFirst = String(item.technician_account).trim();
      }
      // 如果两个都找到了，可以提前退出
      if (managerFirst && testerFirst) break;
    }
    
    console.log('提取的签名字段:', {
      managerFirst,
      testerFirst,
      signature_manager: managerFirst ? `${managerFirst}.png` : '',
      signature_tester: testerFirst ? `${testerFirst}.png` : ''
    });

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

    // 签名图片文件夹路径
    const signaturesDir = path.join(__dirname, '..', 'signatures');
    
    // 辅助函数：加载签名图片路径（docxtemplater-image-module-free 期望文件路径字符串）
    const loadSignatureImagePath = async (account) => {
      if (!account) return null;
      
      // 尝试多种可能的文件扩展名（优先 PNG）
      const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.JPEG'];
      
      for (const ext of extensions) {
        const imagePath = path.join(signaturesDir, `${account}${ext}`);
        try {
          await fs.access(imagePath);
          // 返回文件路径字符串，让图片模块自己读取
          return imagePath;
        } catch (error) {
          // 文件不存在，继续尝试下一个扩展名
          continue;
        }
      }
      
      console.warn(`签名图片未找到: ${account} (已尝试: ${extensions.join(', ')})`);
      return null;
    };
    
    // 保存图片尺寸信息，用于 getSize 函数
    const imageSizeMap = new Map();
    
    // 加载所有签名图片路径
    const signatureManagerPath = await loadSignatureImagePath(managerFirst);
    const signatureTesterPath = await loadSignatureImagePath(testerFirst);
    const signatureLeaderPath = await loadSignatureImagePath(leaderAccount);
    
    // 预先读取图片尺寸（用于 getSize）
    const loadImageSize = async (imagePath) => {
      if (!imagePath) return [100, 50];
      try {
        const imageBuffer = await fs.readFile(imagePath);
        // 简单的尺寸检测（可以根据实际需要调整）
        // 这里使用固定尺寸，如果需要动态检测，可以使用 image-size 库
        return [100, 50];
      } catch (error) {
        return [100, 50];
      }
    };
    
    if (signatureManagerPath) {
      const size = await loadImageSize(signatureManagerPath);
      imageSizeMap.set(signatureManagerPath, size);
    }
    if (signatureTesterPath) {
      const size = await loadImageSize(signatureTesterPath);
      imageSizeMap.set(signatureTesterPath, size);
    }
    if (signatureLeaderPath) {
      const size = await loadImageSize(signatureLeaderPath);
      imageSizeMap.set(signatureLeaderPath, size);
    }
    
    // 构建模板数据
    // 注意：传递图片文件路径字符串，而不是对象
    const templateData = {
      report_title: '物化实验报告',
      order_num: order.order_id,
      create_time: new Date(order.created_at).toISOString().slice(0,10),
      customer_name: order.customer_name || '',
      customer_address: order.customer_address || '',
      test_items: sanitizedItems,
      total_count: totalCount,
      equipments,
      // 签名字段（作为图片文件路径，用于模板中的 {@signature_manager} 语法）
      // 如果图片不存在，值为 null，getImage 会返回 null，图片模块会跳过该图片
      signature_manager: signatureManagerPath,
      signature_tester: signatureTesterPath,
      signature_leader: signatureLeaderPath
    };

    // 调试：输出最终的 templateData 中的签名字段
    console.log('最终 templateData 中的签名字段:', {
      signature_manager: templateData.signature_manager,
      signature_tester: templateData.signature_tester,
      signature_leader: templateData.signature_leader,
      'signature_manager.png': templateData['signature_manager.png'],
      'signature_tester.png': templateData['signature_tester.png'],
      'signature_leader.png': templateData['signature_leader.png'],
      signature_manager_type: typeof templateData.signature_manager,
      signature_tester_type: typeof templateData.signature_tester,
      signature_leader_type: typeof templateData.signature_leader
    });

    const templatePath = path.join(__dirname, '..', 'templates', 'WH_template_old.docx');
    await fs.access(templatePath);
    const templateBuffer = await fs.readFile(templatePath);
    const zip = new PizZip(templateBuffer);
    
    // 配置图片模块
    const imageModule = new ImageModule({
      centered: false,  // 图片是否居中
      getImage: function(tagValue, tagName) {
        // tagValue 现在是图片文件路径字符串
        // tagName 是模板中的变量名（如 'signature_manager'）
        console.log(`getImage 调用: tagName=${tagName}, tagValue=${tagValue}`);
        
        // 如果 tagValue 是 null、undefined 或空字符串，返回 null（不插入图片）
        if (!tagValue || typeof tagValue !== 'string') {
          console.log(`图片路径为空或无效: ${tagName}`);
          return null;
        }
        
        try {
          // 同步读取图片文件（因为 getImage 需要同步返回）
          const imageBuffer = fsSync.readFileSync(tagValue);
          console.log(`getImage 返回 Buffer，大小: ${imageBuffer.length} bytes, 路径: ${tagValue}`);
          return imageBuffer;
        } catch (error) {
          console.error(`读取图片文件失败: ${tagValue}`, error);
          return null;
        }
      },
      getSize: function(img, tagValue, tagName) {
        // getSize 必须始终返回一个数组 [width, height]（像素）
        // img 是 getImage 返回的图片数据（Buffer 或 null）
        // tagValue 现在是图片文件路径字符串
        // tagName 是模板中的变量名
        
        // 从缓存中获取尺寸，如果没有则使用默认值
        let size = [100, 50];
        if (tagValue && imageSizeMap.has(tagValue)) {
          size = imageSizeMap.get(tagValue);
        }
        
        console.log(`getSize 调用: tagName=${tagName}, tagValue=${tagValue}, img=${img ? 'exists' : 'null'}, size=${size}`);
        return size;
      }
    });
    
    // 调试：在设置数据前输出 templateData 的键和签名字段值
    console.log('templateData 的所有键:', Object.keys(templateData));
    console.log('签名字段值:', {
      signature_manager: templateData.signature_manager ? '已加载' : '未找到',
      signature_tester: templateData.signature_tester ? '已加载' : '未找到',
      signature_leader: templateData.signature_leader ? '已加载' : '未找到'
    });
    
    // 新版本 API：在构造函数中传入配置，并注册图片模块
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: [imageModule]  // 注册图片模块
    });
    
    doc.setData(templateData);
    
    // 尝试渲染并捕获可能的错误
    try {
      doc.render();
      console.log('文档渲染成功');
    } catch (renderError) {
      console.error('文档渲染错误:', renderError);
      if (renderError.properties) {
        console.error('错误详情:', renderError.properties);
        console.error('未定义的变量:', renderError.properties.errors);
      }
      throw renderError;
    }
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

// 生成测试服务清单模板
// 仅管理员和业务员可用
router.post('/generate-bills-template', requireAnyRole(['admin', 'sales']), async (req, res) => {
  try {
    const { test_item_ids = [] } = req.body || {};
    if (!Array.isArray(test_item_ids) || test_item_ids.length === 0) {
      return res.status(400).json({ error: 'test_item_ids 必填' });
    }

    const { getPool } = await import('../db.js');
    const pool = await getPool();

    // 查询选中的test_items
    const placeholders = test_item_ids.map(() => '?').join(',');
    const [testItemRows] = await pool.query(
      `SELECT ti.created_at, ti.order_id, ti.price_note, ti.unit, 
              ti.actual_sample_quantity, ti.final_unit_price, ti.category_name, ti.detail_name,
              comm.contact_name
       FROM test_items ti
       LEFT JOIN orders o ON o.order_id = ti.order_id
       LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
       WHERE ti.test_item_id IN (${placeholders})
       ORDER BY ti.order_id, ti.test_item_id`,
      test_item_ids
    );

    if (testItemRows.length === 0) {
      return res.status(400).json({ error: '未找到检测项目' });
    }

    // 获取所有唯一的订单ID
    const uniqueOrderIds = [...new Set(testItemRows.map(r => r.order_id).filter(Boolean))];
    
    // 查询所有相关订单信息（用于获取客户名称等信息）
    let orderInfo = null;
    if (uniqueOrderIds.length > 0) {
      const orderPlaceholders = uniqueOrderIds.map(() => '?').join(',');
      const [orderRows] = await pool.query(
        `SELECT o.order_id, o.created_at,
                c.customer_name,
                comm.contact_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.customer_id
         LEFT JOIN commissioners comm ON o.commissioner_id = comm.commissioner_id
         WHERE o.order_id IN (${orderPlaceholders})
         ORDER BY o.order_id
         LIMIT 1`,
        uniqueOrderIds
      );
      
      if (orderRows.length > 0) {
        orderInfo = orderRows[0];
      }
    }
    
    // 如果没有找到订单信息，使用第一个test_item的信息
    if (!orderInfo && testItemRows.length > 0) {
      orderInfo = {
        order_id: testItemRows[0].order_id || '',
        customer_name: '',
        contact_name: testItemRows[0].contact_name || ''
      };
    }

    // 调试：检查 contact_name 数据
    console.log('委托方名称调试信息:', {
      order_contact_name: orderInfo?.contact_name,
      first_item_contact_name: testItemRows[0]?.contact_name,
      all_contact_names: testItemRows.map(r => r.contact_name).filter(Boolean),
      unique_order_count: uniqueOrderIds.length
    });

    // 计算total_price（所有final_unit_price求和）
    const totalPrice = testItemRows.reduce((sum, item) => {
      const price = parseFloat(item.final_unit_price) || 0;
      return sum + price;
    }, 0);

    // 计算tax（total_price * 6%）
    const tax = totalPrice * 0.06;

    // 计算price_with_tax（total_price + tax）
    const priceWithTax = totalPrice + tax;

    // 格式化日期 - 收样日期格式 yyyy/MM/dd
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    };

    // 格式化今天日期 - 格式 yyyy.MM.dd
    const formatToday = () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    // 人民币大写转换函数
    const convertToChineseCurrency = (amount) => {
      if (!amount || amount === 0) return '零元整';
      
      const num = parseFloat(amount);
      if (isNaN(num) || num < 0) return '零元整';
      
      const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
      const units = ['', '拾', '佰', '仟'];
      
      // 处理小数部分（保留两位小数）
      const integerPart = Math.floor(num);
      const decimalPart = Math.round((num - integerPart) * 100);
      
      // 转换整数部分（简化版本，支持到千万）
      const convertInteger = (n) => {
        if (n === 0) return '';
        
        const str = n.toString();
        const len = str.length;
        let result = '';
        
        // 处理万位以上
        if (len > 4) {
          const wanPart = Math.floor(n / 10000);
          const restPart = n % 10000;
          
          if (wanPart > 0) {
            result += convertSegment(wanPart);
            result += '万';
          }
          
          if (restPart > 0) {
            if (restPart < 1000 && wanPart > 0) {
              result += '零';
            }
            result += convertSegment(restPart);
          }
        } else {
          result = convertSegment(n);
        }
        
        return result;
      };
      
      // 转换四位数段（0-9999）
      const convertSegment = (n) => {
        if (n === 0) return '';
        
        const str = n.toString().padStart(4, '0');
        let result = '';
        let needZero = false;
        
        for (let i = 0; i < 4; i++) {
          const digit = parseInt(str[i]);
          const pos = 3 - i;
          
          if (digit !== 0) {
            if (needZero) {
              result += '零';
              needZero = false;
            }
            result += digits[digit];
            if (pos > 0) {
              result += units[pos];
            }
          } else if (i < 3 && parseInt(str[i + 1]) !== 0) {
            needZero = true;
          }
        }
        
        return result;
      };
      
      // 转换小数部分（角分）
      const convertDecimal = (n) => {
        if (n === 0) return '';
        const jiao = Math.floor(n / 10);
        const fen = n % 10;
        let result = '';
        if (jiao > 0) {
          result += digits[jiao] + '角';
        }
        if (fen > 0) {
          result += digits[fen] + '分';
        }
        return result;
      };
      
      let result = '';
      const integerStr = convertInteger(integerPart);
      if (integerStr) {
        result += integerStr + '元';
      } else {
        result += '零元';
      }
      
      const decimalStr = convertDecimal(decimalPart);
      if (decimalStr) {
        result += decimalStr;
      } else {
        result += '整';
      }
      
      return result;
    };

    // 获取委托方名称（优先使用查询结果中的，否则使用订单中的）
    const getContactName = (item) => {
      if (item.contact_name) return item.contact_name;
      if (orderInfo?.contact_name) return orderInfo.contact_name;
      return '';
    };

    // 转换单位（仅在导出时转换）
    const convertUnit = (unit) => {
      if (!unit) return '';
      if (unit === '机时') return '小时';
      if (unit === '样品数') return '件';
      return unit; // 其他保持不变
    };

    // 构建test_items数组（用于模板中的循环）
    const testItems = testItemRows.map(item => ({
      created_at: formatDate(item.created_at),
      order_id: item.order_id || '',
      price_note: item.price_note || '',
      unit: convertUnit(item.unit),
      quantity: item.actual_sample_quantity || 0,
      final_unit_price: item.final_unit_price || 0,
      category_name: item.category_name || '',
      detail_name: item.detail_name || '',
      contact_name: getContactName(item)
    }));

    // 构建模板数据
    // 如果有多个订单，显示第一个订单的信息，order_id显示为多个订单的合并或第一个订单号
    const displayOrderId = uniqueOrderIds.length === 1 
      ? uniqueOrderIds[0] 
      : uniqueOrderIds.length > 1 
        ? `${uniqueOrderIds[0]}等${uniqueOrderIds.length}个订单`
        : (orderInfo?.order_id || '');
    
    const templateData = {
      customer_name: orderInfo?.customer_name || '',
      created_at: formatDate(testItemRows[0]?.created_at || orderInfo?.created_at),
      order_id: displayOrderId,
      today: formatToday(),
      total_price: totalPrice.toFixed(2),
      tax: tax.toFixed(2),
      price_with_tax: priceWithTax.toFixed(2),
      price_with_tax_CN: convertToChineseCurrency(priceWithTax),
      test_items: testItems
    };

    console.log('测试服务清单模板数据:', {
      customer_name: templateData.customer_name,
      order_id: templateData.order_id,
      total_price: templateData.total_price,
      tax: templateData.tax,
      price_with_tax: templateData.price_with_tax,
      test_items_count: templateData.test_items.length
    });

    // 模板文件路径
    const templatePath = path.join(__dirname, '..', 'templates', 'bills_template.docx');
    
    // 检查模板文件是否存在
    try {
      await fs.access(templatePath);
    } catch (error) {
      console.error('模板文件不存在:', error);
      return res.status(404).json({ error: '测试服务清单模板文件不存在' });
    }

    // 读取模板文件
    const templateBuffer = await fs.readFile(templatePath);
    
    if (templateBuffer.length === 0) {
      throw new Error('模板文件为空');
    }

    // 生成文档
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    // 设置数据
    doc.setData(templateData);

    // 渲染文档
    try {
      doc.render();
      console.log('测试服务清单文档渲染成功');
    } catch (renderError) {
      console.error('文档渲染失败:', renderError);
      if (renderError.properties) {
        console.error('错误详情:', renderError.properties);
        console.error('未定义的变量:', renderError.properties.errors);
      }
      throw new Error(`文档渲染失败: ${renderError.message}`);
    }

    // 生成最终文档
    const report = doc.getZip().generate({ type: 'nodebuffer' });

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    // 文件名格式：{customer_name}-测试服务清单.docx
    const customerName = orderInfo?.customer_name || '客户';
    // 清理文件名中的非法字符
    const safeCustomerName = customerName.replace(/[<>:"/\\|?*]/g, '').trim() || '客户';
    const fileName = `${safeCustomerName}-测试服务清单.docx`;
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);

    // 发送文档
    res.send(report);
    console.log('测试服务清单文档发送完成');
  } catch (error) {
    console.error('生成测试服务清单模板错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: '生成测试服务清单模板失败', details: error.message });
  }
});

export default router;
