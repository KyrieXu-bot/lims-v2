import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSocket } from '../../hooks/useSocket.js';
import './EquipmentBookingSchedule.css';

const MINUTE = 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function formatTime(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(startValue, endValue) {
  const minutes = Math.max(0, Math.round((new Date(endValue) - new Date(startValue)) / MINUTE));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function formatFullDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
}

function formatTaskSummary(booking) {
  const orderId = String(booking.order_id || '').trim();
  const projectName = String(booking.category_name || booking.detail_name || '').trim();
  const note = String(booking.note || '').trim() || '无备注';
  return [orderId, projectName, note].filter(Boolean).join(' ');
}

function getTaskState(booking, now) {
  const start = new Date(booking.start_time).getTime();
  const end = new Date(booking.end_time).getTime();
  if (now >= start && now < end) return { label: '进行中', className: 'ongoing' };
  if (now < start) return { label: '待开始', className: 'upcoming' };
  return { label: '已结束', className: 'ended' };
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3h2v4.4l3.2 1.9-1 1.7-4.2-2.5V7Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2h2v2h6V2h2v2h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V2Zm12 8H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z" />
    </svg>
  );
}

export default function EquipmentBookingSchedule({ compact = false }) {
  const { socket, isConnected } = useSocket('equipment-booking');
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [taskFilter, setTaskFilter] = useState('all');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${selectedDate}T00:00`;
      const to = `${dateKey(addDays(`${selectedDate}T00:00`, 1))}T00:00`;
      const result = await api.listEquipmentBookings({ from, to });
      setBookings(result.data || []);
    } catch (requestError) {
      setError(requestError.message || '预约任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('equipment-booking-updated', loadBookings);
    return () => socket.off('equipment-booking-updated', loadBookings);
  }, [socket, loadBookings]);

  const days = useMemo(() => {
    const selected = new Date(`${selectedDate}T12:00:00`);
    return Array.from({ length: compact ? 5 : 7 }, (_, index) =>
      addDays(selected, index - (compact ? 2 : 3))
    );
  }, [compact, selectedDate]);

  const taskRows = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((booking) => ({ ...booking, taskState: getTaskState(booking, now) }));
  }, [bookings, now]);

  const ongoingCount = taskRows.filter((item) => item.taskState.className === 'ongoing').length;
  const upcomingCount = taskRows.filter((item) => item.taskState.className === 'upcoming').length;
  const totalMinutes = taskRows.reduce((sum, item) => (
    sum + Math.max(0, (new Date(item.end_time) - new Date(item.start_time)) / MINUTE)
  ), 0);
  const visibleTaskRows = taskFilter === 'all'
    ? taskRows
    : taskRows.filter((item) => item.taskState.className === taskFilter);

  function changeDate(amount) {
    setSelectedDate(dateKey(addDays(`${selectedDate}T12:00:00`, amount)));
  }

  return (
    <section className={`booking-schedule${compact ? ' compact' : ''}`}>
      <header className="booking-schedule-header">
        <div>
          <div className="booking-schedule-eyebrow"><CalendarIcon /> 设备任务日程</div>
          <h2>{selectedDate === dateKey() ? '今天的设备任务' : `${selectedDate} 设备任务`}</h2>
        </div>
        <span className={`booking-schedule-live${isConnected ? ' connected' : ''}`}>
          <i />{isConnected ? '实时同步' : '正在连接'}
        </span>
      </header>

      {compact ? (
        <div className="booking-schedule-calendar">
          <div className="booking-schedule-days">
            {days.map((day) => {
              const key = dateKey(day);
              const active = key === selectedDate;
              return (
                <button key={key} type="button" className={active ? 'active' : ''} onClick={() => setSelectedDate(key)}>
                  <span>{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}</span>
                  <strong>{day.getDate()}</strong>
                </button>
              );
            })}
          </div>
          <label className="booking-schedule-date-picker" title="选择日期">
            <CalendarIcon />
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="booking-desktop-toolbar">
          <div className="booking-desktop-date-nav">
            <button type="button" className="booking-date-arrow" onClick={() => changeDate(-1)} title="前一天" aria-label="前一天">‹</button>
            <button type="button" className="booking-date-arrow" onClick={() => changeDate(1)} title="后一天" aria-label="后一天">›</button>
            <div className="booking-desktop-date-label">
              <strong>{formatFullDate(selectedDate)}</strong>
              <span>{selectedDate === dateKey() ? '今天' : '查看指定日期的设备任务'}</span>
            </div>
            <label className="booking-desktop-date-picker" title="选择日期">
              <CalendarIcon />
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <button type="button" className="booking-schedule-today" onClick={() => setSelectedDate(dateKey())}>回到今天</button>
          </div>
          <div className="booking-schedule-filters" role="tablist" aria-label="任务状态筛选">
            {[
              ['all', '全部任务', taskRows.length],
              ['ongoing', '进行中', ongoingCount],
              ['upcoming', '待开始', upcomingCount]
            ].map(([value, label, count]) => (
              <button
                type="button"
                role="tab"
                aria-selected={taskFilter === value}
                className={taskFilter === value ? 'active' : ''}
                key={value}
                onClick={() => setTaskFilter(value)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="booking-schedule-summary" aria-label="任务概览">
        <div><strong>{taskRows.length}</strong><span>当日任务</span></div>
        <div><strong>{ongoingCount}</strong><span>正在进行</span></div>
        <div><strong>{upcomingCount}</strong><span>等待开始</span></div>
        <div><strong>{Math.round(totalMinutes / 6) / 10}</strong><span>占用小时</span></div>
      </div>

      {error && <div className="booking-schedule-error">{error}</div>}
      {loading && taskRows.length === 0 && <div className="booking-schedule-empty">正在加载设备任务...</div>}
      {!loading && !error && taskRows.length === 0 && (
        <div className="booking-schedule-empty">
          <CalendarIcon />
          <strong>当天暂无设备任务</strong>
          <span>可以选择其他日期查看安排</span>
        </div>
      )}

      {!compact && taskRows.length > 0 && (
        <section className="booking-desktop-task-panel">
          <div className="booking-desktop-task-heading">
            <div>
              <h3>设备任务安排</h3>
              <span>按开始时间排序，共 {visibleTaskRows.length} 条</span>
            </div>
            {loading && <span className="booking-desktop-refreshing">正在刷新...</span>}
          </div>
          <div className="booking-desktop-table-head" aria-hidden="true">
            <span>预约时间</span>
            <span>设备与任务信息</span>
            <span>预约人</span>
            <span>任务状态</span>
            <span>预计时长</span>
          </div>
          <div className="booking-desktop-task-list">
            {visibleTaskRows.map((booking) => {
              const person = String(booking.reserved_user_name || booking.booker_name || booking.booker_id || '-');
              const summary = formatTaskSummary(booking);
              const durationMinutes = Math.max(30, (new Date(booking.end_time) - new Date(booking.start_time)) / MINUTE);
              const meterBlocks = Math.min(6, Math.max(1, Math.ceil(durationMinutes / 60)));
              return (
                <article className={`booking-desktop-task-row ${booking.taskState.className}`} key={booking.booking_id}>
                  <div className="booking-desktop-time-cell">
                    <ClockIcon />
                    <div><strong>{formatTime(booking.start_time)}</strong><span>至 {formatTime(booking.end_time)}</span></div>
                  </div>
                  <div className="booking-desktop-task-cell">
                    <strong>{booking.equipment_name}</strong>
                    <span title={summary}>{summary}</span>
                  </div>
                  <div className="booking-desktop-person-cell">
                    <b>{person.slice(0, 1)}</b>
                    <span>{person}</span>
                  </div>
                  <div className="booking-desktop-status-cell">
                    <span className="booking-agenda-state">{booking.taskState.label}</span>
                    {booking.approval_status === 'pending' && <span className="booking-agenda-approval">需审批</span>}
                  </div>
                  <div className="booking-desktop-duration-cell">
                    <strong>{formatDuration(booking.start_time, booking.end_time)}</strong>
                    <div className="booking-duration-meter" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => <i key={index} className={index < meterBlocks ? 'filled' : ''} />)}
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleTaskRows.length === 0 && (
              <div className="booking-desktop-filter-empty">当前筛选条件下没有任务</div>
            )}
          </div>
        </section>
      )}

      {compact && taskRows.length > 0 && (
        <div className="booking-agenda">
          {taskRows.map((booking) => {
            const person = String(booking.reserved_user_name || booking.booker_name || booking.booker_id || '-');
            const summary = formatTaskSummary(booking);
            const durationMinutes = Math.max(30, (new Date(booking.end_time) - new Date(booking.start_time)) / MINUTE);
            const meterBlocks = Math.min(6, Math.max(1, Math.ceil(durationMinutes / 60)));
            return (
              <article className={`booking-agenda-item ${booking.taskState.className}`} key={booking.booking_id}>
                <div className="booking-agenda-time">
                  <strong>{formatTime(booking.start_time)}</strong>
                  <span>{formatTime(booking.end_time)}</span>
                </div>
                <div className="booking-agenda-marker"><ClockIcon /></div>
                <div className="booking-agenda-card">
                  <div className="booking-agenda-card-top">
                    <div>
                      <span className="booking-agenda-state">{booking.taskState.label}</span>
                      {booking.approval_status === 'pending' && <span className="booking-agenda-approval">需审批</span>}
                    </div>
                    <span className="booking-agenda-duration"><ClockIcon />{formatDuration(booking.start_time, booking.end_time)}</span>
                  </div>
                  <h3>{booking.equipment_name}</h3>
                  <p>{summary}</p>
                  <div className="booking-agenda-footer">
                    <span className="booking-agenda-person"><b>{person.slice(0, 1)}</b>{person}</span>
                    <div className="booking-duration-meter" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => <i key={index} className={index < meterBlocks ? 'filled' : ''} />)}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
