import React, { useState, useRef } from 'react';
import './FileUpload.css';

const FileUpload = ({ 
  category, 
  orderId, 
  testItemId, 
  sampleId, 
  onUploadSuccess, 
  onUploadError,
  disabled = false,
  multiple = false,
  accept = "*",
  maxSize = 50 * 1024 * 1024 // 50MB
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = async (files) => {
    if (files.length === 0) return;
    
    if (!multiple && files.length > 1) {
      onUploadError?.('只能选择一个文件');
      return;
    }

    // 检查文件大小
    const oversizedFiles = files.filter(file => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      onUploadError?.(`文件大小不能超过 ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadPromises = files.map(file => uploadFile(file));
      const results = await Promise.all(uploadPromises);
      
      onUploadSuccess?.(multiple ? results : results[0]);
      setUploadProgress(100);
      
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      onUploadError?.(error.message || '上传失败');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    
    if (orderId) formData.append('order_id', orderId);
    if (testItemId) formData.append('test_item_id', testItemId);
    if (sampleId) formData.append('sample_id', sampleId);

    const token = localStorage.getItem('token');
    
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '上传失败');
    }

    return await response.json();
  };

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getCategoryText = (category) => {
    const categoryMap = {
      'order_attachment': '委托单附件',
      'raw_data': '实验原始数据',
      'experiment_report': '实验报告'
    };
    return categoryMap[category] || '文件';
  };

  return (
    <div className="file-upload-container">
      <div
        className={`file-upload-area ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={disabled}
        />
        
        {uploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p>上传中... {uploadProgress}%</p>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <p className="upload-text">
              {isDragging ? '松开鼠标上传文件' : '点击或拖拽文件到此处上传'}
            </p>
            <p className="upload-category">
              {getCategoryText(category)}附件
            </p>
            <p className="upload-hint">
              支持图片、PDF、Word、Excel等格式，最大 {Math.round(maxSize / 1024 / 1024)}MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
