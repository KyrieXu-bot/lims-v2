import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import imageSize from 'image-size';
import { requireAuth, requireAnyRole, requireDepartmentIds } from '../middleware/auth.js';
import {
  decodeMulterOriginalName,
  sanitizeRelativeUploadPath,
  prepareImageFolderSectionsForEmbedding,
} from '../lib/imageFolderWordExport.js';

// 获取__dirname的ES6模块等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function micrographTempDirMiddleware(req, res, next) {
  try {
    req.micrographTempRoot = path.join(os.tmpdir(), 'lims-micrograph', uuidv4());
    fsSync.mkdirSync(req.micrographTempRoot, { recursive: true });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      fs.rm(req.micrographTempRoot, { recursive: true, force: true }).catch(() => {});
    };
    res.on('finish', cleanup);
    res.on('close', cleanup);
    next();
  } catch (e) {
    next(e);
  }
}

const micrographUpload = multer({
  preservePath: true,
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const rel = sanitizeRelativeUploadPath(decodeMulterOriginalName(file.originalname));
        const dir = path.join(req.micrographTempRoot, path.dirname(rel));
        fsSync.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      try {
        const rel = sanitizeRelativeUploadPath(decodeMulterOriginalName(file.originalname));
        cb(null, path.basename(rel));
      } catch (e) {
        cb(e);
      }
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024,
    files: 25000,
  },
  fileFilter: (req, file, cb) => {
    const name = decodeMulterOriginalName(file.originalname);
    if (/\.jpe?g$/i.test(name)) return cb(null, true);
    cb(null, false);
  },
});

const router = express.Router();

const micrographProgressJobs = new Map();

function getMicrographProgressJob(jobId) {
  if (!jobId || !/^[a-zA-Z0-9_-]{8,80}$/.test(String(jobId))) return null;
  const key = String(jobId);
  let job = micrographProgressJobs.get(key);
  if (!job) {
    job = { events: [], clients: new Set(), timer: null };
    job.timer = setTimeout(() => {
      micrographProgressJobs.delete(key);
    }, 30 * 60 * 1000);
    micrographProgressJobs.set(key, job);
  }
  return job;
}

function emitMicrographProgress(jobId, payload) {
  const job = getMicrographProgressJob(jobId);
  if (!job) return;
  const event = {
    at: Date.now(),
    ...payload,
  };
  job.events.push(event);
  if (job.events.length > 100) job.events.splice(0, job.events.length - 100);
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of job.clients) {
    try {
      res.write(data);
    } catch {
      /* ignore disconnected clients */
    }
  }
  if (event.phase === 'ready' || event.phase === 'error') {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => {
      micrographProgressJobs.delete(String(jobId));
    }, 5 * 60 * 1000);
  }
}

