import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const localSignaturesDirectory = path.resolve(
  serviceDirectory,
  '..',
  '..',
  'assets',
  'commissioner-signatures'
);
const siblingOrderingSignaturesDirectory = path.resolve(
  serviceDirectory,
  '..',
  '..',
  '..',
  '..',
  'lab-ordering-v2',
  'server',
  'assets',
  'commissioner-signatures'
);

function configuredSignaturesDirectory() {
  const configured = String(process.env.COMMISSIONER_SIGNATURES_DIR || '').trim();
  if (!configured) return null;
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

// 开单系统和 LIMS 同机部署时直接共用原签名目录；其他部署可通过环境变量指定共享目录。
export const commissionerSignaturesDirectory = configuredSignaturesDirectory()
  || (existsSync(siblingOrderingSignaturesDirectory)
    ? siblingOrderingSignaturesDirectory
    : localSignaturesDirectory);

export function normalizeCommissionerId(value) {
  const normalized = String(value || '').trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : null;
}

export function commissionerSignaturePath(commissionerId) {
  const normalized = normalizeCommissionerId(commissionerId);
  return normalized ? path.join(commissionerSignaturesDirectory, `${normalized}.png`) : null;
}

export function isPngBuffer(buffer) {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.isBuffer(buffer)
    && buffer.length >= 24
    && buffer.subarray(0, pngHeader.length).equals(pngHeader);
}

export async function commissionerSignatureExists(commissionerId) {
  const signaturePath = commissionerSignaturePath(commissionerId);
  if (!signaturePath) return false;
  try {
    await fs.access(signaturePath);
    return true;
  } catch {
    return false;
  }
}

