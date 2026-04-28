/**
 * 占位实现：供设置 VITE_BUILD_SKIP_HTML5_QRCODE（或等价）时服务端/CI 离线打包。
 * 真机 App 必须使用 node_modules 中的 @capacitor/camera（勿对此构建开关打 release APK）。
 */
export const Camera = {
  async requestPermissions() {
    return { camera: 'granted' };
  },

  async getPhoto() {
    throw new Error('此构建未包含原生相机插件');
  },
};
