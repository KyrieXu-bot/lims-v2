import React from 'react';
import './CustomerDetailModal.css';

const CustomerDetailModal = ({ customer, isOpen, onClose }) => {
  if (!isOpen || !customer) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>客户详细信息</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="customer-info">
            <div className="info-section">
              <h3>基本信息</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>客户ID:</label>
                  <span>{customer.customer_id || '-'}</span>
                </div>
                <div className="info-item">
                  <label>客户名称:</label>
                  <span>{customer.customer_name || '-'}</span>
                </div>
                <div className="info-item">
                  <label>税号:</label>
                  <span>{customer.tax_id || '-'}</span>
                </div>
                <div className="info-item">
                  <label>联系电话:</label>
                  <span>{customer.phone || '-'}</span>
                </div>
                <div className="info-item">
                  <label>所属省份:</label>
                  <span>{customer.province || '-'}</span>
                </div>
                <div className="info-item">
                  <label>企业性质:</label>
                  <span>{customer.nature || '-'}</span>
                </div>
                <div className="info-item">
                  <label>企业规模:</label>
                  <span>{customer.scale || '-'}</span>
                </div>
                <div className="info-item">
                  <label>企业等级:</label>
                  <span>{customer.grade || '-'}</span>
                </div>
                <div className="info-item">
                  <label>状态:</label>
                  <span className={`status ${customer.is_active ? 'active' : 'inactive'}`}>
                    {customer.is_active ? '启用' : '停用'}
                  </span>
                </div>
              </div>
            </div>

            <div className="info-section">
              <h3>联系信息</h3>
              <div className="info-grid">
                <div className="info-item full-width">
                  <label>详细地址:</label>
                  <span>{customer.address || '-'}</span>
                </div>
                <div className="info-item">
                  <label>开户银行:</label>
                  <span>{customer.bank_name || '-'}</span>
                </div>
                <div className="info-item">
                  <label>银行账号:</label>
                  <span>{customer.bank_account || '-'}</span>
                </div>
                <div className="info-item">
                  <label>负责人:</label>
                  <span>{customer.owner_name || '-'}</span>
                </div>
              </div>
            </div>

            <div className="info-section">
              <h3>时间信息</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>创建时间:</label>
                  <span>{formatDate(customer.created_at)}</span>
                </div>
                <div className="info-item">
                  <label>更新时间:</label>
                  <span>{formatDate(customer.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailModal;
