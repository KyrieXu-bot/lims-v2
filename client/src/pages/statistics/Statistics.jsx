import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import './Statistics.css';

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatHours = (value) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
  // default month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString().slice(0, 10), to: end };
};

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
    return <div className="stats-empty">{emptyText}</div>;
  }

  return (
    <div className="stats-chart">
      <div className="stats-chart-content">
        {data.map((item, index) => {
          const itemKey = getKey(item, index);
          return (
            <div className="stats-chart-column" key={itemKey}>
              <div className="stats-chart-bar">
                {series.map((s) => {
                  const rawValue = Number(item?.[s.key] || 0);
                  const barHeight = rawValue > 0 ? Math.max(6, (rawValue / maxValue) * 100) : 0;
                  const formatter = s.formatter || ((v) => Number(v || 0).toLocaleString('zh-CN'));
                  return (
                    <div
                      key={s.key}
                      className="stats-chart-bar-segment"
                      style={{ height: `${barHeight}%`, backgroundColor: s.color }}
                      title={`${s.label}：${formatter(rawValue)}`}
                    >
                      {rawValue > 0 && <span>{formatter(rawValue)}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="stats-chart-label" title={getLabel(item)}>
                {getLabel(item)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="stats-chart-legend">
        {series.map((s) => (
          <div key={s.key} className="stats-chart-legend-item">
            <span style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Statistics() {
  const initialRangeRef = useRef(getDefaultRange());
  const [fromDate, setFromDate] = useState(initialRangeRef.current.from);
  const [toDate, setToDate] = useState(initialRangeRef.current.to);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('lims_user') || 'null');
    } catch (e) {
      return null;
    }
  }, []);

  const isRangeValid = useMemo(() => {
    if (!fromDate || !toDate) return false;
    return new Date(fromDate) <= new Date(toDate);
  }, [fromDate, toDate]);

  const loadData = useCallback(
    async ({ from, to } = {}) => {
      const targetFrom = from || fromDate;
      const targetTo = to || toDate;
      setLoading(true);
      setError('');
      try {
        const result = await api.getStatisticsSummary({ from: targetFrom, to: targetTo });
        setData(result);
      } catch (err) {
        setData(null);
        setError(err?.message || '获取统计数据失败，请稍后再试');
      } finally {
        setLoading(false);
      }
    },
    [fromDate, toDate]
  );

  useEffect(() => {
    loadData(initialRangeRef.current);
  }, [loadData]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isRangeValid) {
      setError('开始日期不能晚于结束日期');
      return;
    }
    loadData();
  };

  const handleQuickRange = (key) => {
    const range = computeQuickRange(key);
    setFromDate(range.from);
    setToDate(range.to);
    loadData(range);
  };

  const handleExport = async () => {
    if (!isRangeValid || exporting) return;
    setExporting(true);
    setError('');
    try {
      const blob = await api.exportStatistics({ from: fromDate, to: toDate });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `统计数据_${fromDate}_${toDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch (err) {
      setError(err?.message || '导出失败，请稍后再试');
    } finally {
      setExporting(false);
    }
  };

  const role = data?.role || user?.role;
  const detail = data?.detail;

  const summaryCards = useMemo(() => {
    if (!detail) return [];
    if (role === 'leader') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总工时（小时）', value: formatHours(detail.summary.work_hours) },
        { label: '总机时（小时）', value: formatHours(detail.summary.machine_hours) }
      ];
    }
    if (role === 'supervisor') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总工时（小时）', value: formatHours(detail.summary.work_hours) }
      ];
    }
    if (role === 'employee') {
      return [
        { label: '总委托额（元）', value: formatCurrency(detail.summary.line_total) },
        { label: '总机时（小时）', value: formatHours(detail.summary.machine_hours) }
      ];
    }
    return [];
  }, [detail, role]);

  return (
    <div className="stats-page">
      <div className="stats-header">
        <div>
          <h2>数据统计</h2>
          <p className="stats-subtitle">根据筛选时间段查看业绩、工时与机时分布</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleExport}
          disabled={!isRangeValid || exporting || loading || !detail}
        >
          {exporting ? '导出中...' : '导出为 Excel'}
        </button>
      </div>

      <form className="stats-filter" onSubmit={handleSubmit}>
        <div className="stats-filter-fields">
          <label>
            开始日期
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              required
            />
          </label>
          <div className="stats-quick-buttons">
            {QUICK_RANGE_OPTIONS.map((item) => (
              <button type="button" key={item.key} onClick={() => handleQuickRange(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stats-buttons">
          <button type="submit" className="btn btn-primary" disabled={loading || !isRangeValid}>
            {loading ? '加载中...' : '查询'}
          </button>
        </div>
      </form>

      {!isRangeValid && (
        <div className="stats-error">请选择正确的时间范围，开始日期不能晚于结束日期。</div>
      )}
      {error && <div className="stats-error">{error}</div>}

      {loading && (
        <div className="stats-loading">
          <span className="spinner" />
          <span>统计数据加载中，请稍候...</span>
        </div>
      )}

      {!loading && detail && (
        <>
          <div className="stats-summary">
            {summaryCards.map((card) => (
              <div key={card.label} className="stats-card">
                <span className="title">{card.label}</span>
                <span className="value">{card.value}</span>
              </div>
            ))}
          </div>

          {role === 'leader' && (
            <>
              <section className="stats-section">
                <div className="stats-section-header">
                  <h3>组长情况</h3>
                  <span className="stats-section-sub">
                    部门ID：{detail.scope.department_id || '-'}
                  </span>
                </div>
                <MultiSeriesBarChart
                  data={detail.supervisors}
                  series={[
                    { key: 'line_total', label: '总委托额（元）', color: '#4e79a7', formatter: formatCurrency },
                    { key: 'work_hours', label: '总工时（小时）', color: '#f28e2b', formatter: formatHours }
                  ]}
                  getLabel={(item) => item.name || '-'}
                  emptyText="暂无组长数据"
                />
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>组长</th>
                      <th>所属组</th>
                      <th>总委托额（元）</th>
                      <th>总工时（小时）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.supervisors.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="stats-empty-cell">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      detail.supervisors.map((item) => (
                        <tr key={item.user_id}>
                          <td>{item.name}</td>
                          <td>{item.group_name || '-'}</td>
                          <td>{formatCurrency(item.line_total)}</td>
                          <td>{formatHours(item.work_hours)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              <section className="stats-section">
                <div className="stats-section-header">
                  <h3>员工情况</h3>
                  <span className="stats-section-sub">包含部门下所有实验员</span>
                </div>
                <MultiSeriesBarChart
                  data={detail.employees}
                  series={[
                    { key: 'line_total', label: '总委托额（元）', color: '#4e79a7', formatter: formatCurrency },
                    { key: 'work_hours', label: '总工时（小时）', color: '#59a14f', formatter: formatHours },
                    { key: 'machine_hours', label: '总机时（小时）', color: '#e15759', formatter: formatHours }
                  ]}
                  getLabel={(item) => item.name || '-'}
                  emptyText="暂无员工数据"
                />
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>员工</th>
                      <th>所属组</th>
                      <th>总委托额（元）</th>
                      <th>总工时（小时）</th>
                      <th>总机时（小时）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.employees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="stats-empty-cell">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      detail.employees.map((item) => (
                        <tr key={item.user_id}>
                          <td>{item.name}</td>
                          <td>{item.group_name || '-'}</td>
                          <td>{formatCurrency(item.line_total)}</td>
                          <td>{formatHours(item.work_hours)}</td>
                          <td>{formatHours(item.machine_hours)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              <section className="stats-section">
                <div className="stats-section-header">
                  <h3>设备机时</h3>
                  <span className="stats-section-sub">仅展示有机时记录的设备</span>
                </div>
                <MultiSeriesBarChart
                  data={detail.equipment}
                  series={[
                    { key: 'machine_hours', label: '总机时（小时）', color: '#e15759', formatter: formatHours }
                  ]}
                  getLabel={(item) => item.equipment_name || '未指定设备'}
                  emptyText="暂无设备机时数据"
                />
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>设备</th>
                      <th>总机时（小时）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.equipment.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="stats-empty-cell">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      detail.equipment.map((item) => (
                        <tr key={item.equipment_id || item.equipment_name}>
                          <td>{item.equipment_name}</td>
                          <td>{formatHours(item.machine_hours)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {role === 'supervisor' && (
            <section className="stats-section">
              <div className="stats-section-header">
                <h3>小组成员情况</h3>
                <span className="stats-section-sub">
                  组ID：{detail.scope.group_id ?? '-'}，组长ID：{detail.scope.supervisor_id}
                </span>
              </div>
              <MultiSeriesBarChart
                data={detail.members}
                series={[
                  { key: 'line_total', label: '总委托额（元）', color: '#4e79a7', formatter: formatCurrency },
                  { key: 'work_hours', label: '总工时（小时）', color: '#f28e2b', formatter: formatHours }
                ]}
                getLabel={(item) => item.name || '-'}
                emptyText="暂无组员数据"
              />
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>成员</th>
                    <th>总委托额（元）</th>
                    <th>总工时（小时）</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.members.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="stats-empty-cell">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    detail.members.map((item) => (
                      <tr key={item.user_id}>
                        <td>{item.name}</td>
                        <td>{formatCurrency(item.line_total)}</td>
                        <td>{formatHours(item.work_hours)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          )}

          {role === 'employee' && (
            <section className="stats-section">
              <div className="stats-section-header">
                <h3>每日完成情况</h3>
                <span className="stats-section-sub">
                  实验员ID：{detail.scope.user_id}
                </span>
              </div>
              <MultiSeriesBarChart
                data={detail.daily}
                series={[
                  { key: 'line_total', label: '总委托额（元）', color: '#4e79a7', formatter: formatCurrency },
                  { key: 'machine_hours', label: '总机时（小时）', color: '#e15759', formatter: formatHours }
                ]}
                getLabel={(item) => item.date}
                getKey={(item, index) => `${item.date}-${index}`}
                emptyText="暂无历史数据"
              />
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>总委托额（元）</th>
                    <th>总机时（小时）</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.daily.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="stats-empty-cell">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    detail.daily.map((item) => (
                      <tr key={item.date}>
                        <td>{item.date}</td>
                        <td>{formatCurrency(item.line_total)}</td>
                        <td>{formatHours(item.machine_hours)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}











