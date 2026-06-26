import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../api.js';
import DetailViewLink from '../../components/DetailViewLink.jsx';
import '../commission/CommissionForm.css';

const REPORT_TYPE_OPTIONS = [
  { value: 1, label: '测试图片或数据汇总(无需测试报告) Test pictures or data summaries(No test report)' },
  { value: 2, label: '中文报告 Chinese report' },
  { value: 3, label: '英文报告 English report' },
  { value: 4, label: '仅电子版报告' },
  { value: 5, label: '电子版+纸质版报告' },
  { value: 6, label: '中英文对照报告Chinese-English bilingual report' },
];

const REPORT_TYPE_SHORT = {
  1: '测试图片/数据汇总',
  2: '中文报告',
  3: '英文报告',
  4: '仅电子版',
  5: '电子版+纸质',
  6: '中英文对照',
};

const HEADER_LABELS = {
  1: '同委托方名称和地址 Same as applicant',
  2: '其他 (地址/收件人/电话) Others (Address/Recipient/Tel)',
};

const FORMAT_LABELS = {
  1: '一份委托单对应一个报告 One application Form To a Report',
  2: '每一个项目对应一份报告 Each Item Corresponds To a Report',
};

const SHIPPING_LABELS = { 1: '委托方', 2: '付款方', 3: '其它' };

const SEAL_FILTER_OPTIONS = [
  { value: 'cnas', label: 'CNAS' },
  { value: 'cma', label: 'CMA' },
  { value: 'normal', label: '普通报告' },
];

const SAMPLE_TYPE_NUM_TO_CN = { 1: '板材', 2: '棒材', 3: '粉末', 4: '液体', 5: '其他' };