function decodeXmlText(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function ensureContentTypeDefault(contentTypesXml, ext, contentType) {
  const re = new RegExp(`<Default\\s+Extension="${ext}"\\b`, 'i');
  if (re.test(contentTypesXml)) return contentTypesXml;
  return contentTypesXml.replace(
    '</Types>',
    `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`
  );
}

function nextDocxRelId(relsXml) {
  let max = 0;
  for (const m of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
    max = Math.max(max, Number(m[1]) || 0);
  }
  return max + 1;
}

function nextDrawingObjectIdInZip(zip) {
  let max = 0;
  const xmlFiles = zip.file(/^word\/.*\.xml$/);
  for (const file of xmlFiles) {
    const xml = file.asText();
    for (const m of xml.matchAll(/<(?:wp:docPr|pic:cNvPr)\b[^>]*\bid="(\d+)"/g)) {
      max = Math.max(max, Number(m[1]) || 0);
    }
  }
  return max + 1;
}

function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fileIndexFromImagePath(imagePath) {
  const m = path.basename(imagePath).match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

function scaleImageForWord(imagePath, maxW, maxH) {
  let width = maxW;
  let height = Math.round(maxW * 0.75);
  try {
    const dim = imageSize(fsSync.readFileSync(imagePath));
    if (dim.width && dim.height) {
      const ratio = Math.min(maxW / dim.width, maxH / dim.height, 1);
      width = Math.max(1, Math.round(dim.width * ratio));
      height = Math.max(1, Math.round(dim.height * ratio));
    }
  } catch {
    /* use fallback */
  }
  return { width, height };
}

function imageDrawingXml({ relId, docPrId, name, widthPx, heightPx }) {
  const cx = Math.max(1, Math.round(widthPx * 9525));
  const cy = Math.max(1, Math.round(heightPx * 9525));
  const safeName = escapeXmlText(name || `image-${docPrId}`);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${safeName}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${safeName}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function imageCaptionXml(imagePath) {
  const caption = path.basename(imagePath, path.extname(imagePath));
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escapeXmlText(caption)}</w:t></w:r></w:p>`;
}

function tableCellXml(innerXml, widthTwips, options = {}) {
  const gridSpan = options.gridSpan ? `<w:gridSpan w:val="${options.gridSpan}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${widthTwips}" w:type="dxa"/>${gridSpan}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>${innerXml || '<w:p/>'}</w:tc>`;
}

function addImageToDocxZip(targetZip, imagePath, state, display) {
  const mediaName = `xw_${uuidv4().replace(/-/g, '')}.jpg`;
  const target = `media/${mediaName}`;
  targetZip.file(`word/${target}`, fsSync.readFileSync(imagePath), { binary: true });
  const relId = `rId${state.nextRelId++}`;
  state.relsXml = state.relsXml.replace(
    '</Relationships>',
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`
  );
  const docPrId = state.nextDocPrId++;
  const { width, height } = scaleImageForWord(imagePath, display.maxW, display.maxH);
  return imageDrawingXml({ relId, docPrId, name: path.basename(imagePath), widthPx: width, heightPx: height }) + imageCaptionXml(imagePath);
}

function buildImageTablesXml(targetZip, sections) {
  const targetRelsPath = 'word/_rels/document.xml.rels';
  let targetRelsXml = targetZip.file(targetRelsPath)?.asText();
  if (!targetRelsXml) {
    targetRelsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  }
  const state = {
    relsXml: targetRelsXml,
    nextRelId: nextDocxRelId(targetRelsXml),
    nextDocPrId: nextDrawingObjectIdInZip(targetZip),
  };
  const tableWidth = 9360;
  const colWidth = 4680;
  const wideDisplay = { maxW: 560, maxH: 420 };
  const gridDisplay = { maxW: 270, maxH: 260 };
  const blocks = [];

  for (const section of sections) {
    const sorted = [...section.imagePaths].sort((a, b) => {
      const ia = fileIndexFromImagePath(a);
      const ib = fileIndexFromImagePath(b);
      if (ia != null && ib != null && ia !== ib) return ia - ib;
      if (ia != null && ib == null) return -1;
      if (ia == null && ib != null) return 1;
      return path.basename(a).localeCompare(path.basename(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
    const wide = sorted.filter((p) => fileIndexFromImagePath(p) === 0);
    const grid = sorted.filter((p) => fileIndexFromImagePath(p) !== 0);
    const rows = [];

    for (const imagePath of wide) {
      const drawing = addImageToDocxZip(targetZip, imagePath, state, wideDisplay);
      rows.push(`<w:tr>${tableCellXml(drawing, tableWidth, { gridSpan: 2 })}</w:tr>`);
    }
    for (let i = 0; i < grid.length; i += 2) {
      const left = addImageToDocxZip(targetZip, grid[i], state, gridDisplay);
      const right = grid[i + 1] ? addImageToDocxZip(targetZip, grid[i + 1], state, gridDisplay) : null;
      rows.push(`<w:tr>${tableCellXml(left, colWidth)}${right ? tableCellXml(right, colWidth) : tableCellXml('<w:p/>', colWidth)}</w:tr>`);
    }
    if (rows.length === 0) continue;
    blocks.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXmlText(section.title)}</w:t></w:r></w:p>` +
        `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${colWidth}"/><w:gridCol w:w="${colWidth}"/></w:tblGrid>${rows.join('')}</w:tbl><w:p/>`
    );
  }

  let contentTypesXml = targetZip.file('[Content_Types].xml')?.asText();
  if (contentTypesXml) {
    contentTypesXml = ensureContentTypeDefault(contentTypesXml, 'jpg', 'image/jpeg');
    contentTypesXml = ensureContentTypeDefault(contentTypesXml, 'jpeg', 'image/jpeg');
    targetZip.file('[Content_Types].xml', contentTypesXml);
  }
  targetZip.file(targetRelsPath, state.relsXml);
  return blocks.join('');
}

function insertXmlAfterMarker(targetZip, insertXml, markerText) {
  if (!insertXml.trim()) return false;
  const targetDocPath = 'word/document.xml';
  const docXml = targetZip.file(targetDocPath)?.asText();
  if (!docXml) return false;
  const paragraphs = [...docXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let insertAt = -1;
  const marker = markerText || '6.试验结果';
  for (const m of paragraphs) {
    const paragraphText = decodeXmlText(m[0].replace(/<[^>]+>/g, ''));
    if (paragraphText.includes(marker) || paragraphText.includes('Test Results')) {
      insertAt = m.index + m[0].length;
      break;
    }
  }

  let nextDocXml;
  if (insertAt >= 0) {
    nextDocXml = docXml.slice(0, insertAt) + insertXml + docXml.slice(insertAt);
  } else {
    nextDocXml = docXml.replace(/(<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>)/i, `${insertXml}$1`);
  }
  targetZip.file(targetDocPath, nextDocXml);
  return true;
}

// 统一需要登录
router.use(requireAuth);

router.get('/micrograph-word-progress/:jobId', requireDepartmentIds([1]), (req, res) => {
  const job = getMicrographProgressJob(req.params.jobId);
  if (!job) return res.status(400).json({ error: '无效的进度任务 ID' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  job.clients.add(res);
  for (const event of job.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      /* ignore */
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.clients.delete(res);
  });
});

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
// 物化部门(2)和化学组(6)用户可用，排除业务员角色
router.post('/generate-wh-report', async (req, res) => {
  try {
    // 排除业务员角色
    if (req.user?.role === 'sales') {
      return res.status(403).json({ error: '业务员无权导出物化报告' });
    }
    if (!['2', '6'].includes(String(req.user?.department_id))) {
      return res.status(403).json({ error: '仅物化部门(2)及化学组(6)可导出物化报告' });
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
         ti.group_id,
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

    // 将阿拉伯数字序号转换为中文序号（1 -> 一，2 -> 二，... 11 -> 十一 等）
    const toChineseIndex = (n) => {
      const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      if (n <= 0) return '';
      if (n <= 10) return numerals[n - 1];
      if (n < 20) {
        return '十' + numerals[n - 11];
      }
      const tens = Math.floor(n / 10);
      const units = n % 10;
      let result = numerals[tens - 1] + '十';
      if (units > 0) {
        result += numerals[units - 1];
      }
      return result;
    };

    const sanitizedItems = tiRows.map((item, idx) => ({
      sample_no: `${order.order_id}-${idx + 1}`,
      index_cn: toChineseIndex(idx + 1),
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
    const totalCount = tiRows.reduce((sum, it) => sum + (it.quantity || 0), 0);

    // test location：按多选数组中第一个项目的 group_id 判断
    const firstSelectedTestItemId = test_item_ids[0];
    const firstSelectedItem = tiRows.find(
      (item) => String(item.test_item_id) === String(firstSelectedTestItemId)
    );
    const firstGroupId = Number(firstSelectedItem?.group_id);
    const testLocation = firstGroupId === 1
      ? '1号楼-B108'
      : firstGroupId === 2
        ? '1号楼-S103'
        : '';

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
      test_location: testLocation,
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

    const templatePath = path.join(__dirname, '..', 'templates', 'WH_template_2026.docx');
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

/**
 * 显微图片文件夹上传并生成 Word（multipart，字段名 files；仅 department_id=1）
 * 浏览器需使用「选择文件夹」上传以保留子目录结构；每节规则同 imageFolderWordExport 扫描逻辑。
 */
router.post(
  '/generate-micrograph-word-upload',
  requireDepartmentIds([1]),
  micrographTempDirMiddleware,
  micrographUpload.array('files', 25000),
  async (req, res) => {
    const tempRoot = req.micrographTempRoot;
    const progressJobId = req.body?.progressJobId ? String(req.body.progressJobId) : '';
    const reportProgress = (payload) => emitMicrographProgress(progressJobId, payload);
    try {
      if (!req.files?.length) {
        reportProgress({ phase: 'error', percent: null, detail: '未收到 jpg 图片文件' });
        return res.status(400).json({
          error:
            '未收到 jpg 图片文件。请使用 Chrome / Edge 选择整个文件夹上传，且最底层子文件夹内需包含 .jpg/.jpeg 图片。',
        });
      }

      const order_id = String(req.body?.order_id || '').trim();
      let test_item_ids = [];
      try {
        const rawIds = req.body?.test_item_ids;
        test_item_ids = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds || '[]');
      } catch {
        test_item_ids = [];
      }
      if (!order_id || !Array.isArray(test_item_ids) || test_item_ids.length === 0) {
        reportProgress({ phase: 'error', percent: null, detail: '缺少委托单号或检测项目' });
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

      const placeholders = test_item_ids.map(() => '?').join(',');
      const [tiRows] = await pool.query(
        `SELECT 
           ti.test_item_id,
           ti.order_id,
           ti.group_id,
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
      const uniqueOrders = new Set(tiRows.map((r) => r.order_id));
      if (uniqueOrders.size !== 1 || !uniqueOrders.has(order_id)) {
        return res.status(400).json({ error: '必须选择同一委托单号下的项目' });
      }
      const nonXW = tiRows.find((r) => String(r.department_id) !== '1');
      if (nonXW) return res.status(403).json({ error: '仅支持显微部门项目导出' });

      let managerFirst = '';
      let testerFirst = '';
      for (const item of tiRows) {
        if (!managerFirst && item.supervisor_account) managerFirst = String(item.supervisor_account).trim();
        if (!testerFirst && item.technician_account) testerFirst = String(item.technician_account).trim();
        if (managerFirst && testerFirst) break;
      }

      const toChineseIndex = (n) => {
        const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        if (n <= 0) return '';
        if (n <= 10) return numerals[n - 1];
        if (n < 20) return `十${numerals[n - 11] || ''}`;
        const tens = Math.floor(n / 10);
        const units = n % 10;
        return `${numerals[tens - 1] || ''}十${units > 0 ? numerals[units - 1] : ''}`;
      };

      const sanitizedItems = tiRows.map((item, idx) => ({
        sample_no: `${order.order_id}-${idx + 1}`,
        index_cn: toChineseIndex(idx + 1),
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
        report_title: item.report_title || '',
      }));
      const totalCount = tiRows.reduce((sum, it) => sum + (it.quantity || 0), 0);

      const firstSelectedTestItemId = test_item_ids[0];
      const firstSelectedItem = tiRows.find(
        (item) => String(item.test_item_id) === String(firstSelectedTestItemId)
      );
      const firstGroupId = Number(firstSelectedItem?.group_id);
      const testLocation = firstGroupId === 1 ? '1号楼-B108' : firstGroupId === 2 ? '1号楼-S103' : '';

      let leaderAccount = '';
      try {
        const [leaders] = await pool.query(
          `SELECT u.account FROM users u
           JOIN user_roles ur ON ur.user_id = u.user_id
           JOIN roles r ON r.role_id = ur.role_id
           WHERE r.role_code = 'leader' AND u.department_id = 1
           ORDER BY u.user_id ASC LIMIT 1`
        );
        leaderAccount = leaders[0]?.account || '';
      } catch {}

      const signaturesDir = path.join(__dirname, '..', 'signatures');
      const loadSignatureImagePath = async (account) => {
        if (!account) return null;
        const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.JPEG'];
        for (const ext of extensions) {
          const imagePath = path.join(signaturesDir, `${account}${ext}`);
          try {
            await fs.access(imagePath);
            return imagePath;
          } catch {}
        }
        return null;
      };

      const imageSizeMap = new Map();
      const signatureManagerPath = await loadSignatureImagePath(managerFirst);
      const signatureTesterPath = await loadSignatureImagePath(testerFirst);
      const signatureLeaderPath = await loadSignatureImagePath(leaderAccount);
      for (const p of [signatureManagerPath, signatureTesterPath, signatureLeaderPath]) {
        if (p) imageSizeMap.set(p, [100, 50]);
      }

      const templateData = {
        report_title: '显微实验报告',
        order_num: order.order_id,
        create_time: new Date(order.created_at).toISOString().slice(0, 10),
        customer_name: order.customer_name || '',
        customer_address: order.customer_address || '',
        test_items: sanitizedItems,
        total_count: totalCount,
        test_location: testLocation,
        signature_manager: signatureManagerPath,
        signature_tester: signatureTesterPath,
        signature_leader: signatureLeaderPath,
      };

      const templatePath = path.join(__dirname, '..', 'templates', 'XW_template_2026.docx');
      await fs.access(templatePath);
      const templateBuffer = await fs.readFile(templatePath);
      const zip = new PizZip(templateBuffer);
      const imageModule = new ImageModule({
        centered: false,
        getImage: (tagValue) => {
          if (!tagValue || typeof tagValue !== 'string') return null;
          try {
            return fsSync.readFileSync(tagValue);
          } catch {
            return null;
          }
        },
        getSize: (img, tagValue) => imageSizeMap.get(tagValue) || [100, 50],
      });
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [imageModule],
      });
      doc.setData(templateData);
      doc.render();

      const { sections: imageSections, total: imageTotal } = await prepareImageFolderSectionsForEmbedding(tempRoot, {
        compressTempDir: path.join(tempRoot, '.compressed'),
        onProgress: reportProgress,
      });
      reportProgress({ phase: 'pack', percent: 95, detail: `正在嵌入显微报告图片（${imageTotal} 张）` });
      const imageTablesXml = buildImageTablesXml(doc.getZip(), imageSections);
      insertXmlAfterMarker(doc.getZip(), imageTablesXml, '6.试验结果');

      reportProgress({ phase: 'pack', percent: 98, detail: '正在生成显微报告 Word' });
      const report = doc.getZip().generate({ type: 'nodebuffer' });
      const fileName = `${order.order_id}_显微报告.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('Content-Length', String(report.length));
      res.setHeader('Cache-Control', 'no-store');
      res.removeHeader('ETag');
      reportProgress({ phase: 'ready', percent: 100, detail: '显微报告已生成，正在开始下载' });
      res.end(report);
    } catch (error) {
      const code = error.code;
      reportProgress({ phase: 'error', percent: null, detail: error.message || '生成 Word 失败' });
      if (code === 'NO_SECTIONS') {
        return res.status(400).json({ error: error.message, code });
      }
      if (code === 'NOT_DIRECTORY') {
        return res.status(400).json({ error: error.message, code });
      }
      if (code === 'IMAGE_EXPORT_TOO_MANY') {
        return res.status(400).json({ error: error.message, code });
      }
      if (code === 'INVALID_UPLOAD_PATH') {
        return res.status(400).json({ error: error.message, code });
      }
      console.error('显微模板 Word 上传导出失败:', error);
      res.status(500).json({ error: '生成 Word 失败', details: error.message });
    }
  }
);

export default router;
