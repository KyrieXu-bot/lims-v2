import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
    // 获取文件信息
    const fileInfoResponse = await fetch(`/api/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });

    if (!fileInfoResponse.ok) {
      throw new Error('获取文件信息失败');
    }

    const fileInfo = await fileInfoResponse.json();

    // 下载文件
    const downloadResponse = await fetch(`/api/files/${fileId}/download`, {
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
    if (Capacitor.isNativePlatform()) {
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
      const result = await Filesystem.writeFile({
        path: actualFilename,
        data: base64Data,
        directory: Directory.Documents,
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

  const url = `/api/files/${fileId}/download`;
  
  // Web 平台：在新窗口打开
  window.open(url, '_blank');
};





