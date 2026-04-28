/**
 * Web/CI 占位：与 VITE_BUILD_SKIP_HTML5_QRCODE 联用。
 * 原生请使用 node_modules 中的 @capacitor/filesystem。
 */

/** 与插件 definitions 中 Directory 取值一致（供 Directory.Cache 等比较）。 */
export const Directory = {
  Documents: 'DOCUMENTS',
  Data: 'DATA',
  Library: 'LIBRARY',
  Cache: 'CACHE',
  External: 'EXTERNAL',
  ExternalStorage: 'EXTERNAL_STORAGE',
  ExternalCache: 'EXTERNAL_CACHE',
  LibraryNoCloud: 'LIBRARY_NO_CLOUD',
  Temporary: 'TEMPORARY',
};

const noopErr = async () => {
  throw new Error('此构建未包含 Filesystem 插件');
};

export const Filesystem = {
  readFile: noopErr,
  writeFile: noopErr,
};
