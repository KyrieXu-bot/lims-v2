import React, { useEffect, useState } from 'react';
import './OrderTransferRequestDetailModal.css';

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 按北京时间展示 YYYY-MM-DD HH:mm:ss（与 CommissionForm 导出等场景可读性一致） */
function formatDateTimeBeijing(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') {
    const dOnly = v.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dOnly) {
      return `${dOnly[1]} 00:00:00`;
    }
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

function formatArrivalMode(v) {
  if (v === null || v === undefined || v === '') return '—';
  const key = String(v).trim().toLowerCase().replace(/-/g, '_');
  if (key === 'on_site') return '现场';
  if (key === 'delivery') return '寄样';
  return String(v);
}

function formatSampleArrivalStatus(v) {
  if (v === null || v === undefined || v === '') return '—';
  const key = String(v).trim().toLowerCase().replace(/-/g, '_');
  if (key === 'arrived') return '已到';
  if (key === 'not_arrived') return '未到';
  return String(v);
}

/** 与 CommissionForm.jsx 状态列展示一致 */
function formatProjectStatus(v) {
  if (v === null || v === undefined || v === '') return '—';
  const key = String(v).trim().toLowerCase();
  const map = {
    new: '新建',
    assigned: '已分配',
    running: '进行中',
    completed: '已完成',
    cancelled: '已取消',
    outsource: '委外'
  };
  return map[key] ?? String(v);
}

