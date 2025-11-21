import React, { useState, useEffect, useRef } from 'react';
import './SimpleFileUpload.css';

const SimpleFileUpload = ({ 
  testItemId, 
  orderId, 
  userRole,
  onFileUploaded 
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('order_attachment');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({}); // { fileName: { progress: 0, speed: 0, remaining: 0 } }
  const [downloadProgress, setDownloadProgress] = useState({}); // { fileId: { progress: 0, downloaded: 0, total: 0, speed: 0, remaining: 0 } }
  const downloadXhrRef = useRef({}); // { fileId: XMLHttpRequest } 存储每个文件的下载请求

  const categories = [
    { value: 'order_attachment', label: '委托单附件', icon: '📄' },
    { value: 'raw_data', label: '实验原始数据', icon: '🔬' },
    { value: 'experiment_report', label: '实验报告', icon: '📊' }
  ];

  const canUpload = ['admin', 'leader', 'supervisor', 'employee', 'sales'].includes(userRole);

  useEffect(() => {
    if (testItemId) {
      loadFiles();
    }
  }, [testItemId, selectedCategory]);

  const loadFiles = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        throw new Error('用户未登录');
      }
      
      const params = new URLSearchParams({
        category: selectedCategory,
        test_item_id: testItemId,
        pageSize: 50
      });
      
      const response = await fetch(`/api/files?${params}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFiles(data.data || []);
      }
    } catch (error) {
      console.error('加载文件失败:', error);
    }
  };

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    // 初始化所有文件的上传进度
    const initialProgress = {};
    selectedFiles.forEach(file => {
      initialProgress[file.name] = { progress: 0, uploaded: 0, total: file.size, speed: 0, remaining: 0 };
    });
    setUploadProgress(initialProgress);

    try {
      // 并行上传所有文件（每个文件有自己的进度追踪）
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
      e.target.value = '';
    }
  };

  // 使用 XMLHttpRequest 上传文件，支持进度追踪
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

      // 上传进度事件
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // 秒
          const loadedDiff = e.loaded - lastLoaded; // 字节
          
          let speed = 0; // 字节/秒
          let remaining = 0; // 剩余时间（秒）
          
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

      // 上传完成
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const uploaded = JSON.parse(xhr.responseText);
            
            // 更新进度为100%
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

            // 如果上传的是“实验原始数据”，则把上传时间写入对应检测项目的实际交付日期
            try {
              if (selectedCategory === 'raw_data' && testItemId) {
                const uploadedAt = uploaded.created_at || new Date().toISOString();
                const dateOnly = new Date(uploadedAt).toISOString().slice(0, 10);

                fetch(`/api/test-items/${testItemId}`, {
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
            } catch (err) {
              console.error('更新实际交付日期失败:', err);
            }

            resolve(uploaded);
          } catch (parseError) {
            reject(new Error('解析服务器响应失败'));
          }
        } else {
          // 处理错误响应
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

      // 上传错误
      xhr.addEventListener('error', () => {
        reject(new Error('网络错误，上传失败'));
      });

      // 上传中断
      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'));
      });

      // 发送请求
      xhr.open('POST', '/api/files/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);
      xhr.send(formData);
    });
  };

  // 使用 XMLHttpRequest 下载文件，支持进度追踪
  const handleDownload = (file) => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || !user.token) {
      alert('用户未登录');
      return;
    }

    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let lastTime = Date.now();

    // 初始化下载进度
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

    // 保存 xhr 引用以便取消下载
    downloadXhrRef.current[file.file_id] = xhr;

    // 下载进度事件
    xhr.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000; // 秒
        const loadedDiff = e.loaded - lastLoaded; // 字节
        
        let speed = 0; // 字节/秒
        let remaining = 0; // 剩余时间（秒）
        
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

    // 下载完成
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          // 更新进度为100%
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

          // 创建 blob 并触发下载
          const blob = new Blob([xhr.response], { type: xhr.getResponseHeader('content-type') || 'application/octet-stream' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          // 从响应头获取文件名，如果没有则使用原始文件名
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
          
          a.download = downloadFilename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          // 延迟清除进度，让用户看到100%
          setTimeout(() => {
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[file.file_id];
              return newProgress;
            });
            // 清除 xhr 引用
            delete downloadXhrRef.current[file.file_id];
          }, 500);
        } catch (error) {
          alert('下载失败: ' + error.message);
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[file.file_id];
            return newProgress;
          });
          // 清除 xhr 引用
          delete downloadXhrRef.current[file.file_id];
        }
      } else {
        // 处理错误响应
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
        // 清除 xhr 引用
        delete downloadXhrRef.current[file.file_id];
      }
    });

    // 下载错误
    xhr.addEventListener('error', () => {
      alert('网络错误，下载失败');
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file.file_id];
        return newProgress;
      });
      // 清除 xhr 引用
      delete downloadXhrRef.current[file.file_id];
    });

    // 下载中断
    xhr.addEventListener('abort', () => {
      // 不显示 alert，因为这是用户主动取消的
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file.file_id];
        return newProgress;
      });
      // 清除 xhr 引用
      delete downloadXhrRef.current[file.file_id];
    });

    // 设置响应类型为 blob
    xhr.responseType = 'blob';

    // 发送请求
    xhr.open('GET', `/api/files/download/${file.file_id}`);
    xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);
    xhr.send();
  };

  // 取消下载
  const handleCancelDownload = (fileId) => {
    const xhr = downloadXhrRef.current[fileId];
    if (xhr) {
      xhr.abort();
      // xhr 的 abort 事件处理器会清理状态
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('确定要删除这个文件吗？')) return;
    
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        throw new Error('用户未登录');
      }

      const response = await fetch(`/api/files/${fileId}`, {
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

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化剩余时间
  const formatRemainingTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '计算中...';
    if (seconds < 60) return Math.round(seconds) + '秒';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return minutes + '分' + secs + '秒';
  };

  // 判断是否显示删除按钮
  const canDeleteFile = (file) => {
    // 管理员、室主任、主管可以删除所有文件
    if (['admin', 'leader', 'supervisor'].includes(userRole)) {
      return true;
    }
    
    // 实验员只能删除自己上传的原始数据文件
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

  if (!testItemId) {
    return null;
  }

  return (
    <div className="simple-file-upload">
      <div className="file-header">
        <div className="category-tabs">
          {categories.map(category => (
            <button
              key={category.value}
              className={`tab ${selectedCategory === category.value ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.value)}
            >
              <span className="tab-icon">{category.icon}</span>
              <span className="tab-label">{category.label}</span>
            </button>
          ))}
        </div>
        
        {canUpload && (
          <div className="upload-controls">
            <input
              type="file"
              id="file-input"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <button
              className="btn-upload"
              onClick={() => document.getElementById('file-input').click()}
              disabled={uploading}
            >
              {uploading ? '上传中...' : '选择文件'}
            </button>
          </div>
        )}
      </div>

      {/* 上传进度条 */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="upload-progress-container">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="upload-progress-item">
              <div className="upload-progress-header">
                <span className="upload-file-name">{fileName}</span>
                <span className="upload-progress-percent">{progress.progress}%</span>
              </div>
              <div className="upload-progress-bar-container">
                <div 
                  className="upload-progress-bar" 
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <div className="upload-progress-info">
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

      {/* 下载进度条 */}
      {Object.keys(downloadProgress).length > 0 && (
        <div className="download-progress-container">
          {Object.entries(downloadProgress).map(([fileId, progress]) => {
            const file = files.find(f => f.file_id.toString() === fileId);
            const fileName = file ? file.filename : '文件';
            return (
              <div key={fileId} className="download-progress-item">
                <div className="download-progress-header">
                  <span className="download-file-name">正在下载: {fileName}</span>
                  <div className="download-progress-actions">
                    <span className="download-progress-percent">{progress.progress}%</span>
                    <button
                      className="btn-cancel-download"
                      onClick={() => handleCancelDownload(fileId)}
                      title="取消下载"
                    >
                      取消
                    </button>
                  </div>
                </div>
                <div className="download-progress-bar-container">
                  <div 
                    className="download-progress-bar" 
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <div className="download-progress-info">
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

      <div className="file-list">
        {files.length === 0 ? (
          <div className="no-files">
            <p>暂无 {categories.find(c => c.value === selectedCategory)?.label}</p>
          </div>
        ) : (
          files.map(file => (
            <div key={file.file_id} className="file-item">
              <div className="file-info">
                <span className="file-icon">{getFileIcon(file.filename)}</span>
                <div className="file-details">
                  <div className="file-name" title={file.filename}>
                    {file.filename}
                  </div>
                  <div className="file-meta">
                    <span>上传者: {file.uploaded_by_name || file.uploaded_by}</span>
                    <span>时间: {formatDate(file.created_at)}</span>
                  </div>
                </div>
              </div>
              
              <div className="file-actions">
                <button 
                  onClick={() => handleDownload(file)}
                  className="btn-download"
                  title="下载"
                  disabled={downloadProgress[file.file_id] !== undefined}
                >
                  {downloadProgress[file.file_id] ? '下载中...' : '下载'}
                </button>
                {canDeleteFile(file) && (
                  <button 
                    onClick={() => handleDelete(file.file_id)}
                    className="btn-delete"
                    title="删除"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SimpleFileUpload;
