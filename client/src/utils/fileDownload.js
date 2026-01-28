/**
 * 获取API基础URL（与api.js中的逻辑一致）
 */
function getApiBase() {
  // 1. 优先使用环境变量
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. 检测是否是原生环境（Capacitor）
  const isNative = typeof window !== 'undefined' 
    && window.Capacitor 
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();
  
  if (isNative) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 3. 兜底检测：如果host是localhost但存在Capacitor，说明是Capacitor环境但检测失败
  if (typeof window !== 'undefined' && window.location && window.location.host === 'localhost' && window.Capacitor) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 4. 开发环境
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  // 5. 生产环境Web：使用相对路径（浏览器会自动使用当前页面的协议和主机）
  // 注意：只有在非Capacitor环境中才使用相对路径
  if (typeof window !== 'undefined' && window.location && !window.Capacitor) {
    // 使用相对路径，浏览器会自动使用当前页面的协议和主机
    return '';
  }
  
  // 6. 兜底
  return 'http://192.168.9.46:3004';
}

/**
 * 获取 Capacitor 相关模块（仅在原生环境中可用）
 */
const getCapacitorModules = () => {
  if (typeof window !== 'undefined' && window.Capacitor) {
    return {
      Capacitor: window.Capacitor,
      Filesystem: window.Capacitor?.Plugins?.Filesystem,
      Directory: window.Capacitor?.Plugins?.Filesystem?.Directory
    };
  }
  return null;
};

/**
 * 下载文件（支持 Web 和原生平台）
 * @param {string|number} fileId - 文件ID
 * @param {string} filename - 文件名（可选）
 */
export const downloadFile = async (fileId, filename = null) => {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  if (!user || !user.token) {
    throw new Error('未登录');
  }

  try {
    // 获取API基础URL
    const apiBase = getApiBase();
    
    // 获取文件信息
    const fileInfoResponse = await fetch(`${apiBase}/api/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });

    if (!fileInfoResponse.ok) {
      throw new Error('获取文件信息失败');
    }

    const fileInfo = await fileInfoResponse.json();

    // 下载文件
    const downloadResponse = await fetch(`${apiBase}/api/files/${fileId}/download`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });

    if (!downloadResponse.ok) {
      throw new Error('下载文件失败');
    }

    const blob = await downloadResponse.blob();
    const actualFilename = filename || fileInfo.filename || `file_${fileId}`;

    // 如果是原生平台，使用 Capacitor Filesystem API
    const capModules = getCapacitorModules();
    if (capModules && capModules.Capacitor.isNativePlatform()) {
      // 将 blob 转换为 base64
      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 保存到设备
      const result = await capModules.Filesystem.writeFile({
        path: actualFilename,
        data: base64Data,
        directory: capModules.Directory.Documents,
        recursive: true
      });

      // 在原生平台上，可以打开文件管理器或显示保存成功提示
      alert(`文件已保存到: ${result.uri}`);
      return result.uri;
    } else {
      // Web 平台：使用传统的下载方式
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = actualFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return url;
    }
  } catch (error) {
    console.error('下载文件失败:', error);
    throw error;
  }
};

/**
 * 打开文件（在浏览器中查看）
 * @param {string|number} fileId - 文件ID
 */
export const openFile = async (fileId) => {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  if (!user || !user.token) {
    throw new Error('未登录');
  }

  // 获取API基础URL
  const apiBase = getApiBase();
  const url = `${apiBase}/api/files/${fileId}/download`;
  
  // Web 平台：在新窗口打开
  window.open(url, '_blank');
};