const OrderTransferRequestDetailModal = ({ requestId, apiBase = '', onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        if (!user?.token) {
          setError('请先登录');
          return;
        }
        const base = typeof apiBase === 'string' ? apiBase.replace(/\/$/, '') : '';
        const res = await fetch(`${base}/api/order-transfer-requests/${requestId}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || '加载失败');
        }
        if (!cancelled) setPayload(data);
      } catch (e) {
        if (!cancelled) setError(e.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const req = payload?.request;
  const ti = payload?.test_item;

  const statusText =
    req?.status === 'pending'
      ? (req?.current_step === 'leader_review'
        ? '待室主任审批'
        : req?.current_step === 'sales_review'
          ? '待业务审批'
          : req?.current_step === 'xwf_review'
            ? '待许文凤审批'
            : '待处理')
      : req?.status === 'approved'
        ? '已同意'
        : req?.status === 'rejected'
          ? `已拒绝（${req?.rejected_by_name || req?.rejected_by || '未知'}）`
          : fmt(req?.status);
  const flowText =
    req?.approval_flow === 'leader_then_sales'
      ? '超期流程（组长 -> 室主任 -> 业务 -> 许文凤）'
      : '常规流程（实验室 -> 业务 -> 许文凤）';
  const stepText =
    req?.current_step === 'leader_review'
      ? '室主任审批中'
      : req?.current_step === 'sales_review'
        ? '业务审批中'
        : req?.current_step === 'xwf_review'
          ? '许文凤审批中'
        : req?.current_step === 'done'
          ? '流程结束'
          : fmt(req?.current_step);

  return (
    <div
      className="order-transfer-detail-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="order-transfer-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="order-transfer-detail-header">
          <h2>转单申请详情（只读）</h2>
          <button type="button" className="order-transfer-detail-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="order-transfer-detail-body">
          {loading && <p>加载中…</p>}
          {error && <p style={{ color: '#c00' }}>{error}</p>}
          {!loading && !error && req && (
            <>
              <div className="order-transfer-detail-section">
                <h3>申请信息</h3>
                <dl className="order-transfer-readonly-grid">
                  <dt>申请状态</dt>
                  <dd>{statusText}</dd>
                  <dt>审批流程</dt>
                  <dd>{flowText}</dd>
                  <dt>当前节点</dt>
                  <dd>{stepText}</dd>
                  <dt>拟转新单号</dt>
                  <dd>{fmt(req.target_order_id)}</dd>
                  <dt>转单原因</dt>
                  <dd>{fmt(req.transfer_reason)}</dd>
                  <dt>申请人</dt>
                  <dd>{fmt(req.applicant_name || req.applicant_id)}</dd>
                  <dt>申请时间</dt>
                  <dd>{formatDateTimeBeijing(req.created_at)}</dd>
                  {req.approved_at != null && req.approved_at !== '' && (
                    <>
                      <dt>同意时间</dt>
                      <dd>{formatDateTimeBeijing(req.approved_at)}</dd>
                    </>
                  )}
                  {req.rejected_at != null && req.rejected_at !== '' && (
                    <>
                      <dt>拒绝时间</dt>
                      <dd>{formatDateTimeBeijing(req.rejected_at)}</dd>
                    </>
                  )}
                </dl>
              </div>
              {ti && (
                <div className="order-transfer-detail-section">
                  <h3>原单检测项目信息</h3>
                  <dl className="order-transfer-readonly-grid">
                    <dt>委托单号</dt>
                    <dd>{fmt(ti.order_id)}</dd>
                    <dt>原单根单/转单</dt>
                    <dd>
                      {fmt(ti.original_order_id)} / {fmt(ti.root_order_id)}
                      {Number(ti.is_transferred) === 1 ? '（本单为转单号）' : ''}
                    </dd>
                    <dt>检测ID</dt>
                    <dd>{fmt(ti.test_item_id)}</dd>
                    <dt>检测项目</dt>
                    <dd>{fmt(ti.test_item_name || [ti.category_name, ti.detail_name].filter(Boolean).join(' - '))}</dd>
                    <dt>项目编号</dt>
                    <dd>{fmt(ti.test_code)}</dd>
                    <dt>客户 / 委托联系人</dt>
                    <dd>
                      {fmt(ti.customer_name)} {ti.customer_contact_name ? `｜${ti.customer_contact_name}` : ''}
                    </dd>
                    <dt>委托方</dt>
                    <dd>{fmt(ti.commissioner_name)}</dd>
                    <dt>业务负责人</dt>
                    <dd>{fmt(ti.assignee_name)}</dd>
                    <dt>负责人</dt>
                    <dd>{fmt(ti.supervisor_name)}</dd>
                    <dt>测试人员</dt>
                    <dd>{fmt(ti.technician_name)}</dd>
                    <dt>部门 / 组别</dt>
                    <dd>
                      {fmt(ti.department_name)} {ti.group_name ? `｜${ti.group_name}` : ''}
                    </dd>
                    <dt>顺序号</dt>
                    <dd>{fmt(ti.seq_no)}</dd>
                    <dt>样品名称</dt>
                    <dd>{fmt(ti.sample_name)}</dd>
                    <dt>材质</dt>
                    <dd>{fmt(ti.material)}</dd>
                    <dt>数量 / 单位</dt>
                    <dd>
                      {fmt(ti.quantity)} {ti.unit ? `｜${ti.unit}` : ''}
                    </dd>
                    <dt>服务加急</dt>
                    <dd>{fmt(ti.service_urgency)}</dd>
                    <dt>标准单价</dt>
                    <dd>{fmt(ti.standard_price)}</dd>
                    <dt>标准总价</dt>
                    <dd>{fmt(ti.line_total)}</dd>
                    <dt>测试总价</dt>
                    <dd>{fmt(ti.final_unit_price)}</dd>
                    <dt>实验室报价</dt>
                    <dd>{fmt(ti.lab_price)}</dd>
                    <dt>折扣</dt>
                    <dd>{fmt(ti.discount_rate)}</dd>
                    <dt>业务报价说明</dt>
                    <dd>{fmt(ti.price_note)}</dd>
                    <dt>计费数量</dt>
                    <dd>{fmt(ti.actual_sample_quantity)}</dd>
                    <dt>测试工时 / 机时</dt>
                    <dd>
                      {fmt(ti.work_hours)} / {fmt(ti.machine_hours)}
                    </dd>
                    <dt>设备</dt>
                    <dd>{fmt(ti.equipment_name)}</dd>
                    <dt>现场测试时间</dt>
                    <dd>{formatDateTimeBeijing(ti.field_test_time)}</dd>
                    <dt>实际交付日期</dt>
                    <dd>{formatDateTimeBeijing(ti.actual_delivery_date)}</dd>
                    <dt>样品到达方式</dt>
                    <dd>{formatArrivalMode(ti.arrival_mode)}</dd>
                    <dt>样品是否已到</dt>
                    <dd>{formatSampleArrivalStatus(ti.sample_arrival_status)}</dd>
                    <dt>项目状态</dt>
                    <dd>{formatProjectStatus(ti.status)}</dd>
                    <dt>异常情况</dt>
                    <dd>{fmt(ti.abnormal_condition)}</dd>
                    <dt>加测</dt>
                    <dd>
                      {ti.is_add_on === 1 || ti.is_add_on === 2
                        ? `是（${ti.is_add_on === 2 ? '复制加测' : '普通加测'}）`
                        : '否'}
                    </dd>
                    <dt>指派备注</dt>
                    <dd>{fmt(ti.assignment_note)}</dd>
                    <dt>实验备注</dt>
                    <dd>{fmt(ti.test_notes)}</dd>
                    <dt>业务备注</dt>
                    <dd>{fmt(ti.business_note)}</dd>
                    <dt>开票备注</dt>
                    <dd>{fmt(ti.invoice_note)}</dd>
                    <dt>内部备注</dt>
                    <dd>{fmt(ti.note)}</dd>
                    <dt>收样日期</dt>
                    <dd>{formatDateTimeBeijing(ti.order_created_at)}</dd>
                    <dt>开单日期</dt>
                    <dd>{formatDateTimeBeijing(ti.test_item_created_at)}</dd>
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
        <div className="order-transfer-detail-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderTransferRequestDetailModal;
