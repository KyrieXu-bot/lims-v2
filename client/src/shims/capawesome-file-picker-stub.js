/**
 * Web/CI 占位：与 VITE_BUILD_SKIP_HTML5_QRCODE 联用。
 * 原生请使用 node_modules 中的 @capawesome/capacitor-file-picker。
 */

export const FilePicker = {
  async pickFiles() {
    throw new Error('此构建未包含 FilePicker 插件');
  },

  async pickFile() {
    throw new Error('此构建未包含 FilePicker 插件');
  },
};
