import React, { useState } from 'react';
import SimpleFileUpload from '../../components/SimpleFileUpload';

const ChineseFileNameTest = () => {
  const [testItemId] = useState('999'); // 测试用的检测项目ID
  const [orderId] = useState('TEST001'); // 测试用的委托单ID

  const handleFileUploaded = (result) => {
    console.log('文件上传成功:', result);
    alert(`文件上传成功！\n文件名: ${result.filename}\n文件ID: ${result.file_id}`);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>中文文件名测试</h1>
      <p>请上传包含中文字符的文件来测试编码处理是否正确。</p>
      
      <div style={{ 
        background: '#f0f8ff', 
        padding: '1rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        border: '1px solid #b0d4f1'
      }}>
        <h3>测试说明：</h3>
        <ul>
          <li>上传文件名包含中文的文件（如：测试文档.pdf、实验数据.xlsx等）</li>
          <li>检查上传后文件名是否正确显示</li>
          <li>测试文件下载功能，确认下载的文件名是否正确</li>
          <li>检查数据库中存储的文件名是否正确</li>
        </ul>
      </div>

      <SimpleFileUpload
        testItemId={testItemId}
        orderId={orderId}
        userRole="admin"
        onFileUploaded={handleFileUploaded}
      />
    </div>
  );
};

export default ChineseFileNameTest;
