import React, { useState, useEffect } from 'react';
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
    try {
      for (const file of selectedFiles) {
        await uploadFile(file);
      }
      loadFiles();
      onFileUploaded?.();
    } catch (error) {
      alert('文件上传失败: ' + error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory);
    formData.append('test_item_id', testItemId);
    if (orderId) formData.append('order_id', orderId);

    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || !user.token) {
      throw new Error('用户未登录');
    }

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '上传失败');
    }

    return await response.json();
  };

  const handleDownload = async (file) => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        throw new Error('用户未登录');
      }

      const response = await fetch(`/api/files/download/${file.file_id}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('下载失败');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('下载失败: ' + error.message);
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
        throw new Error('删除失败');
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
                >
                  下载
                </button>
                {['admin', 'leader', 'supervisor'].includes(userRole) && (
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