function normalizeJsonArray(val) {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatSampleTypes(raw) {
  if (!raw || !String(raw).trim()) return '';
  return (
    String(raw)
      .split(',')
      .map((t) => {
        const tok = t.trim();
        if (!tok) return '';
        const n = Number(tok);
        if (Number.isInteger(n) && SAMPLE_TYPE_NUM_TO_CN[n]) return SAMPLE_TYPE_NUM_TO_CN[n];
        return tok;
      })
      .filter(Boolean)
      .join('、') || ''
  );
}

/** 弹窗内展示完整文案（每行一项） */
function formatReportTypesFull(rt) {
  const arr = normalizeJsonArray(rt)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  if (!arr.length) return '';
  return arr
    .map((n) => REPORT_TYPE_OPTIONS.find((o) => o.value === n)?.label || String(n))
    .join('\n');
}

const SEAL_ORDER = ['normal', 'cnas', 'cma'];
const SEAL_LABELS = { normal: '普通报告', cnas: 'CNAS', cma: 'CMA' };

function formatSealsText(seals) {
  const arr = normalizeJsonArray(seals)
    .map((s) => String(s).toLowerCase())
    .filter(Boolean);
  if (!arr.length) return '';
  return SEAL_ORDER.filter((k) => arr.includes(k))
    .map((k) => SEAL_LABELS[k])
    .join('、');
}

function fmtDt(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 19);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function FilterMultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder,
  width = 180,
  open,
  onToggle,
  wrapRef,
}) {
  const toggle = (v) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };

  return (
    <div className="filter-group">
      <label>{label}:</label>
      <div className="status-multiselect-wrapper" ref={wrapRef} style={{ position: 'relative' }}>
        <div
          className="status-multiselect-input"
          onClick={() => onToggle(!open)}
          style={{
            width,
            padding: '6px 10px',
            border: '1px solid #ddd',
            borderRadius: 4,
            fontSize: 13,
            backgroundColor: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 32,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ flex: 1, color: values.length === 0 ? '#999' : '#333', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {values.length === 0 ? (
              placeholder
            ) : (
              values.map((val) => {
                const opt = options.find((o) => o.value === val);
                return (
                  <span
                    key={val}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#e7f3ff',
                      border: '1px solid #b3d9ff',
                      borderRadius: 3,
                      fontSize: 11,
                      display: 'inline-block',
                    }}
                  >
                    {opt?.label ?? val}
                  </span>
                );
              })
            )}
          </span>
          <span style={{ marginLeft: 8, color: '#666' }}>{open ? '▲' : '▼'}</span>
        </div>
        {open && (
          <div
            className="status-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              border: '1px solid #ddd',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 2000,
              marginTop: 4,
              maxHeight: 240,
              overflowY: 'auto',
              width,
            }}
          >
            {options.map((opt) => {
              const isSelected = values.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(opt.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#e7f3ff' : '#fff',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <input type="checkbox" checked={isSelected} readOnly style={{ cursor: 'pointer' }} />
                  <span>{opt.label}</span>
                </div>
              );
            })}
            {values.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid #ddd', backgroundColor: '#f8f9fa' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    fontSize: 12,
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    color: '#666',
                  }}
                >
                  清除所有选择
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportManagement() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const isAdmin = user?.role === 'admin';
  const canAccess = user?.token && (user?.role === 'admin' || user?.role === 'viewer');

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sealFilter, setSealFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [sealDropdownOpen, setSealDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const sealRef = useRef(null);
  const typeRef = useRef(null);

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);

  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onDoc(e) {
      if (sealRef.current?.contains(e.target)) return;
      if (typeRef.current?.contains(e.target)) return;
      setSealDropdownOpen(false);
      setTypeDropdownOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listReportsManagement({
        q: appliedQuery,
        page,
        pageSize,
        seal: sealFilter,
        report_type: typeFilter,
      });
      setData(res.data || []);
      setTotal(res.total ?? 0);
    } catch (e) {
      console.error(e);
      alert(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, pageSize, sealFilter, typeFilter]);

  useEffect(() => {
    if (!canAccess) return;
    fetchData();
  }, [canAccess, fetchData]);

  if (!user?.token) {
    return <Navigate to="/login" replace />;
  }
  if (!canAccess) {
    return <Navigate to="/commission-form" replace />;
  }

  const handleSearch = () => {
    setPage(1);
    setAppliedQuery(searchQuery.trim());
  };

  const handleReset = () => {
    setSearchQuery('');
    setAppliedQuery('');
    setSealFilter([]);
    setTypeFilter([]);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openEdit = (row) => {
    setSealDropdownOpen(false);
    setTypeDropdownOpen(false);
    setEditRow(row);
    const types = normalizeJsonArray(row.report_type)
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
    const seals = normalizeJsonArray(row.report_seals)
      .map((s) => String(s).toLowerCase())
      .filter((s) => ['normal', 'cnas', 'cma'].includes(s));
    setForm({
      report_type: types,
      report_seals: [...new Set(seals)],
      paper_report_shipping_type:
        row.paper_report_shipping_type === null || row.paper_report_shipping_type === undefined
          ? ''
          : String(row.paper_report_shipping_type),
      report_additional_info: row.report_additional_info ?? '',
      header_type: row.header_type === null || row.header_type === undefined ? '' : String(row.header_type),
      header_other: row.header_other ?? '',
      format_type: row.format_type === null || row.format_type === undefined ? '' : String(row.format_type),
    });
  };

  const closeEdit = () => {
    setEditRow(null);
    setForm(null);
  };

  const saveEdit = async () => {
    if (!editRow || !form) return;
    setSaving(true);
    try {
      await api.updateReportManagement(editRow.order_id, {
        report_type: form.report_type,
        report_seals: form.report_seals,
        paper_report_shipping_type: form.paper_report_shipping_type === '' ? null : Number(form.paper_report_shipping_type),
        report_additional_info: form.report_additional_info || null,
        header_type: form.header_type === '' ? null : Number(form.header_type),
        header_other: form.header_other || null,
        format_type: form.format_type === '' ? null : Number(form.format_type),
      });
      closeEdit();
      fetchData();
    } catch (e) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleFormType = (n) => {
    setForm((f) => {
      if (!f) return f;
      const has = f.report_type.includes(n);
      return {
        ...f,
        report_type: has ? f.report_type.filter((x) => x !== n) : [...f.report_type, n].sort((a, b) => a - b),
      };
    });
  };

  const toggleFormSeal = (s) => {
    setForm((f) => {
      if (!f) return f;
      const has = f.report_seals.includes(s);
      return {
        ...f,
        report_seals: has ? f.report_seals.filter((x) => x !== s) : [...f.report_seals, s],
      };
    });
  };

  return (
    <div className="commission-form">
      <div className={`filters ${editRow ? 'filters-behind-modal' : ''}`}>
        <div className="filter-row">
          <div className="filter-group search-group">
            <label>搜索:</label>
            <div className="search-input-container">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="委托单号、客户名称、委托方名称、委托人…"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <div className="search-buttons">
                <button type="button" onClick={handleSearch} className="btn btn-primary btn-small">
                  搜索
                </button>
                <button type="button" onClick={handleReset} className="btn btn-secondary btn-small">
                  重置
                </button>
              </div>
            </div>
          </div>

          <FilterMultiSelect
            label="印章"
            options={SEAL_FILTER_OPTIONS}
            values={sealFilter}
            onChange={(v) => {
              setSealFilter(v);
              setPage(1);
            }}
            placeholder="印章 (多选)"
            width={200}
            open={sealDropdownOpen}
            onToggle={(v) => {
              setSealDropdownOpen(v);
              if (v) setTypeDropdownOpen(false);
            }}
            wrapRef={sealRef}
          />

          <FilterMultiSelect
            label="报告文档类型"
            options={REPORT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: `${o.value}. ${REPORT_TYPE_SHORT[o.value]}` }))}
            values={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            placeholder="文档类型 (多选)"
            width={220}
            open={typeDropdownOpen}
            onToggle={(v) => {
              setTypeDropdownOpen(v);
              if (v) setSealDropdownOpen(false);
            }}
            wrapRef={typeRef}
          />
        </div>
      </div>

      <div className="table-container">
        <div className="table-wrapper">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>加载中…</div>
          ) : (
            <table className="data-table" style={{ minWidth: 1200, fontSize: 13 }}>
              <thead>
                <tr>
                  <th>委托单号</th>
                  <th>客户</th>
                  <th>委托方</th>
                  <th style={{ minWidth: 140 }}>报告文档类型</th>
                  <th>印章</th>
                  <th style={{ minWidth: 120 }}>报告抬头</th>
                  <th style={{ minWidth: 120 }}>报告版式</th>
                  <th>纸质寄送</th>
                  <th style={{ minWidth: 100 }}>纸质补充</th>
                  <th style={{ minWidth: 100 }}>抬头其它</th>
                  <th style={{ minWidth: 100 }}>样品类型</th>
                  <th>更新时间</th>
                  <th className="fixed-right" style={{ minWidth: 100 }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: 24, color: '#888' }}>
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.order_id}>
                      <td style={{ whiteSpace: 'nowrap', maxWidth: 120 }}>{row.order_id}</td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 140 }}>
                        <DetailViewLink text={row.customer_name || ''} maxLength={16} fieldName="客户" className="report-mgmt-detail-cell" />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 140 }}>
                        <DetailViewLink
                          text={row.commissioner_display || ''}
                          maxLength={16}
                          fieldName="委托方"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 160 }}>
                        <DetailViewLink
                          text={formatReportTypesFull(row.report_type)}
                          maxLength={22}
                          fieldName="报告文档类型"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 110 }}>
                        <DetailViewLink
                          text={formatSealsText(row.report_seals)}
                          maxLength={14}
                          fieldName="印章（CNAS / CMA / 普通报告）"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 160 }}>
                        <DetailViewLink
                          text={
                            row.header_type
                              ? HEADER_LABELS[row.header_type] || String(row.header_type)
                              : ''
                          }
                          maxLength={20}
                          fieldName="报告抬头"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 160 }}>
                        <DetailViewLink
                          text={
                            row.format_type ? FORMAT_LABELS[row.format_type] || String(row.format_type) : ''
                          }
                          maxLength={20}
                          fieldName="报告版式"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 88 }}>
                        <DetailViewLink
                          text={
                            row.paper_report_shipping_type
                              ? SHIPPING_LABELS[row.paper_report_shipping_type] ||
                                String(row.paper_report_shipping_type)
                              : ''
                          }
                          maxLength={8}
                          fieldName="纸质报告寄送方式"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 160 }}>
                        <DetailViewLink
                          text={row.report_additional_info || ''}
                          maxLength={24}
                          fieldName="纸质报告补充信息 / 地址"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 160 }}>
                        <DetailViewLink
                          text={row.header_other || ''}
                          maxLength={24}
                          fieldName="报告抬头其它说明"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td className="report-mgmt-detail-td" style={{ maxWidth: 130 }}>
                        <DetailViewLink
                          text={formatSampleTypes(row.sample_types_raw)}
                          maxLength={18}
                          fieldName="样品类型"
                          className="report-mgmt-detail-cell"
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap', maxWidth: 170 }}>
                        {fmtDt(row.report_updated_at) || <span className="text-muted">-</span>}
                      </td>
                      <td className="fixed-right" style={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                        {isAdmin ? (
                          <button type="button" className="btn btn-primary btn-small" onClick={() => openEdit(row)}>
                            修改
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="report-management-pagination-bar">
          <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="report-page-info">
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {editRow && form && (
        <div className="file-modal-overlay" style={{ padding: 16 }} onMouseDown={closeEdit}>
          <div
            className="page-header"
            style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', margin: 0, position: 'relative', zIndex: 1 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, fontSize: 18 }}>修改报告设置 — {editRow.order_id}</h2>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>报告文档类型（可多选）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {REPORT_TYPE_OPTIONS.map((o) => (
                  <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.report_type.includes(o.value)}
                      onChange={() => toggleFormType(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>印章</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {SEAL_FILTER_OPTIONS.map((o) => (
                  <label key={o.value} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.report_seals.includes(o.value)} onChange={() => toggleFormSeal(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
               <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>报告抬头</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={form.header_type}
                onChange={(e) => setForm((f) => ({ ...f, header_type: e.target.value }))}
              >
                <option value="">未选择</option>
                <option value="1">{HEADER_LABELS[1]}</option>
                <option value="2">{HEADER_LABELS[2]}</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>抬头其它说明</label>
              <textarea
                className="input"
                rows={2}
                style={{ width: '100%' }}
                value={form.header_other}
                onChange={(e) => setForm((f) => ({ ...f, header_other: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>报告版式</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={form.format_type}
                onChange={(e) => setForm((f) => ({ ...f, format_type: e.target.value }))}
              >
                <option value="">未选择</option>
                <option value="1">{FORMAT_LABELS[1]}</option>
                <option value="2">{FORMAT_LABELS[2]}</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>纸质报告寄送方式</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={form.paper_report_shipping_type}
                onChange={(e) => setForm((f) => ({ ...f, paper_report_shipping_type: e.target.value }))}
              >
                <option value="">未选择</option>
                <option value="1">{SHIPPING_LABELS[1]}</option>
                <option value="2">{SHIPPING_LABELS[2]}</option>
                <option value="3">{SHIPPING_LABELS[3]}</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>纸质报告补充信息 / 地址</label>
              <textarea
                className="input"
                rows={2}
                style={{ width: '100%' }}
                value={form.report_additional_info}
                onChange={(e) => setForm((f) => ({ ...f, report_additional_info: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={saving}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
