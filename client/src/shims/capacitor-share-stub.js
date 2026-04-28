/**
 * Web/CI 占位：与 VITE_BUILD_SKIP_HTML5_QRCODE 联用。
 * 原生应用请使用 node_modules 中的 @capacitor/share。
 */

export const Share = {
  async canShare() {
    return { value: false };
  },

  async share() {
    throw new Error('此构建未包含 Share 插件');
  },
};
