import React, { useState, useEffect, useRef } from 'react';
import './MobileFileUpload.css';

// 获取 Capacitor 相关模块（仅在原生环境中可用）
const getCapacitorModules = () => {
  if (typeof window !== 'undefined' && window.Capacitor) {
    return {
      Capacitor: window.Capacitor,
      Share: window.Capacitor?.Plugins?.Share,
      Filesystem: window.Capacitor?.Plugins?.Filesystem,
      Directory: window.Capacitor?.Plugins?.Filesystem?.Directory,
      FilePicker: window.Capacitor?.Plugins?.FilePicker
    };
  }
  return null;
};

// 检查是否是原生环境
const isNativePlatform = () => {
  const capModules = getCapacitorModules();
  return capModules && capModules.Capacitor && capModules.Capacitor.isNativePlatform();
};

// 获取API基础URL（与api.js保持一致）
function getApiBase() {
  // 1. 优先使用环境变量（支持 VITE_API_BASE 和 VITE_API_BASE_URL）
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. 检测是否是原生环境
  const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
  if (isNative) {
    return 'https://jicuijiance.mat-jitri.cn';
  }
  
  // 3. Web 环境
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  // 4. 生产环境 Web：使用相对路径
  if (typeof window !== 'undefined' && window.location) {
    return '';
  }
  
  // 5. 兜底
  return 'http://192.168.9.46:3004';
}

const API_BASE = getApiBase();

