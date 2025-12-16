import { Capacitor } from '@capacitor/core';

/**
 * 检测是否是移动设备
 * @returns {boolean} 是否是移动设备
 */
export const isMobile = () => {
  // 使用 Capacitor 检测是否是原生平台
  const isNative = Capacitor.isNativePlatform();
  
  // 检测用户代理
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  // 检测屏幕宽度（移动设备通常小于 768px）
  const isSmallScreen = window.innerWidth < 768;
  
  // 如果是原生平台，或者用户代理是移动设备，或者屏幕较小，都认为是移动端
  return isNative || isMobileUserAgent || isSmallScreen;
};

/**
 * 检测是否是 Capacitor 原生应用
 * @returns {boolean}
 */
export const isCapacitorNative = () => {
  return Capacitor.isNativePlatform();
};

