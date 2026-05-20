/**
 * 将图片文件夹树扫描后导出为 Word：叶子图片目录为一组，标题为上传目录中的完整相对路径。
 * 可由本机路径扫描，或由前端上传文件夹到服务器临时目录后扫描。
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import imageSize from 'image-size';
import sharp from 'sharp';
import { pipeline } from 'stream/promises';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  VerticalAlignTable,
  BorderStyle,
} from 'docx';

const JPG_IMAGE_RE = /\.jpe?g$/i;
const NUMBERED_IMAGE_RE = /^(\d+)\.jpe?g$/i;

/** Multer 原始文件名 latin1 → utf8（与 upload 路由一致） */
export function decodeMulterOriginalName(originalName) {
  try {
    return Buffer.from(originalName, 'latin1').toString('utf8');
  } catch {
    return originalName;
  }
}

/**
 * 校验相对路径（禁止绝对路径、..）；返回使用 path.sep 的相对路径
 */
export function sanitizeRelativeUploadPath(raw) {
  if (typeof raw !== 'string') {
    const err = new Error('无效路径');
    err.code = 'INVALID_UPLOAD_PATH';
    throw err;
  }
  const s = raw.replace(/\\/g, '/').trim();
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s)) {
    const err = new Error('禁止使用绝对路径');
    err.code = 'INVALID_UPLOAD_PATH';
    throw err;
  }
  const parts = s.split('/').filter((p) => p !== '' && p !== '.');
  for (const p of parts) {
    if (p === '..') {
      const err = new Error('路径中禁止使用 ..');
      err.code = 'INVALID_UPLOAD_PATH';
      throw err;
    }
  }
  return parts.join(path.sep);
}

export function isNumberedImageFile(name) {
  return NUMBERED_IMAGE_RE.test(name);
}

export function isJpgImageFile(name) {
  return JPG_IMAGE_RE.test(name);
}

function fileIndexFromName(name) {
  const m = name.match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

/** 文件夹名 / 路径段自然排序：1 < 2 < 10；中文按 zh-CN */
function naturalCompareSegment(a, b) {
  return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

/** 整条相对路径排序，使文档章节顺序为：子目录1 → 1/1、1/2 → 子目录2 → 2/1、2/2 … */
function compareRelPath(relA, relB) {
  const pa = relA ? relA.split(path.sep).filter(Boolean) : [];
  const pb = relB ? relB.split(path.sep).filter(Boolean) : [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (i >= pa.length) return -1;
    if (i >= pb.length) return 1;
    const c = naturalCompareSegment(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return 0;
}

function compareImageFileName(a, b) {
  const ia = fileIndexFromName(a);
  const ib = fileIndexFromName(b);
  if (ia != null && ib != null && ia !== ib) return ia - ib;
  if (ia != null && ib == null) return -1;
  if (ia == null && ib != null) return 1;
  return naturalCompareSegment(a, b);
}

/**
 * 深度优先扫描：每一层子文件夹按名称自然序依次进入。
 * 凡叶子目录直接包含 jpg/jpeg 图片即为一节；标题为上传目录中的完整相对路径。
 */
export async function scanImageFolderSections(rootAbsNorm) {
  const stat = await fsPromises.stat(rootAbsNorm);
  if (!stat.isDirectory()) {
    const err = new Error('根路径必须是文件夹');
    err.code = 'NOT_DIRECTORY';
    throw err;
  }

  const sections = [];

  async function walk(dirAbs, relFromRoot) {
    const entries = await fsPromises.readdir(dirAbs, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const jpgFiles = files.filter(isJpgImageFile);
    const subdirs = entries.filter((e) => e.isDirectory());

    if (jpgFiles.length > 0 && subdirs.length === 0) {
      const sorted = [...jpgFiles].sort(compareImageFileName);
      const imagePaths = sorted.map((f) => path.join(dirAbs, f));
      const segments = relFromRoot.split(path.sep).filter(Boolean);
      const title = segments.length ? segments.join('/') : path.basename(rootAbsNorm);
      sections.push({
        title,
        rel: relFromRoot,
        imagePaths,
        imageCount: imagePaths.length,
      });
    }

    subdirs.sort((x, y) => naturalCompareSegment(x.name, y.name));

    for (const e of subdirs) {
      const nextRel = relFromRoot ? path.join(relFromRoot, e.name) : e.name;
      await walk(path.join(dirAbs, e.name), nextRel);
    }
  }

  await walk(rootAbsNorm, '');
  sections.sort((a, b) => compareRelPath(a.rel, b.rel));
  return sections;
}

function extToDocxImageType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return 'jpg';
}

function scaleToMaxBox(nw, nh, maxW, maxH) {
  if (!nw || !nh) return { width: maxW, height: maxH };
  const rw = maxW / nw;
  const rh = maxH / nh;
  const r = Math.min(rw, rh, 1);
  return {
    width: Math.max(1, Math.round(nw * r)),
    height: Math.max(1, Math.round(nh * r)),
  };
}

const cellBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
};

function paragraphCellimage(imagePath, maxW, maxH) {
  let buf;
  try {
    buf = fs.readFileSync(imagePath);
  } catch {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[无法读取] ${path.basename(imagePath)}` })],
    });
  }
  let nw = 800;
  let nh = 600;
  try {
    const dim = imageSize(buf);
    if (dim.width && dim.height) {
      nw = dim.width;
      nh = dim.height;
    }
  } catch {
    /* use default */
  }
  const { width, height } = scaleToMaxBox(nw, nh, maxW, maxH);
  const type = extToDocxImageType(imagePath);
  try {
    const imageRun = new ImageRun({
      type,
      data: buf,
      transformation: { width, height },
    });
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [imageRun],
    });
  } catch {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[插入图片失败] ${path.basename(imagePath)}` })],
    });
  }
}