const MobileFileUpload = ({ 
  testItemId, 
  orderId, 
  userRole,
  businessConfirmed,
  currentAssignee,
  onFileUploaded,
  enableUpload = false, // 手机端默认不允许上传，仅保留下载
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('order_attachment');
  const [uploadProgress, setUploadProgress] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});
  const downloadXhrRef = useRef({});

  const categories = [
    { value: 'order_attachment', label: '委托单附件' },
    { value: 'raw_data', label: '实验原始数据' },
    { value: 'experiment_report', label: '实验报告' }
  ];

  const canUpload = enableUpload && ['admin', 'leader', 'supervisor', 'employee', 'sales'].includes(userRole);

  useEffect(() => {
    if (testItemId) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [testItemId, selectedCategory]);

  const loadFiles = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        throw new Error('用户未登录');
      }
      
      if (!testItemId) {
        setFiles([]);
        return;
      }
      
      const params = new URLSearchParams({
        category: selectedCategory,
        test_item_id: testItemId.toString(),
        pageSize: 50
      });
      
      const response = await fetch(`${API_BASE}/api/files?${params}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const fileList = Array.isArray(data.data) ? data.data : [];
        setFiles(fileList);
      } else {
        const errorData = await response.json().catch(() => ({ error: '未知错误' }));
        console.error('加载文件失败:', errorData.error || `HTTP ${response.status}`);
        setFiles([]);
      }
    } catch (error) {
      console.error('加载文件失败:', error);
      setFiles([]);
    }
  };

  // 处理Web环境的文件选择（input元素）
  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    await handleFilesUpload(selectedFiles);
    
    // 清空input值，以便可以重复选择相同文件
    e.target.value = '';
  };

  // 处理原生环境的文件选择（File Picker）
  const handleNativeFileSelect = async () => {
    const capModules = getCapacitorModules();
    if (!capModules || !capModules.FilePicker) {
      alert('文件选择功能不可用，请确保已安装文件选择插件（如 @capawesome/capacitor-file-picker）');
      return;
    }

    try {
      let result;
      const FilePicker = capModules.FilePicker;

      // 尝试不同的API调用方式，以兼容不同的插件
      // 方式1: pickFiles (支持多选，如 @capawesome/capacitor-file-picker)
      if (FilePicker.pickFiles) {
        // @capawesome/capacitor-file-picker 的 API
        result = await FilePicker.pickFiles({
          multiple: true,
          // types 参数可选，不传则支持所有类型
          // types: ['*/*'] // 如果需要限制类型，可以取消注释并设置
        });
      }
      // 方式2: pickFile (单选，如某些旧版本插件)
      else if (FilePicker.pickFile) {
        // 如果只支持单选，先选一个文件
        result = await FilePicker.pickFile({
          // 不限制文件类型
        });
        // 转换为多文件格式
        if (result && result.file) {
          result = { files: [result.file] };
        } else if (result) {
          result = { files: [result] };
        }
      }
      // 方式3: 其他可能的API
      else {
        throw new Error('文件选择插件API不兼容，请检查插件版本');
      }

      if (!result || !result.files || result.files.length === 0) {
        return; // 用户取消了选择
      }

      // 将 File Picker 返回的文件转换为 File 对象
      // @capawesome/capacitor-file-picker 通常返回: { files: [{ path, name, mimeType, size }] }
      const selectedFiles = await Promise.all(
        result.files.map(async (fileData) => {
          // File Picker 返回的数据结构可能是多种格式：
          // @capawesome/capacitor-file-picker: { path, name, mimeType, size }
          // 其他插件可能: { path, name, mimeType, size, data (base64) } 或 { uri, name, mimeType, size }
          
          let file;
          let base64String;
          let fileName = fileData.name || fileData.filename || 'file';
          let mimeType = fileData.mimeType || fileData.type || 'application/octet-stream';
          
          // 情况1: 如果返回的是 base64 数据（某些插件直接返回）
          if (fileData.data) {
            base64String = fileData.data;
          }
          // 情况2: 如果返回的是文件路径（@capawesome/capacitor-file-picker 通常返回这种方式）
          else if (fileData.path || fileData.uri) {
            const filePath = fileData.path || fileData.uri;
            
            try {
              // 使用 Filesystem 读取文件
              // @capawesome/capacitor-file-picker 返回的 path 可能需要特殊处理
              const fileContent = await capModules.Filesystem.readFile({
                path: filePath,
              });
              
              base64String = typeof fileContent.data === 'string' 
                ? fileContent.data 
                : fileContent.data.toString();
            } catch (fsError) {
              console.error('读取文件失败:', fsError);
              // 如果读取失败，尝试使用原始路径（某些情况下路径可能需要特殊处理）
              throw new Error(`无法读取文件: ${fileName}。路径: ${filePath}`);
            }
          } 
          // 情况3: 如果已经是 File 对象（某些插件可能直接返回）
          else if (fileData instanceof File) {
            return fileData;
          }
          else {
            throw new Error('无法读取文件数据，文件格式不支持。请检查插件返回的数据结构。');
          }
          
          // 处理 base64 字符串
          // 移除 data:type;base64, 前缀（如果存在）
          const actualBase64 = base64String.startsWith('data:') 
            ? base64String.split(',')[1] 
            : base64String;
          
          // 将 base64 转换为 Blob，再转换为 File
          try {
            const byteCharacters = atob(actualBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            file = new File([blob], fileName, { type: mimeType });
          } catch (convertError) {
            console.error('文件转换失败:', convertError);
            throw new Error(`文件转换失败: ${fileName}`);
          }
          
          return file;
        })
      );

      await handleFilesUpload(selectedFiles);
    } catch (error) {
      console.error('文件选择失败:', error);
      // 如果用户取消选择，某些插件可能会抛出错误，这里不显示错误提示
      const errorMessage = error.message || String(error);
      if (!errorMessage.toLowerCase().includes('cancel') && 
          !errorMessage.toLowerCase().includes('取消') &&
          !errorMessage.toLowerCase().includes('user cancelled')) {
        alert('文件选择失败: ' + errorMessage);
      }
    }
  };

  // 统一的文件上传处理函数
  const handleFilesUpload = async (selectedFiles) => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    const initialProgress = {};
    selectedFiles.forEach(file => {
      initialProgress[file.name] = { progress: 0, uploaded: 0, total: file.size, speed: 0, remaining: 0 };
    });
    setUploadProgress(initialProgress);

    try {
      const uploadPromises = selectedFiles.map(file => uploadFileWithProgress(file));
      await Promise.all(uploadPromises);
      loadFiles();
      onFileUploaded?.({
        testItemId,
        category: selectedCategory
      });
    } catch (error) {
      alert('文件上传失败: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress({});
    }
  };

  // 处理上传按钮点击（根据环境选择不同的文件选择方式）
  const handleUploadClick = () => {
    if (isNativePlatform()) {
      // 原生环境：使用 File Picker
      handleNativeFileSelect();
    } else {
      // Web环境：使用传统的 input 元素
      const fileInput = document.getElementById('mobile-file-input');
      if (fileInput) {
        fileInput.click();
      }
    }
  };

  const uploadFileWithProgress = (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedCategory);
      formData.append('test_item_id', testItemId);
      if (orderId) formData.append('order_id', orderId);

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        reject(new Error('用户未登录'));
        return;
      }

      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          const loadedDiff = e.loaded - lastLoaded;
          
          let speed = 0;
          let remaining = 0;
          
          if (timeDiff > 0) {
            speed = loadedDiff / timeDiff;
            const remainingBytes = e.total - e.loaded;
            remaining = remainingBytes / speed;
          }
          
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: {
              progress: Math.round(progress),
              uploaded: e.loaded,
              total: e.total,
              speed: speed,
              remaining: remaining
            }
          }));
          
          lastLoaded = e.loaded;
          lastTime = now;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const uploaded = JSON.parse(xhr.responseText);
            
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: {
                progress: 100,
                uploaded: prev[file.name]?.total || 0,
                total: prev[file.name]?.total || 0,
                speed: 0,
                remaining: 0
              }
            }));

            if (selectedCategory === 'raw_data' && testItemId) {
              const uploadedAt = uploaded.created_at || new Date().toISOString();
              const dateOnly = new Date(uploadedAt).toISOString().slice(0, 10);

              fetch(`${API_BASE}/api/test-items/${testItemId}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${user.token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ actual_delivery_date: dateOnly })
              }).then(updateRes => {
                if (updateRes.ok) {
                  const event = new CustomEvent('realtime-data-update', {
                    detail: { testItemId, field: 'actual_delivery_date', value: dateOnly }
                  });
                  window.dispatchEvent(event);
                }
              });
            }

            resolve(uploaded);
          } catch (parseError) {
            reject(new Error('解析服务器响应失败'));
          }
        } else {
          const contentType = xhr.getResponseHeader('content-type') || '';
          let errorMessage = '上传失败';
          
          try {
            if (contentType.includes('application/json')) {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorMessage;
            } else {
              errorMessage = `服务器错误 (${xhr.status})。请检查文件类型是否符合要求。`;
            }
          } catch (parseError) {
            errorMessage = `上传失败 (${xhr.status} ${xhr.statusText})。请检查文件类型。`;
          }
          
          reject(new Error(errorMessage));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误，上传失败'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'));
      });

      xhr.open('POST', `${API_BASE}/api/files/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);
      xhr.send(formData);
    });
  };

  const handleDownload = (file) => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || !user.token) {
      alert('用户未登录');
      return;
    }

    if (userRole === 'sales' && file.category === 'raw_data') {
      const isBusinessConfirmed = businessConfirmed === 1 || businessConfirmed === true;
      const isCurrentAssignee = user.user_id === currentAssignee;
      
      if (isCurrentAssignee && !isBusinessConfirmed) {
        alert('请先点击确认合同价格再下载');
        return;
      }
    }

    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let lastTime = Date.now();

    setDownloadProgress(prev => ({
      ...prev,
      [file.file_id]: {
        progress: 0,
        downloaded: 0,
        total: 0,
        speed: 0,
        remaining: 0
      }
    }));

    downloadXhrRef.current[file.file_id] = xhr;

    xhr.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        const loadedDiff = e.loaded - lastLoaded;
        
        let speed = 0;
        let remaining = 0;
        
        if (timeDiff > 0) {
          speed = loadedDiff / timeDiff;
          const remainingBytes = e.total - e.loaded;
          remaining = remainingBytes / speed;
        }
        
        setDownloadProgress(prev => ({
          ...prev,
          [file.file_id]: {
            progress: Math.round(progress),
            downloaded: e.loaded,
            total: e.total,
            speed: speed,
            remaining: remaining
          }
        }));
        
        lastLoaded = e.loaded;
        lastTime = now;
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          setDownloadProgress(prev => ({
            ...prev,
            [file.file_id]: {
              progress: 100,
              downloaded: prev[file.file_id]?.total || 0,
              total: prev[file.file_id]?.total || 0,
              speed: 0,
              remaining: 0
            }
          }));

          const blob = new Blob([xhr.response], { type: xhr.getResponseHeader('content-type') || 'application/octet-stream' });
          
          const contentDisposition = xhr.getResponseHeader('content-disposition');
          let downloadFilename = file.filename;
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
            if (filenameMatch) {
              downloadFilename = decodeURIComponent(filenameMatch[1]);
            } else {
              const filenameMatch2 = contentDisposition.match(/filename="(.+)"/);
              if (filenameMatch2) {
                downloadFilename = filenameMatch2[1];
              }
            }
          }

          // 原生平台（iOS和Android）：使用Share插件分享文件
          const capModules = getCapacitorModules();
          if (capModules && capModules.Capacitor.isNativePlatform()) {
            const platform = capModules.Capacitor.getPlatform();
            const isIOS = platform === 'ios';
            const isAndroid = platform === 'android';

            if (isIOS || isAndroid) {
              try {
                // 将blob转换为base64
                const reader = new FileReader();
                const base64Data = await new Promise((resolve, reject) => {
                  reader.onloadend = () => {
                    const base64String = reader.result.split(',')[1];
                    resolve(base64String);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });

                // 处理文件名：移除非法字符，确保跨平台兼容性
                const safeFilename = downloadFilename
                  .replace(/[\/\\\x00]/g, '_')  // 移除路径分隔符和null字符
                  .replace(/[\x01-\x1f]/g, '_')  // 移除控制字符
                  .trim();  // 移除首尾空白
                
                // 保存文件到Cache目录（临时目录）
                const fileResult = await capModules.Filesystem.writeFile({
                  path: safeFilename,
                  data: base64Data,
                  directory: capModules.Directory.Cache, // 使用Cache目录作为临时存储
                  recursive: true
                });

                // 使用Share插件分享文件
                // iOS: 会显示UIActivityViewController，包括"保存到文件"、"AirDrop"等选项
                // Android: 会显示系统分享菜单，可以选择其他应用打开文件（如WPS、微信、QQ等）
                await capModules.Share.share({
                  title: downloadFilename, // 使用原始文件名（包含中文）
                  text: `文件：${downloadFilename}`,
                  files: [fileResult.uri], // iOS和Android都使用files参数
                  dialogTitle: isAndroid ? '选择应用打开文件' : '保存或分享文件'
                });

                // 注意：不立即删除文件，因为分享操作是异步的
                // Cache目录的文件会被系统自动管理

              } catch (shareError) {
                console.error('分享文件失败:', shareError);
                // 如果分享失败，回退到传统下载方式
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = downloadFilename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
              }
            } else {
              // 其他原生平台，使用传统下载方式
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = downloadFilename;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            }
          } else {
            // Web平台或其他平台：使用传统的下载方式
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }

          setTimeout(() => {
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[file.file_id];
              return newProgress;
            });
            delete downloadXhrRef.current[file.file_id];
          }, 500);
        } catch (error) {
          alert('下载失败: ' + error.message);
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[file.file_id];
            return newProgress;
          });
          delete downloadXhrRef.current[file.file_id];
        }
      } else {
        const contentType = xhr.getResponseHeader('content-type') || '';
        let errorMessage = '下载失败';
        
        try {
          if (contentType.includes('application/json')) {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.error || errorMessage;
          } else {
            errorMessage = `服务器错误 (${xhr.status})`;
          }
        } catch (parseError) {
          errorMessage = `下载失败 (${xhr.status} ${xhr.statusText})`;
        }
        
        alert(errorMessage);
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file.file_id];
          return newProgress;
        });
        delete downloadXhrRef.current[file.file_id];
      }
    });

    xhr.addEventListener('error', () => {
      alert('网络错误，下载失败');
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file.file_id];
        return newProgress;
      });
      delete downloadXhrRef.current[file.file_id];
    });

    xhr.addEventListener('abort', () => {
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file.file_id];
        return newProgress;
      });
      delete downloadXhrRef.current[file.file_id];
    });

    xhr.responseType = 'blob';
    xhr.open('GET', `${API_BASE}/api/files/download/${file.file_id}`);
    xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);
    xhr.send();
  };

  const handleCancelDownload = (fileId) => {
    const xhr = downloadXhrRef.current[fileId];
    if (xhr) {
      xhr.abort();
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('确定要删除这个文件吗？')) return;
    
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        throw new Error('用户未登录');
      }

      const response = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '删除失败');
      }
      
      loadFiles();
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const iconMap = {
      'pdf': '📄',
      'doc': '📝',
      'docx': '📝',
      'xls': '📊',
      'xlsx': '📊',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'png': '🖼️',
      'gif': '🖼️',
      'webp': '🖼️',
      'txt': '📄',
      'csv': '📊',
      'zip': '📦',
      'rar': '📦'
    };
    return iconMap[ext] || '📄';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatRemainingTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '计算中...';
    if (seconds < 60) return Math.round(seconds) + '秒';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return minutes + '分' + secs + '秒';
  };

  const canDeleteFile = (file) => {
    if (['admin', 'leader', 'supervisor'].includes(userRole)) {
      return true;
    }
    
    if (userRole === 'employee') {
      try {
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        const isRawData = file.category === 'raw_data';
        const isOwner = file.uploaded_by === user?.user_id;
        return isRawData && isOwner;
      } catch (error) {
        return false;
      }
    }
    
    return false;
  };

  const canDownloadFile = (file) => {
    if (userRole === 'sales' && file.category === 'raw_data') {
      try {
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        const isBusinessConfirmed = businessConfirmed === 1 || businessConfirmed === true;
        const isCurrentAssignee = user?.user_id === currentAssignee;
        
        if (isCurrentAssignee && !isBusinessConfirmed) {
          return false;
        }
      } catch (error) {
        return true;
      }
    }
    return true;
  };

  if (!testItemId) {
    return null;
  }

  return (
    <div className="mobile-file-upload">
      <div className="mobile-file-header">
        <div className="mobile-category-tabs">
          {categories.map(category => (
            <button
              key={category.value}
              className={`mobile-tab ${selectedCategory === category.value ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.value)}
            >
              <span className="mobile-tab-label">{category.label}</span>
            </button>
          ))}
        </div>
        
        {/* Web环境保留隐藏的input元素 */}
        {!isNativePlatform() && canUpload && (
          <input
            type="file"
            id="mobile-file-input"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        )}
      </div>

      {Object.keys(uploadProgress).length > 0 && (
        <div className="mobile-upload-progress-container">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="mobile-upload-progress-item">
              <div className="mobile-upload-progress-header">
                <span className="mobile-upload-file-name">{fileName}</span>
                <span className="mobile-upload-progress-percent">{progress.progress}%</span>
              </div>
              <div className="mobile-upload-progress-bar-container">
                <div 
                  className="mobile-upload-progress-bar" 
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <div className="mobile-upload-progress-info">
                <span>
                  {formatFileSize(progress.uploaded)} / {formatFileSize(progress.total)}
                </span>
                {progress.speed > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(progress.speed)}/秒</span>
                    {progress.remaining > 0 && (
                      <>
                        <span>•</span>
                        <span>剩余 {formatRemainingTime(progress.remaining)}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(downloadProgress).length > 0 && (
        <div className="mobile-download-progress-container">
          {Object.entries(downloadProgress).map(([fileId, progress]) => {
            const file = files.find(f => f.file_id.toString() === fileId);
            const fileName = file ? file.filename : '文件';
            return (
              <div key={fileId} className="mobile-download-progress-item">
                <div className="mobile-download-progress-header">
                  <span className="mobile-download-file-name">正在下载: {fileName}</span>
                  <div className="mobile-download-progress-actions">
                    <span className="mobile-download-progress-percent">{progress.progress}%</span>
                    <button
                      className="mobile-btn-cancel-download"
                      onClick={() => handleCancelDownload(fileId)}
                    >
                      取消
                    </button>
                  </div>
                </div>
                <div className="mobile-download-progress-bar-container">
                  <div 
                    className="mobile-download-progress-bar" 
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <div className="mobile-download-progress-info">
                  <span>
                    {formatFileSize(progress.downloaded)} / {progress.total > 0 ? formatFileSize(progress.total) : '计算中...'}
                  </span>
                  {progress.speed > 0 && (
                    <>
                      <span>•</span>
                      <span>{formatFileSize(progress.speed)}/秒</span>
                      {progress.remaining > 0 && (
                        <>
                          <span>•</span>
                          <span>剩余 {formatRemainingTime(progress.remaining)}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mobile-file-list">
        {files.length === 0 ? (
          <div className="mobile-no-files">
            <p>暂无 {categories.find(c => c.value === selectedCategory)?.label}</p>
          </div>
        ) : (
          files.map(file => (
            <div key={file.file_id} className="mobile-file-item">
              <div className="mobile-file-info">
                <span className="mobile-file-icon">{getFileIcon(file.filename)}</span>
                <div className="mobile-file-details">
                  <div className="mobile-file-name" title={file.filename}>
                    {file.filename}
                  </div>
                  <div className="mobile-file-meta">
                    <span>上传者: {file.uploaded_by_name || file.uploaded_by}</span>
                    <span>时间: {formatDate(file.created_at)}</span>
                  </div>
                </div>
              </div>
              
              <div className="mobile-file-actions">
                <button 
                  onClick={() => handleDownload(file)}
                  className="mobile-btn-download"
                  disabled={downloadProgress[file.file_id] !== undefined || !canDownloadFile(file)}
                  style={!canDownloadFile(file) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  {downloadProgress[file.file_id] ? '下载中...' : '下载'}
                </button>
                {canDeleteFile(file) && (
                  <button 
                    onClick={() => handleDelete(file.file_id)}
                    className="mobile-btn-delete"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 上传附件按钮 - 显示在文件列表底部 */}
      {canUpload && (
        <div className="mobile-upload-button-container">
          <button
            className="mobile-btn-upload-primary"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? '上传中...' : '上传附件'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileFileUpload;

