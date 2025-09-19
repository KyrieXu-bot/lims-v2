import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function SampleDetail() {
  const { id } = useParams();
  const [sample, setSample] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadSample();
  }, [id]);

  async function loadSample() {
    try {
      setLoading(true);
      const data = await api.getSampleTracking(id);
      setSample(data);
    } catch (e) {
      alert(e.message);
      navigate('/sample-management');
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'received': '#17a2b8',
      'testing_completed': '#ffc107',
      'returned': '#28a745'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusText = (status) => {
    const texts = {
      'received': '已接收',
      'testing_completed': '检测完成',
      'returned': '已回收'
    };
    return texts[status] || status;
  };

  const getLabTypeText = (labType) => {
    const texts = {
      'mechanics': '力学实验室',
      'microscopy': '显微实验室',
      'physical_chemistry': '物化实验室'
    };
    return texts[labType] || labType;
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  if (!sample) {
    return <div>样品信息不存在</div>;
  }

  return (
    <div style={{maxWidth: 1000}}>
      <h2>样品详情</h2>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/sample-management')}>
          返回列表
        </button>
      </div>

      <div className="grid-2">
        <div>
          <h3>基本信息</h3>
          <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '4px' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>委托单号：</strong> {sample.order_id}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>大类：</strong> {sample.category_name}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>细项：</strong> {sample.detail_name || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>测试代码：</strong> {sample.test_code || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>样品名称：</strong> {sample.sample_name || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>材质：</strong> {sample.material || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>样品原号：</strong> {sample.original_no || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>数量：</strong> {sample.quantity || '-'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>单价：</strong> {sample.unit_price ? `¥${sample.unit_price}` : '-'}
            </div>
          </div>
        </div>

        <div>
          <h3>追踪信息</h3>
          <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '4px' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>条码：</strong> {sample.barcode}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>实验室：</strong> {getLabTypeText(sample.lab_type)}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>当前状态：</strong> 
              <span className="badge" style={{
                backgroundColor: getStatusColor(sample.current_status),
                color: 'white',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                marginLeft: '8px'
              }}>
                {getStatusText(sample.current_status)}
              </span>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>创建时间：</strong> {new Date(sample.created_at).toLocaleString()}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>最后更新：</strong> {new Date(sample.updated_at).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>流程记录</h3>
        <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '4px' }}>
          {sample.received_at && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>📥 样品接收</strong>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                    接收人：{sample.received_by_name || sample.received_by || '-'}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {new Date(sample.received_at).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {sample.testing_completed_at && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>✅ 检测完成</strong>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                    完成人：{sample.testing_completed_by_name || sample.testing_completed_by || '-'}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {new Date(sample.testing_completed_at).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {sample.returned_at && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>📤 样品回收</strong>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                    回收人：{sample.returned_by_name || sample.returned_by || '-'}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {new Date(sample.returned_at).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {sample.notes && (
        <div style={{ marginTop: '20px' }}>
          <h3>备注信息</h3>
          <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '4px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
              {sample.notes}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
