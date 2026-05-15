import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import './MobileStatistics.css';

const STATS_ROLES = new Set(['leader', 'supervisor', 'employee']);

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatHours = (value) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const formatOrderCount = (value) =>
  Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

const formatChineseStatDate = (value) => {
  if (value == null || value === '') return '-';
  const str = String(value);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return str;
};

const getDefaultRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  };
};

const QUICK_RANGE_OPTIONS = [
  { key: 'thisWeek', label: '本周' },
  { key: 'thisMonth', label: '本月' },
  { key: 'thisQuarter', label: '本季度' },
  { key: 'thisYear', label: '本年' }
];

const computeQuickRange = (type) => {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (type === 'thisWeek') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    return { from: start.toISOString().slice(0, 10), to: end };
  }
  if (type === 'thisQuarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), currentQuarter * 3, 1);
    return { from: start.toISOString().slice(0, 10), to: end };
  }
  if (type === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString().slice(0, 10), to: end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString().slice(0, 10), to: end };
};

function rowMatchesListSearch(row, qRaw) {
  const q = (qRaw || '').trim().toLowerCase();
  if (!q) return true;
  const parts = [row.name, row.group_name, row.equipment_name, row.date, row.user_id]
    .filter((x) => x != null && x !== '')
    .map((x) => String(x).toLowerCase());
  return parts.some((p) => p.includes(q));
}

