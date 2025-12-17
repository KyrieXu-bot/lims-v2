import { Capacitor } from '@capacitor/core';

/**
 * 检测是否是移动设备
 * @returns {boolean} 是否是移动设备
 */
export const isMobile = () => {
  // 优先使用 Capacitor 检测是否是原生平台
  // 在原生环境中，这应该始终返回 true
  const isNative = Capacitor.isNativePlatform();
  
  // 如果是原生平台，直接返回 true（原生应用肯定是移动端）
  if (isNative) {
    return true;
  }
  
  // 在 Web 环境中，使用其他方法检测
  // 检测用户代理
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  // 检测屏幕宽度（移动设备通常小于 768px）
  const isSmallScreen = window.innerWidth < 768;
  
  // 如果是移动设备用户代理或屏幕较小，认为是移动端
  return isMobileUserAgent || isSmallScreen;
};

/**
 * 检测是否是 Capacitor 原生应用
 * @returns {boolean}
 */
export const isCapacitorNative = () => {
  return Capacitor.isNativePlatform();
};







