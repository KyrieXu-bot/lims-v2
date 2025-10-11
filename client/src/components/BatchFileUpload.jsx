import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

const BatchFileUpload = ({ testItemIds, userRole, onFileUploaded }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [testItemDetails, setTestItemDetails] = useState([]);

  // 获取检测项目详情
  useEffect(() => {
    const fetchTestItemDetails = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        const headers = {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        };

        const details = await Promise.all(
          testItemIds.map(async (testItemId) => {
            const response = await fetch(`/api/test-items/${testItemId}`, { headers });
            if (response.ok) {
              const data = await response.json();
              return {
                test_item_id: testItemId,
                order_id: data.order_id,
                test_item_name: `${data.category_name} - ${data.detail_name}`
              };
            }
            return {
              test_item_id: testItemId,
              order_id: '未知',
              test_item_name: '未知项目'
            };
          })
        );
        setTestItemDetails(details);
      } catch (error) {
        console.error('获取检测项目详情失败:', error);
        // 如果获取失败，至少显示ID
        setTestItemDetails(testItemIds.map(id => ({
          test_item_id: id,
          order_id: '未知',
          test_item_name: '未知项目'
        })));
      }
    };

    if (testItemIds.length > 0) {
      fetchTestItemDetails();
    }
  }, [testItemIds]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('请先选择要上传的文件');
      return;
    }

    if (testItemIds.length === 0) {
      alert('没有选择检测项目');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('testItemIds', JSON.stringify(testItemIds));

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`
      };

      const response = await fetch('/api/files/batch-upload', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();
      alert(`批量上传成功！文件已关联到 ${result.affectedRows} 个检测项目`);
      
      if (onFileUploaded) {
        onFileUploaded();
      }
    } catch (error) {
      console.error('批量上传失败:', error);
      alert('批量上传失败: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="batch-upload-container">
      <div className="upload-section">
        <h4>选择文件</h4>
        <input
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
          className="file-input"
        />
        {selectedFile && (
          <div className="file-info">
            <p><strong>文件名:</strong> {selectedFile.name}</p>
            <p><strong>文件大小:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        )}
      </div>

      <div className="upload-section">
        <h4>目标检测项目</h4>
        <p>将文件关联到以下 {testItemIds.length} 个检测项目:</p>
        <div className="test-item-list">
          {testItemDetails.map((item, index) => (
            <div key={item.test_item_id} className="test-item-card">
              <div className="test-item-id">#{item.test_item_id}</div>
              <div className="test-item-info">
                <div className="test-item-order">委托单: {item.order_id}</div>
                <div className="test-item-name">{item.test_item_name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p>上传中... {uploadProgress}%</p>
        </div>
      )}

      <div className="upload-actions">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="btn btn-primary"
        >
          {uploading ? '上传中...' : '开始批量上传'}
        </button>
      </div>

      <style jsx>{`
        .batch-upload-container {
          padding: 20px;
        }
        
        .upload-section {
          margin-bottom: 20px;
        }
        
        .upload-section h4 {
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .file-input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .file-info {
          margin-top: 10px;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        
        .file-info p {
          margin: 5px 0;
        }
        
        .test-item-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        
        .test-item-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          transition: all 0.2s ease;
        }
        
        .test-item-card:hover {
          background: #e9ecef;
          border-color: #007bff;
        }
        
        .test-item-id {
          background: #007bff;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          min-width: 60px;
          text-align: center;
        }
        
        .test-item-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .test-item-order {
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }
        
        .test-item-name {
          font-size: 13px;
          color: #333;
          font-weight: 500;
        }
        
        .upload-progress {
          margin: 20px 0;
        }
        
        .progress-bar {
          width: 100%;
          height: 20px;
          background: #f0f0f0;
          border-radius: 10px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: #007bff;
          transition: width 0.3s ease;
        }
        
        .upload-actions {
          text-align: right;
          margin-top: 20px;
        }
        
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .btn-primary {
          background: #007bff;
          color: white;
        }
        
        .btn-primary:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default BatchFileUpload;
