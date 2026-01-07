/**
 * 检测是否是移动设备
 * @returns {boolean} 是否是移动设备
 */
export const isMobile = () => {
  // 检测用户代理
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  // 检测屏幕宽度（移动设备通常小于 768px）
  const isSmallScreen = window.innerWidth < 768;
  
  // 检测是否是原生环境（通过检查 window.Capacitor）
  const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
  
  // 如果是原生平台，直接返回 true（原生应用肯定是移动端）
  if (isNative) {
    return true;
  }
  
  // 如果是移动设备用户代理或屏幕较小，认为是移动端
  return isMobileUserAgent || isSmallScreen;
};

/**
 * 检测是否是 Capacitor 原生应用
 * @returns {boolean}
 */
export const isCapacitorNative = () => {
  // 通过检查全局对象来判断是否是原生环境
  return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
};







