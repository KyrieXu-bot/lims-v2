import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { extractSampleFlowToken } from '../../utils/sampleFlowToken.js';
import './SampleFlow.css';

const EVENT_META = {
  received: { title: '收样', icon: '收' }, transferred: { title: '实验室流转', icon: '转' }, stored: { title: '样品入库', icon: '库' }, returned: { title: '寄回委托方', icon: '回' }, disposed: { title: '样品销毁', icon: '销' },
};
const STATUS_TEXT = { pending: '待收样', in_progress: '流转中', stored: '已入库', returned: '已寄回', disposed: '已销毁' };
const formatTime = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
const itemTitle = (item) => [item.category_name, item.detail_name].filter(Boolean).join(' · ');
const itemsForDepartment = (items, departmentId) => items.filter((item) => Number(item.department_id) === Number(departmentId));

export default function SampleFlowScan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = extractSampleFlowToken(searchParams.get('token'));
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');
  const [adminDepartmentId, setAdminDepartmentId] = useState('');

  const load = async () => {
    if (!token) { setError('二维码中没有有效的样品流转 token。'); setLoading(false); return; }
    setLoading(true); setError('');
    try { setFlow(await api.getSampleFlow(token)); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const ownDepartmentId = Number(flow?.permissions?.user_department_id || 0) || null;
  const visited = useMemo(() => new Set(flow?.visited_department_ids || []), [flow]);
  const ownDepartment = flow?.required_departments?.find((department) => department.department_id === ownDepartmentId);
  const ownDepartmentPending = ownDepartment && !visited.has(ownDepartmentId);
  const selectedAdminDepartment = Number(adminDepartmentId || 0) || null;

  useEffect(() => {
    if (!flow?.permissions?.is_admin) return;
    const choices = flow.status === 'pending' ? flow.required_departments : flow.pending_departments;
    if (choices?.length && !choices.some((choice) => choice.department_id === selectedAdminDepartment)) setAdminDepartmentId(String(choices[0].department_id));
  }, [flow?.status, flow?.events?.length]);

  const submitEvent = async (eventType) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.addSampleFlowEvent(token, { event_type: eventType, department_id: flow.permissions.is_admin ? selectedAdminDepartment : undefined, notes });
      setFlow(result); setNotes(''); setNotice(`${EVENT_META[eventType]?.title || '流转'}登记成功`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="sample-flow-loading">正在读取二维码信息…</div>;
  if (!flow) return <div className="sample-flow-page"><button className="btn btn-secondary" onClick={() => navigate('/sample-management')}>← 返回样品管理</button><div className="sample-flow-alert" role="alert">{error || '无法读取样品流转信息'}</div></div>;

  const isTerminal = ['stored', 'returned', 'disposed'].includes(flow.status);
  const adminChoices = flow.status === 'pending' ? flow.required_departments : flow.pending_departments;
  const canReceive = flow.permissions.can_operate && flow.status === 'pending' && (flow.permissions.is_admin ? selectedAdminDepartment : ownDepartmentPending);
  const canTransfer = flow.permissions.can_operate && flow.status === 'in_progress' && !flow.terminal_ready && (flow.permissions.is_admin ? selectedAdminDepartment : ownDepartmentPending);

  return (
    <div className="sample-flow-page">
      <div className="sample-flow-detail-nav"><button className="btn btn-secondary" onClick={() => navigate('/sample-management')}>← 样品管理</button><button className="btn btn-secondary" onClick={load}>刷新</button></div>

      <section className="sample-flow-order-card">
        <div><div className="sample-flow-eyebrow">委托单样品流转</div><div className="sample-flow-order-title"><h2>{flow.order_id}</h2><span className={`sample-flow-status is-${flow.status}`}>{STATUS_TEXT[flow.status]}</span></div><p>二维码已关联 {flow.item_count} 个检测项目，节点顺序以实际扫码确认为准。</p></div>
        <div className="sample-flow-order-facts"><div><span>流程节点</span><strong>{flow.events.length}</strong></div><div><span>已到实验室</span><strong>{flow.visited_department_ids.length}/{flow.required_departments.length}</strong></div><div><span>当前位置</span><strong>{flow.status === 'stored' ? '样品库' : flow.status === 'returned' ? '委托方' : flow.status === 'disposed' ? '已处置' : flow.current_department_name || '待接收'}</strong></div></div>
      </section>

      {error && <div className="sample-flow-alert" role="alert">{error}</div>}{notice && <div className="sample-flow-notice" role="status">{notice}</div>}

      <section className="sample-flow-section">
        <div className="sample-flow-section-heading"><div><h3>流转路径</h3><p>每次确认都会追加一个不可覆盖的保管节点</p></div>{!isTerminal && flow.pending_departments.length > 0 && <span className="sample-flow-pending-copy">待到达：{flow.pending_departments.map((department) => department.department_name).join('、')}</span>}</div>
        <div className="sample-flow-timeline" aria-label="样品流转流程图">
          {flow.events.length === 0 && <div className="sample-flow-node is-pending"><div className="sample-flow-node-marker">待</div><div className="sample-flow-node-content"><span>起始节点</span><strong>等待实验室收样</strong><small>扫描二维码后确认样品与委托单一致</small></div></div>}
          {flow.events.map((event, index) => {
            const meta = EVENT_META[event.event_type] || { title: event.event_type, icon: index + 1 };
            const relatedItems = itemsForDepartment(flow.items, event.department_id);
            return <React.Fragment key={event.event_id}>{index > 0 && <div className="sample-flow-connector" aria-hidden="true"><span>→</span></div>}<article className={`sample-flow-node is-${event.event_type}`}><div className="sample-flow-node-marker">{meta.icon}</div><div className="sample-flow-node-content"><span>节点 {event.sequence_no}</span><strong>{meta.title}</strong><b>{event.event_type === 'stored' ? '样品库' : event.event_type === 'returned' ? '委托方' : event.event_type === 'disposed' ? '已完成处置' : event.department_name || '未指定实验室'}</b>{relatedItems.length > 0 && !['stored', 'returned', 'disposed'].includes(event.event_type) && <small>{relatedItems.map((item) => item.detail_name).join('、')}</small>}<small>{formatTime(event.created_at)} · {event.operator_name}</small>{event.notes && <em>{event.notes}</em>}</div></article></React.Fragment>;
          })}
          {!isTerminal && flow.events.length > 0 && <><div className="sample-flow-connector is-future" aria-hidden="true"><span>→</span></div><div className="sample-flow-node is-future"><div className="sample-flow-node-marker">{flow.terminal_ready ? '终' : '扫'}</div><div className="sample-flow-node-content"><span>下一节点</span><strong>{flow.terminal_ready ? '等待最终处置' : '等待下一实验室扫码'}</strong><small>{flow.terminal_ready ? '可选择入库、寄回或销毁' : `${flow.pending_departments.length} 个实验室尚未登记`}</small></div></div></>}
        </div>
      </section>

      {!isTerminal && <section className="sample-flow-action-card">
        <div className="sample-flow-action-copy"><div className="sample-flow-eyebrow">当前操作</div><h3>{flow.status === 'pending' ? '确认收样' : flow.terminal_ready ? '完成样品去向' : '登记实验室流转'}</h3><p>{flow.status === 'pending' ? '核对样品后，由当前实验室室主任确认接收。' : flow.terminal_ready ? '所有涉及实验室均已扫码，可结束本次保管链。' : ownDepartmentPending || flow.permissions.is_admin ? '确认后将按当前时间追加新的实验室节点。' : '当前账号所在实验室已经登记，请由下一个实验室室主任扫码。'}</p></div>
        {flow.permissions.can_operate ? <div className="sample-flow-action-form">
          {flow.permissions.is_admin && !flow.terminal_ready && adminChoices.length > 0 && <label>本次实验室<select value={adminDepartmentId} onChange={(event) => setAdminDepartmentId(event.target.value)}>{adminChoices.map((department) => <option key={department.department_id} value={department.department_id}>{department.department_name}</option>)}</select></label>}
          <label>交接备注（可选）<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="2" placeholder="如数量差异、包装情况、存放位置" /></label>
          {flow.status === 'pending' && <button className="btn btn-primary" disabled={!canReceive || saving} onClick={() => submitEvent('received')}>{saving ? '登记中…' : `确认收样${flow.permissions.is_admin ? '' : ownDepartment ? ` · ${ownDepartment.department_name}` : ''}`}</button>}
          {flow.status === 'in_progress' && !flow.terminal_ready && <button className="btn btn-primary" disabled={!canTransfer || saving} onClick={() => submitEvent('transferred')}>{saving ? '登记中…' : `确认到达${flow.permissions.is_admin ? '' : ownDepartment ? ` · ${ownDepartment.department_name}` : ''}`}</button>}
          {flow.terminal_ready && <div className="sample-flow-terminal-actions"><button className="btn btn-primary" disabled={saving} onClick={() => submitEvent('stored')}>确认入库</button><button className="btn btn-secondary" disabled={saving} onClick={() => submitEvent('returned')}>寄回委托方</button><button className="btn btn-danger" disabled={saving} onClick={() => submitEvent('disposed')}>确认销毁</button></div>}
        </div> : <div className="sample-flow-readonly">当前账号可查看流程；登记操作仅对室主任和管理员开放。</div>}
      </section>}

      <section className="sample-flow-section">
        <div className="sample-flow-section-heading"><div><h3>检测项目</h3><p>实验室节点由以下项目所属部门确定</p></div></div>
        <div className="sample-flow-items">{flow.items.map((item, index) => {
          const reached = visited.has(Number(item.department_id));
          return <article key={item.test_item_id}><div className="sample-flow-item-index">{String(index + 1).padStart(2, '0')}</div><div className="sample-flow-item-main"><strong>{itemTitle(item)}</strong><span>{[item.sample_name, item.original_no && `原号 ${item.original_no}`, item.quantity != null && `${item.quantity}${item.unit || '件'}`].filter(Boolean).join(' · ') || '未填写样品描述'}</span></div><div className="sample-flow-item-department"><span>{item.department_name || '未分配实验室'}</span><b className={reached ? 'is-reached' : ''}>{reached ? '已到达' : '待流转'}</b></div></article>;
        })}</div>
      </section>
    </div>
  );
}
