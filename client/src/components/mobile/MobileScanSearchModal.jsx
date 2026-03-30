import React, { useEffect, useRef, useCallback } from 'react';
import './MobileScanSearchModal.css';

const REGION_ID = 'mobile-h5qr-camera-region';

/**
 * 全屏摄像头扫码（二维码 + 常见一维条码），识别成功后交给上层填入搜索并查询。
 */
const MobileScanSearchModal = ({ open, onClose, onDecoded }) => {
  const scannerRef = useRef(null);
  const finishedRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      const state = instance.getState();
      // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
      if (state === 2 || state === 3) {
        await instance.stop();
      }
    } catch (_) {
      // 已停止或异常时忽略
    }
    try {
      instance.clear();
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!open) {
      finishedRef.current = false;
      return;
    }

    finishedRef.current = false;
    let cancelled = false;

    const run = async () => {
      const el = document.getElementById(REGION_ID);
      if (!el) return;

      const isCapNative =
        typeof window !== 'undefined' &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform();

      // 原生壳内：先走系统相机授权（需在 AndroidManifest / iOS Info.plist 声明权限）
      if (isCapNative) {
        try {
          const { Camera } = await import('@capacitor/camera');
          const status = await Camera.requestPermissions({ permissions: ['camera'] });
          const cam = status.camera;
          if (cam !== 'granted' && cam !== 'limited') {
            if (!cancelled) {
              alert(
                cam === 'denied'
                  ? '需要相机权限才能扫码。请在系统设置 → 应用 → 本应用 → 权限中开启「相机」。'
                  : '需要相机权限才能扫码。'
              );
              onClose();
            }
            return;
          }
        } catch (e) {
          console.error('请求相机权限失败:', e);
          if (!cancelled) {
            alert('无法请求相机权限，请稍后重试');
            onClose();
          }
          return;
        }
      }

      const { Html5Qrcode, Html5QrcodeSupportedFormats: Fmt } = await import('html5-qrcode');

      const formatsToSupport = [
        Fmt.QR_CODE,
        Fmt.CODE_128,
        Fmt.CODE_39,
        Fmt.CODE_93,
        Fmt.EAN_13,
        Fmt.EAN_8,
        Fmt.UPC_A,
        Fmt.UPC_E,
        Fmt.CODABAR,
        Fmt.ITF,
        Fmt.DATA_MATRIX,
        Fmt.PDF_417,
      ];

      const html5QrCode = new Html5Qrcode(REGION_ID, {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const onSuccess = async (decodedText) => {
        if (cancelled || finishedRef.current) return;
        finishedRef.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(80);
          } catch (_) {}
        }
        await stopScanner();
        const raw = (decodedText || '').trim();
        if (raw) {
          onDecodedRef.current(raw);
        }
      };

      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1,
          },
          onSuccess,
          () => {}
        );
      } catch (err) {
        console.error('打开摄像头失败:', err);
        if (!cancelled) {
          alert('无法打开摄像头，请检查权限或稍后重试');
          onClose();
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, stopScanner, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-scan-modal" role="dialog" aria-modal="true" aria-label="扫码搜索">
      <div className="mobile-scan-modal-header">
        <span className="mobile-scan-modal-title">扫一扫</span>
        <button type="button" className="mobile-scan-modal-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>
      <p className="mobile-scan-modal-hint">将二维码或条形码对准框内，将自动识别并搜索</p>
      <div id={REGION_ID} className="mobile-scan-modal-viewport" />
    </div>
  );
};

export default MobileScanSearchModal;