function splitWideAndGrid(imagePaths) {
  const wide = [];
  const grid = [];
  for (const p of imagePaths) {
    const idx = fileIndexFromName(path.basename(p));
    if (idx === 0) wide.push(p);
    else grid.push(p);
  }
  return { wide, grid };
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function compressImageToJpeg(inputPath, outputPath, maxW, maxH, quality) {
  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxW,
      height: maxH,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality,
      mozjpeg: true,
      progressive: true,
    })
    .toFile(outputPath);
}

async function prepareCompressedSections(sections, tempDir, options = {}) {
  if (!tempDir) return sections;

  const quality = clampInt(process.env.IMAGE_EXPORT_JPEG_QUALITY, 82, 40, 95);
  const wideCompressMaxW = clampInt(process.env.IMAGE_EXPORT_COMPRESS_WIDE_MAX_W, 1800, 600, 4000);
  const wideCompressMaxH = clampInt(process.env.IMAGE_EXPORT_COMPRESS_WIDE_MAX_H, 1400, 600, 4000);
  const gridCompressMaxW = clampInt(process.env.IMAGE_EXPORT_COMPRESS_GRID_MAX_W, 1200, 400, 3000);
  const gridCompressMaxH = clampInt(process.env.IMAGE_EXPORT_COMPRESS_GRID_MAX_H, 1000, 400, 3000);
  const concurrency = clampInt(process.env.IMAGE_EXPORT_COMPRESS_CONCURRENCY, 3, 1, 8);

  const nextSections = sections.map((s) => ({ ...s, imagePaths: [...s.imagePaths] }));
  const tasks = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    for (let imageIndex = 0; imageIndex < sections[sectionIndex].imagePaths.length; imageIndex++) {
      const inputPath = sections[sectionIndex].imagePaths[imageIndex];
      const idx = fileIndexFromName(path.basename(inputPath));
      tasks.push({
        sectionIndex,
        imageIndex,
        inputPath,
        isWide: idx === 0,
        outputPath: path.join(tempDir, String(sectionIndex), path.basename(inputPath)),
      });
    }
  }

  const totalTasks = tasks.length;
  let done = 0;
  options.onProgress?.({
    phase: 'compress',
    percent: 8,
    detail: `正在压缩图片 0/${totalTasks}`,
  });

  async function worker() {
    while (tasks.length > 0) {
      const task = tasks.shift();
      const maxW = task.isWide ? wideCompressMaxW : gridCompressMaxW;
      const maxH = task.isWide ? wideCompressMaxH : gridCompressMaxH;
      try {
        await compressImageToJpeg(task.inputPath, task.outputPath, maxW, maxH, quality);
        nextSections[task.sectionIndex].imagePaths[task.imageIndex] = task.outputPath;
      } catch {
        nextSections[task.sectionIndex].imagePaths[task.imageIndex] = task.inputPath;
      }
      done += 1;
      options.onProgress?.({
        phase: 'compress',
        percent: 8 + Math.round((done / Math.max(1, totalTasks)) * 82),
        detail: `正在压缩图片 ${done}/${totalTasks}`,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return nextSections;
}

function createImageFolderWordDocument(sections, documentTitle, layout, options = {}) {
  const includeTitle = options.includeTitle !== false;
  const { wideMaxW, wideMaxH, gridMaxW, gridMaxH } = layout;
  const children = [];

  if (includeTitle) {
    children.push(
      new Paragraph({
        text: documentTitle,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' })
    );
  }

  for (const sec of sections) {
    children.push(
      new Paragraph({
        text: sec.title,
        heading: HeadingLevel.HEADING_1,
      })
    );

    const { wide, grid } = splitWideAndGrid(sec.imagePaths);
    const tableRows = [];

    for (const wpath of wide) {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorder,
              verticalAlign: VerticalAlignTable.CENTER,
              columnSpan: 2,
              children: [paragraphCellimage(wpath, wideMaxW, wideMaxH)],
            }),
          ],
        })
      );
    }

    for (let i = 0; i < grid.length; i += 2) {
      const left = grid[i];
      const right = grid[i + 1];
      const cells = [
        new TableCell({
          borders: cellBorder,
          verticalAlign: VerticalAlignTable.CENTER,
          children: [paragraphCellimage(left, gridMaxW, gridMaxH)],
        }),
      ];
      if (right) {
        cells.push(
          new TableCell({
            borders: cellBorder,
            verticalAlign: VerticalAlignTable.CENTER,
            children: [paragraphCellimage(right, gridMaxW, gridMaxH)],
          })
        );
      } else {
        cells.push(
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ text: '' })],
          })
        );
      }
      tableRows.push(new TableRow({ children: cells }));
    }

    if (tableRows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: '（无图片）' })] }));
    } else {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows,
        })
      );
    }

    children.push(new Paragraph({ text: '' }));
  }

  return new Document({
    sections: [{ children }],
  });
}

