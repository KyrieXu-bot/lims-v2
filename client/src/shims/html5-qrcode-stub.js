/**
 * 仅用于「无 html5-qrcode 依赖」时的构建降级（如仅部署 Web 的服务器 CI）。
 * 设置环境变量 VITE_BUILD_SKIP_HTML5_QRCODE=1 后，Vite 会将 import 'html5-qrcode' 指向此文件。
 * 扫码页会打开失败并提示；完整 App 请使用正常 npm install 后构建，勿设该变量。
 */
const z = 0;
export const Html5QrcodeSupportedFormats = {
  QR_CODE: z,
  CODE_128: z,
  CODE_39: z,
  CODE_93: z,
  EAN_13: z,
  EAN_8: z,
  UPC_A: z,
  UPC_E: z,
  CODABAR: z,
  ITF: z,
  DATA_MATRIX: z,
  PDF_417: z,
};

export class Html5Qrcode {
  constructor() {
    this._state = 0;
  }

  getState() {
    return this._state;
  }

  async start() {
    throw new Error('HTML5_QRCODE_STUB');
  }

  async stop() {
    this._state = 0;
  }

  clear() {}
}
