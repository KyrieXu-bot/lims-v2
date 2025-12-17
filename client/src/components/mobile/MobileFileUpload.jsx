import React, { useState, useEffect, useRef } from 'react';
import './MobileFileUpload.css';

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
      
      const response = await fetch(`/api/files?${params}`, {
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

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files);
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
      e.target.value = '';
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

      xhr.open('POST', '/api/files/upload');
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

    xhr.addEventListener('load', () => {
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
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
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
    xhr.open('GET', `/api/files/download/${file.file_id}`);
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
        
        {canUpload && (
          <div className="mobile-upload-controls">
            <input
              type="file"
              id="mobile-file-input"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <button
              className="mobile-btn-upload"
              onClick={() => document.getElementById('mobile-file-input').click()}
              disabled={uploading}
            >
              {uploading ? '上传中...' : '选择文件'}
            </button>
          </div>
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
    </div>
  );
};

export default MobileFileUpload;