function MultiSeriesBarChart({
  data = [],
  series = [],
  getKey = (item, index) => item?.user_id || item?.date || index,
  getLabel = (item) => item?.name || item?.group_name || item?.equipment_name || item?.date || '-',
  emptyText = '暂无数据'
}) {
  const values = data.flatMap((item) => series.map((s) => Number(item?.[s.key] || 0)));
  const positiveValues = values.filter((v) => v > 0);
  const maxValue = positiveValues.length > 0 ? Math.max(...positiveValues) : 0;

  if (!data.length || maxValue <= 0) {
    return <div className="mstats-empty">{emptyText}</div>;
  }

  return (
    <div className="mstats-chart">
      <div className="mstats-chart-content">
        {data.map((item, index) => {
          const itemKey = getKey(item, index);
          return (
            <div className="mstats-chart-column" key={itemKey}>
              <div className="mstats-chart-bar">
                {series.map((s) => {
                  const rawValue = Number(item?.[s.key] || 0);
                  const barHeight = rawValue > 0 ? Math.max(8, (rawValue / maxValue) * 100) : 0;
                  const formatter = s.formatter || ((v) => Number(v || 0).toLocaleString('zh-CN'));
                  return (
                    <div
                      key={s.key}
                      className="mstats-chart-bar-segment"
                      style={{ height: `${barHeight}%`, backgroundColor: s.color }}
                      title={`${s.label}：${formatter(rawValue)}`}
                    >
                      {rawValue > 0 && <span>{formatter(rawValue)}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mstats-chart-label" title={getLabel(item)}>
                {getLabel(item)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mstats-chart-legend">
        {series.map((s) => (
          <div key={s.key} className="mstats-chart-legend-item">
            <span style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MobileStatistics() {
  const initialRangeRef = useRef(getDefaultRange());
  const [fromDate, setFromDate] = useState(initialRangeRef.current.from);
  const [toDate, setToDate] = useState(initialRangeRef.current.to);
  const [jcPrefix, setJcPrefix] = useState('');
  const [jcPrefixOptions, setJcPrefixOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [filterOpen, setFilterOpen] = useState(true);
  const [listSearch, setListSearch] = useState('');

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('lims_user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const canView = STATS_ROLES.has(user?.role);

  const isRangeValid = useMemo(() => {
    if (jcPrefix) return true;
    if (!fromDate || !toDate) return false;
    return new Date(fromDate) <= new Date(toDate);
  }, [fromDate, toDate, jcPrefix]);

  const loadData = useCallback(
    async ({ from, to } = {}) => {
      const targetFrom = jcPrefix ? undefined : (from || fromDate);
      const targetTo = jcPrefix ? undefined : (to || toDate);
      setLoading(true);
      setError('');
      try {
        const result = await api.getStatisticsSummary({
          from: targetFrom,
          to: targetTo,
          jc_prefix: jcPrefix || undefined
        });
        setData(result);
      } catch (err) {
        setData(null);
        setError(err?.message || '获取统计数据失败，请稍后再试');
      } finally {
        setLoading(false);
      }
    },
    [fromDate, toDate, jcPrefix]
  );

  useEffect(() => {
    if (!canView) return;
    loadData(initialRangeRef.current);
  }, [canView, loadData]);

  useEffect(() => {
    if (!canView) return;
    const loadJCPrefixes = async () => {
      try {
        const prefixes = await api.getJCPrefixes();
        setJcPrefixOptions(prefixes);
      } catch (err) {
        console.error('获取JC号前缀列表失败:', err);
      }
    };
    loadJCPrefixes();
  }, [canView]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!jcPrefix) {
      if (!isRangeValid) {
        setError('开始日期不能晚于结束日期');
        return;
      }
    }
    loadData();
  };

  const handleQuickRange = (key) => {
    if (jcPrefix) setJcPrefix('');
    const range = computeQuickRange(key);
    setFromDate(range.from);
    setToDate(range.to);
    loadData(range);
  };

  const handleJcPrefixChange = (value) => {
    setJcPrefix(value);
    if (value) {
      setFromDate('');
      setToDate('');
    }
  };

  const handleDateChange = (type, value) => {
    if (type === 'from') setFromDate(value);
    else setToDate(value);
    if (jcPrefix) setJcPrefix('');
  };

  const role = data?.role || user?.role;
  const detail = data?.detail;

  const summaryCards = useMemo(() => {
    if (!detail) return [];
    if (role === 'leader') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总合同额（元）', value: formatCurrency(detail.summary.final_unit_price) },
        { label: '实验室报价（元）', value: formatCurrency(detail.summary.lab_price) },
        { label: '委托单总数', value: formatOrderCount(detail.summary.order_count) },
        { label: '总工时（小时）', value: formatHours(detail.summary.work_hours) },
        { label: '总机时（小时）', value: formatHours(detail.summary.machine_hours) }
      ];
    }
    if (role === 'supervisor') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总合同额（元）', value: formatCurrency(detail.summary.final_unit_price) },
        { label: '实验室报价（元）', value: formatCurrency(detail.summary.lab_price) },
        { label: '委托单总数', value: formatOrderCount(detail.summary.order_count) },
        { label: '总工时（小时）', value: formatHours(detail.summary.work_hours) }
      ];
    }
    if (role === 'employee') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总合同额（元）', value: formatCurrency(detail.summary.final_unit_price) },
        { label: '实验室报价（元）', value: formatCurrency(detail.summary.lab_price) },
        { label: '委托单总数', value: formatOrderCount(detail.summary.order_count) },
        { label: '总机时（小时）', value: formatHours(detail.summary.machine_hours) }
      ];
    }
    return [];
  }, [detail, role]);

  const filteredSupervisors = useMemo(
    () => (detail?.supervisors || []).filter((r) => rowMatchesListSearch(r, listSearch)),
    [detail?.supervisors, listSearch]
  );
  const filteredEmployees = useMemo(
    () => (detail?.employees || []).filter((r) => rowMatchesListSearch(r, listSearch)),
    [detail?.employees, listSearch]
  );
  const filteredEquipment = useMemo(
    () => (detail?.equipment || []).filter((r) => rowMatchesListSearch(r, listSearch)),
    [detail?.equipment, listSearch]
  );
  const filteredMembers = useMemo(
    () => (detail?.members || []).filter((r) => rowMatchesListSearch(r, listSearch)),
    [detail?.members, listSearch]
  );
  const filteredDaily = useMemo(
    () => (detail?.daily || []).filter((r) => rowMatchesListSearch(r, listSearch)),
    [detail?.daily, listSearch]
  );

  if (!canView) {
    return (
      <div className="mstats-page">
        <div className="mstats-no-access">
          <p>当前账号无「数据统计」权限（仅组长、带组与实验员可使用）。</p>
          <Link to="/mobile/commission-form" className="mstats-link-btn">
            返回委托单
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mstats-page">
      <div className="mstats-title-block">
        <h2>数据统计</h2>
        <p className="mstats-subtitle">筛选时间段或 JC 号，查看金额、工时/机时及图表；下方可搜索列表中的姓名、组或设备。</p>
      </div>

      <button
        type="button"
        className={`mstats-filter-toggle ${filterOpen ? 'open' : ''}`}
        onClick={() => setFilterOpen((o) => !o)}
        aria-expanded={filterOpen}
      >
        <span>筛选与查询</span>
        <span className="mstats-chevron">▼</span>
      </button>

      {filterOpen && (
        <form className="mstats-filter-panel" onSubmit={handleSubmit}>
          <div className="mstats-row-dates">
            <div className="mstats-field">
              <label htmlFor="mstats-from">开始日期</label>
              <input
                id="mstats-from"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => handleDateChange('from', e.target.value)}
                disabled={!!jcPrefix}
                required={!jcPrefix}
              />
            </div>
            <div className="mstats-field">
              <label htmlFor="mstats-to">结束日期</label>
              <input
                id="mstats-to"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => handleDateChange('to', e.target.value)}
                disabled={!!jcPrefix}
                required={!jcPrefix}
              />
            </div>
          </div>
          <div className="mstats-field">
            <label htmlFor="mstats-jc">JC 号前缀</label>
            <select id="mstats-jc" value={jcPrefix} onChange={(e) => handleJcPrefixChange(e.target.value)}>
              <option value="">全部（按日期）</option>
              {jcPrefixOptions.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>
          <div className="mstats-quick-row">
            {QUICK_RANGE_OPTIONS.map((item) => (
              <button type="button" key={item.key} onClick={() => handleQuickRange(item.key)} disabled={!!jcPrefix}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mstats-submit-row">
            <button type="submit" className="mstats-btn-primary" disabled={loading || !isRangeValid}>
              {loading ? '加载中…' : '查询'}
            </button>
          </div>
        </form>
      )}

      {!isRangeValid && !jcPrefix && (
        <div className="mstats-error">请选择正确的时间范围：开始日期不能晚于结束日期。</div>
      )}
      {jcPrefix && <div className="mstats-info">当前按 JC 号「{jcPrefix}」筛选（已忽略日期范围）。</div>}
      {error && <div className="mstats-error">{error}</div>}

      {loading && (
        <div className="mstats-loading">
          <span className="spinner" />
          <span>统计数据加载中…</span>
        </div>
      )}

      {!loading && detail && (
        <>
          <div className="mstats-search-bar">
            <div className="mstats-search-input-wrap">
              <span aria-hidden>🔍</span>
              <input
                type="search"
                enterKeyHint="search"
                placeholder="搜索姓名、组名、设备或日期…"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="mstats-summary">
            {summaryCards.map((card) => (
              <div key={card.label} className="mstats-card">
                <span className="title">{card.label}</span>
                <span className="value">{card.value}</span>
              </div>
            ))}
          </div>

          {role === 'leader' && (
            <>
              <section className="mstats-section">
                <div className="mstats-section-header">
                  <h3>组长情况</h3>
                  <div className="mstats-section-sub">部门 ID：{detail.scope.department_id ?? '-'}</div>
                </div>
                <MultiSeriesBarChart
                  data={filteredSupervisors}
                  series={[
                    { key: 'line_total', label: '委托额', color: '#4e79a7', formatter: formatCurrency },
                    { key: 'final_unit_price', label: '合同额', color: '#76b7b2', formatter: formatCurrency },
                    { key: 'lab_price', label: '实验室报价', color: '#edc949', formatter: formatCurrency },
                    { key: 'work_hours', label: '工时', color: '#f28e2b', formatter: formatHours }
                  ]}
                  getLabel={(item) => item.name || '-'}
                  emptyText="暂无组长数据"
                />
                <div className="mstats-data-list">
                  {filteredSupervisors.length === 0 ? (
                    <div className="mstats-empty">暂无数据</div>
                  ) : (
                    filteredSupervisors.map((item) => (
                      <div key={item.user_id} className="mstats-data-card">
                        <div className="mstats-data-card-title">{item.name}</div>
                        <div className="mstats-data-card-meta">所属组：{item.group_name || '-'}</div>
                        <div className="mstats-metric-grid">
                          <div className="mstats-metric">
                            <span className="k">总委托额</span>
                            <span className="v">{formatCurrency(item.line_total)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">总合同额</span>
                            <span className="v">{formatCurrency(item.final_unit_price)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">实验室报价</span>
                            <span className="v">{formatCurrency(item.lab_price)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">委托单数</span>
                            <span className="v">{formatOrderCount(item.order_count)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">总工时</span>
                            <span className="v">{formatHours(item.work_hours)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="mstats-section">
                <div className="mstats-section-header">
                  <h3>员工情况</h3>
                  <div className="mstats-section-sub">部门下实验员</div>
                </div>
                <MultiSeriesBarChart
                  data={filteredEmployees}
                  series={[
                    { key: 'line_total', label: '委托额', color: '#4e79a7', formatter: formatCurrency },
                    { key: 'final_unit_price', label: '合同额', color: '#76b7b2', formatter: formatCurrency },
                    { key: 'lab_price', label: '实验室报价', color: '#edc949', formatter: formatCurrency },
                    { key: 'work_hours', label: '工时', color: '#59a14f', formatter: formatHours },
                    { key: 'machine_hours', label: '机时', color: '#e15759', formatter: formatHours }
                  ]}
                  getLabel={(item) => item.name || '-'}
                  emptyText="暂无员工数据"
                />
                <div className="mstats-data-list">
                  {filteredEmployees.length === 0 ? (
                    <div className="mstats-empty">暂无数据</div>
                  ) : (
                    filteredEmployees.map((item) => (
                      <div key={item.user_id} className="mstats-data-card">
                        <div className="mstats-data-card-title">{item.name}</div>
                        <div className="mstats-data-card-meta">所属组：{item.group_name || '-'}</div>
                        <div className="mstats-metric-grid">
                          <div className="mstats-metric">
                            <span className="k">总委托额</span>
                            <span className="v">{formatCurrency(item.line_total)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">总合同额</span>
                            <span className="v">{formatCurrency(item.final_unit_price)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">实验室报价</span>
                            <span className="v">{formatCurrency(item.lab_price)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">委托单数</span>
                            <span className="v">{formatOrderCount(item.order_count)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">总工时</span>
                            <span className="v">{formatHours(item.work_hours)}</span>
                          </div>
                          <div className="mstats-metric">
                            <span className="k">总机时</span>
                            <span className="v">{formatHours(item.machine_hours)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="mstats-section">
                <div className="mstats-section-header">
                  <h3>设备机时</h3>
                  <div className="mstats-section-sub">仅展示有机时记录的设备</div>
                </div>
                <MultiSeriesBarChart
                  data={filteredEquipment}
                  series={[{ key: 'machine_hours', label: '机时', color: '#e15759', formatter: formatHours }]}
                  getLabel={(item) => item.equipment_name || '未指定设备'}
                  emptyText="暂无设备机时数据"
                />
                <div className="mstats-data-list">
                  {filteredEquipment.length === 0 ? (
                    <div className="mstats-empty">暂无数据</div>
                  ) : (
                    filteredEquipment.map((item) => (
                      <div key={item.equipment_id || item.equipment_name} className="mstats-data-card">
                        <div className="mstats-data-card-title">{item.equipment_name}</div>
                        <div className="mstats-metric-grid">
                          <div className="mstats-metric">
                            <span className="k">总机时</span>
                            <span className="v">{formatHours(item.machine_hours)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}

          {role === 'supervisor' && (
            <section className="mstats-section">
              <div className="mstats-section-header">
                <h3>小组成员情况</h3>
                <div className="mstats-section-sub">
                  组 ID：{detail.scope.group_id ?? '-'}，组长 ID：{detail.scope.supervisor_id ?? '-'}
                </div>
              </div>
              <MultiSeriesBarChart
                data={filteredMembers}
                series={[
                  { key: 'line_total', label: '委托额', color: '#4e79a7', formatter: formatCurrency },
                  { key: 'final_unit_price', label: '合同额', color: '#76b7b2', formatter: formatCurrency },
                  { key: 'lab_price', label: '实验室报价', color: '#edc949', formatter: formatCurrency },
                  { key: 'work_hours', label: '工时', color: '#f28e2b', formatter: formatHours }
                ]}
                getLabel={(item) => item.name || '-'}
                emptyText="暂无组员数据"
              />
              <div className="mstats-data-list">
                {filteredMembers.length === 0 ? (
                  <div className="mstats-empty">暂无数据</div>
                ) : (
                  filteredMembers.map((item) => (
                    <div key={item.user_id} className="mstats-data-card">
                      <div className="mstats-data-card-title">{item.name}</div>
                      <div className="mstats-metric-grid">
                        <div className="mstats-metric">
                          <span className="k">总委托额</span>
                          <span className="v">{formatCurrency(item.line_total)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">总合同额</span>
                          <span className="v">{formatCurrency(item.final_unit_price)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">实验室报价</span>
                          <span className="v">{formatCurrency(item.lab_price)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">委托单数</span>
                          <span className="v">{formatOrderCount(item.order_count)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">总工时</span>
                          <span className="v">{formatHours(item.work_hours)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {role === 'employee' && (
            <section className="mstats-section">
              <div className="mstats-section-header">
                <h3>每日完成情况</h3>
                <div className="mstats-section-sub">实验员 ID：{detail.scope.user_id ?? '-'}</div>
              </div>
              <MultiSeriesBarChart
                data={filteredDaily}
                series={[
                  { key: 'line_total', label: '委托额', color: '#4e79a7', formatter: formatCurrency },
                  { key: 'final_unit_price', label: '合同额', color: '#76b7b2', formatter: formatCurrency },
                  { key: 'lab_price', label: '实验室报价', color: '#edc949', formatter: formatCurrency },
                  { key: 'machine_hours', label: '机时', color: '#e15759', formatter: formatHours }
                ]}
                getLabel={(item) => formatChineseStatDate(item.date)}
                getKey={(item, index) => `${item.date}-${index}`}
                emptyText="暂无历史数据"
              />
              <div className="mstats-data-list">
                {filteredDaily.length === 0 ? (
                  <div className="mstats-empty">暂无数据</div>
                ) : (
                  filteredDaily.map((item) => (
                    <div key={item.date} className="mstats-data-card">
                      <div className="mstats-data-card-title">{formatChineseStatDate(item.date)}</div>
                      <div className="mstats-metric-grid">
                        <div className="mstats-metric">
                          <span className="k">总委托额</span>
                          <span className="v">{formatCurrency(item.line_total)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">总合同额</span>
                          <span className="v">{formatCurrency(item.final_unit_price)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">实验室报价</span>
                          <span className="v">{formatCurrency(item.lab_price)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">委托单数</span>
                          <span className="v">{formatOrderCount(item.order_count)}</span>
                        </div>
                        <div className="mstats-metric">
                          <span className="k">总机时</span>
                          <span className="v">{formatHours(item.machine_hours)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
