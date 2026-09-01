import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { buildSampleFlowPath, extractSampleFlowToken } from '../../utils/sampleFlowToken.js';
import './SampleFlow.css';

const STATUS_TEXT = {
  pending: '待收样', in_progress: '流转中', stored: '已入库', returned: '已寄回', disposed: '已销毁',
};

function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未开始';
}

export default function SampleManagement() {
  const navigate = useNavigate();
  const [scanValue, setScanValue] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listSampleFlows({ q, status, pageSize: 50 });
      setRows(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, status]);

  const openScannedFlow = (event) => {
    event.preventDefault();
    const token = extractSampleFlowToken(scanValue);
    if (!token) {
      setError('没有识别到有效的样品流转二维码，请重新扫描或粘贴完整链接。');
      return;
    }
    navigate(buildSampleFlowPath(token));
  };

  return (
    <div className="sample-flow-page">
      <div className="sample-flow-page-heading">
        <div>
          <div className="sample-flow-eyebrow">SAMPLE CUSTODY</div>
          <h2>样品流转</h2>
          <p>扫描委托单二维码，按实际交接顺序形成完整的样品保管链。</p>
        </div>
      </div>

      <form className="sample-flow-scan-panel" onSubmit={openScannedFlow}>
        <div className="sample-flow-scan-icon" aria-hidden="true">⌗</div>
        <div className="sample-flow-scan-field">
          <label htmlFor="sample-flow-scanner">扫码枪入口</label>
          <input id="sample-flow-scanner" className="input" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="请扫描二维码，或粘贴以 SF_ 开头的 token" autoFocus />
          <span>扫码枪回车后将自动打开对应流转单</span>
        </div>
        <button type="submit" className="btn btn-primary">打开流转单</button>
      </form>

      {error && <div className="sample-flow-alert" role="alert">{error}</div>}

      <section className="sample-flow-list-section">
        <div className="sample-flow-list-toolbar">
          <div><h3>最近流转单</h3><p>包含已生成二维码但尚未收样的委托单</p></div>
          <div className="sample-flow-list-filters">
            <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索委托单号、样品原号" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="流转状态">
              <option value="">全部状态</option><option value="pending">待收样</option><option value="in_progress">流转中</option><option value="stored">已入库</option><option value="returned">已寄回</option><option value="disposed">已销毁</option>
            </select>
          </div>
        </div>

        {loading ? <div className="sample-flow-empty">正在加载流转单…</div> : rows.length === 0 ? <div className="sample-flow-empty">暂无符合条件的样品流转单</div> : (
          <div className="sample-flow-table-wrap">
            <table className="sample-flow-table">
              <thead><tr><th>委托单</th><th>检测项目</th><th>当前状态</th><th>当前位置</th><th>节点</th><th>最后更新</th><th aria-label="操作" /></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.token} onClick={() => navigate(buildSampleFlowPath(row.token))}>
                  <td><strong>{row.order_id}</strong></td><td>{row.item_count} 项</td>
                  <td><span className={`sample-flow-status is-${row.status}`}>{STATUS_TEXT[row.status] || row.status}</span></td>
                  <td>{row.status === 'stored' ? '样品库' : row.status === 'returned' ? '委托方' : row.status === 'disposed' ? '已处置' : row.current_department_name || '待接收'}</td>
                  <td>{row.event_count || 0}</td><td>{formatTime(row.updated_at)}</td>
                  <td><button type="button" className="sample-flow-link-button">查看流程 →</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