function getImageExportLayout() {
  return {
    wideMaxW: parseInt(process.env.IMAGE_EXPORT_WIDE_MAX_W || '920', 10) || 920,
    wideMaxH: parseInt(process.env.IMAGE_EXPORT_WIDE_MAX_H || '620', 10) || 620,
    gridMaxW: parseInt(process.env.IMAGE_EXPORT_GRID_MAX_W || '460', 10) || 460,
    gridMaxH: parseInt(process.env.IMAGE_EXPORT_GRID_MAX_H || '400', 10) || 400,
  };
}

function assertImageLimit(sections) {
  const maxImages = Math.max(1, parseInt(process.env.IMAGE_EXPORT_MAX_IMAGES || '8000', 10) || 8000);
  let total = 0;
  for (const s of sections) {
    total += s.imagePaths.length;
    if (total > maxImages) {
      const err = new Error(`图片总数超过限制 ${maxImages}（可通过 IMAGE_EXPORT_MAX_IMAGES 调整）`);
      err.code = 'IMAGE_EXPORT_TOO_MANY';
      throw err;
    }
  }
  return total;
}

/**
 * @param {Array<{ title: string, imagePaths: string[] }>} sections
 * @param {string} documentTitle
 * @returns {Promise<Buffer>}
 */
export async function buildImageFolderWordBuffer(sections, documentTitle = '测试图片汇总') {
  assertImageLimit(sections);
  const doc = createImageFolderWordDocument(sections, documentTitle, getImageExportLayout());
  return Packer.toBuffer(doc);
}

export async function buildImageFolderWordFile(sections, documentTitle, outputPath, options = {}) {
  const total = assertImageLimit(sections);
  const preparedSections = await prepareCompressedSections(sections, options.compressTempDir, options);
  options.onProgress?.({
    phase: 'pack',
    percent: 95,
    detail: `正在打包 Word（${total} 张图片）`,
  });
  const doc = createImageFolderWordDocument(preparedSections, documentTitle, getImageExportLayout());
  const stream = await Packer.toStream(doc);
  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(stream, fs.createWriteStream(outputPath));
  options.onProgress?.({
    phase: 'ready',
    percent: 100,
    detail: 'Word 已生成，正在开始下载',
  });
}

export async function buildImageFolderContentWordBuffer(rootAbsNorm, options = {}) {
  options.onProgress?.({ phase: 'scan', percent: 2, detail: '正在扫描图片文件夹' });
  const sections = await scanImageFolderSections(rootAbsNorm);
  if (sections.length === 0) {
    const err = new Error('未找到符合规则的图片文件夹（需在最底层子文件夹中包含 .jpg/.jpeg 文件）');
    err.code = 'NO_SECTIONS';
    throw err;
  }
  const total = assertImageLimit(sections);
  options.onProgress?.({
    phase: 'scan',
    percent: 8,
    detail: `已找到 ${sections.length} 个分组、${total} 张图片`,
  });
  const onlyMeta = sections.map((s) => ({ title: s.title, imagePaths: s.imagePaths }));
  const preparedSections = await prepareCompressedSections(onlyMeta, options.compressTempDir, options);
  options.onProgress?.({
    phase: 'pack',
    percent: 95,
    detail: `正在嵌入 Word 模板（${total} 张图片）`,
  });
  const doc = createImageFolderWordDocument(preparedSections, '', getImageExportLayout(), { includeTitle: false });
  const buffer = await Packer.toBuffer(doc);
  options.onProgress?.({
    phase: 'ready',
    percent: 100,
    detail: '图片内容已生成',
  });
  return buffer;
}

export async function prepareImageFolderSectionsForEmbedding(rootAbsNorm, options = {}) {
  options.onProgress?.({ phase: 'scan', percent: 2, detail: '正在扫描图片文件夹' });
  const sections = await scanImageFolderSections(rootAbsNorm);
  if (sections.length === 0) {
    const err = new Error('未找到符合规则的图片文件夹（需在最底层子文件夹中包含 .jpg/.jpeg 文件）');
    err.code = 'NO_SECTIONS';
    throw err;
  }
  const total = assertImageLimit(sections);
  options.onProgress?.({
    phase: 'scan',
    percent: 8,
    detail: `已找到 ${sections.length} 个分组、${total} 张图片`,
  });
  const onlyMeta = sections.map((s) => ({ title: s.title, imagePaths: s.imagePaths }));
  const preparedSections = await prepareCompressedSections(onlyMeta, options.compressTempDir, options);
  return { sections: preparedSections, total };
}

export async function exportImageFolderToWordBuffer(rootAbsNorm, documentTitle) {
  const sections = await scanImageFolderSections(rootAbsNorm);
  if (sections.length === 0) {
    const err = new Error('未找到符合规则的图片文件夹（需在最底层子文件夹中包含 .jpg/.jpeg 文件）');
    err.code = 'NO_SECTIONS';
    throw err;
  }
  const onlyMeta = sections.map((s) => ({ title: s.title, imagePaths: s.imagePaths }));
  return buildImageFolderWordBuffer(onlyMeta, documentTitle);
}

export async function exportImageFolderToWordFile(rootAbsNorm, documentTitle, outputPath, options = {}) {
  options.onProgress?.({ phase: 'scan', percent: 2, detail: '正在扫描图片文件夹' });
  const sections = await scanImageFolderSections(rootAbsNorm);
  if (sections.length === 0) {
    const err = new Error('未找到符合规则的图片文件夹（需在最底层子文件夹中包含 .jpg/.jpeg 文件）');
    err.code = 'NO_SECTIONS';
    throw err;
  }
  const total = sections.reduce((sum, s) => sum + s.imagePaths.length, 0);
  options.onProgress?.({
    phase: 'scan',
    percent: 8,
    detail: `已找到 ${sections.length} 个分组、${total} 张图片`,
  });
  const onlyMeta = sections.map((s) => ({ title: s.title, imagePaths: s.imagePaths }));
  await buildImageFolderWordFile(onlyMeta, documentTitle, outputPath, options);
}
