import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSocket } from '../../hooks/useSocket.js';
import { canOperateEquipmentBooking, canViewEquipmentBooking } from '../../utils/equipmentBookingPermissions.js';
import EquipmentBookingSchedule from '../equipment_booking/EquipmentBookingSchedule.jsx';
import { BookingModal } from '../equipment_booking/EquipmentBooking.jsx';
import './MobileEquipmentBooking.css';

const START_HOUR = 8;
const TOTAL_HOURS = 16;
const HALF_HOUR = 30 * 60 * 1000;

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

function dayRange(day) {
  const start = new Date(`${day}T${pad(START_HOUR)}:00:00`);
  return { start, end: new Date(start.getTime() + TOTAL_HOURS * 60 * 60 * 1000) };
}

function formatTime(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2h2v2h6V2h2v2h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V2Zm12 8H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.1 4.9A9 9 0 1 0 21 14h-2.1A7 7 0 1 1 17.7 7.3L14 11h8V3l-2.9 1.9Z" />
    </svg>
  );
}

export default function MobileEquipmentBooking() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const canView = canViewEquipmentBooking(user);
  const canOperate = canOperateEquipmentBooking(user);

  if (!canView) return <div className="mobile-booking-access-denied">当前账号没有设备预约查看权限</div>;
  if (!canOperate) return <EquipmentBookingSchedule compact />;

  return <MobileBookingWorkspace user={user} />;
}

function MobileBookingWorkspace({ user }) {
  const { socket, isConnected } = useSocket('equipment-booking');
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [equipment, setEquipment] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [modalInitial, setModalInitial] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const range = useMemo(() => dayRange(selectedDate), [selectedDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = {
      from: `${selectedDate}T${pad(START_HOUR)}:00`,
      to: `${dateKey(addDays(`${selectedDate}T12:00:00`, 1))}T00:00`
    };
    try {
      const [equipmentResult, bookingResult, approvalResult] = await Promise.all([
        api.listBookingEquipment(),
        api.listEquipmentBookings(params),
        api.listEquipmentBookingApprovals(params).catch(() => ({ data: [] }))
      ]);
      setEquipment(equipmentResult.data || []);
      setBookings(bookingResult.data || []);
      setApprovals(approvalResult.data || []);
    } catch (requestError) {
      setError(requestError.message || '设备预约加载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('equipment-booking-updated', loadData);
    return () => socket.off('equipment-booking-updated', loadData);
  }, [socket, loadData]);

  const days = useMemo(() => {
    const selected = new Date(`${selectedDate}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3));
  }, [selectedDate]);

  function openAtPoint(event, equipmentId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const rawTime = range.start.getTime() + percentage * TOTAL_HOURS * 60 * 60 * 1000;
    const roundedTime = Math.round(rawTime / HALF_HOUR) * HALF_HOUR;
    const latestStart = range.end.getTime() - 60 * 60 * 1000;
    const startTime = new Date(Math.min(roundedTime, latestStart));
    setModalInitial({
      equipment_id: equipmentId,
      start_time: startTime,
      end_time: new Date(startTime.getTime() + 60 * 60 * 1000)
    });
  }

  function openBooking(booking) {
    const canEdit = booking.can_edit && new Date(booking.end_time) >= now;
    setModalInitial(canEdit ? booking : { ...booking, read_only: true });
  }

  async function cancelBooking(booking) {
    if (!window.confirm(`确定取消 ${booking.equipment_name} 的预约吗？`)) return false;
    await api.cancelEquipmentBooking(booking.booking_id);
    await loadData();
    return true;
  }

  const currentLine = selectedDate === dateKey(now)
    ? Math.max(0, Math.min(100, ((now - range.start) / (TOTAL_HOURS * 60 * 60 * 1000)) * 100))
    : null;

  return (
    <div className="mobile-booking-page">
      <div className="mobile-booking-title-row">
        <div>
          <span className="mobile-booking-kicker"><CalendarIcon />设备预约</span>
          <h2>{new Date(`${selectedDate}T12:00:00`).getMonth() + 1} 月设备安排</h2>
        </div>
        <button type="button" className="mobile-booking-refresh" onClick={loadData} disabled={loading} title="刷新" aria-label="刷新预约">
          <RefreshIcon />
        </button>
      </div>

      <div className="mobile-booking-days">
        {days.map((day) => {
          const key = dateKey(day);
          return (
            <button type="button" key={key} className={key === selectedDate ? 'active' : ''} onClick={() => setSelectedDate(key)}>
              <span>{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}</span>
              <strong>{day.getDate()}</strong>
            </button>
          );
        })}
      </div>

      <div className="mobile-booking-status-row">
        <span><i className={isConnected ? 'connected' : ''} />{isConnected ? '实时同步' : '连接中'}</span>
        <label title="选择日期"><CalendarIcon /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
      </div>

      {approvals.length > 0 && (
        <section className="mobile-booking-approvals">
          <div className="mobile-booking-section-title"><strong>待我审批</strong><span>{approvals.length}</span></div>
          {approvals.map((item) => (
            <article key={item.booking_id}>
              <div><strong>{item.equipment_name}</strong><span>{formatTime(item.start_time)} - {formatTime(item.end_time)} · {item.booker_name}</span></div>
              <div className="mobile-booking-approval-actions">
                <button type="button" onClick={async () => {
                  await api.rejectEquipmentBooking(item.booking_id, { reason: window.prompt('请输入驳回原因（可选）') || '' });
                  loadData();
                }}>驳回</button>
                <button type="button" className="primary" onClick={async () => {
                  await api.approveEquipmentBooking(item.booking_id);
                  loadData();
                }}>通过</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="mobile-booking-ruler" aria-hidden="true">
        {[8, 12, 16, 20, 24].map((hour) => <span key={hour}>{pad(hour)}:00</span>)}
      </div>

      {error && <div className="mobile-booking-error">{error}</div>}
      <div className="mobile-booking-equipment-list">
        {equipment.map((item) => {
          const itemBookings = bookings.filter((booking) => String(booking.equipment_id) === String(item.equipment_id));
          return (
            <section className="mobile-equipment-row" key={item.equipment_id}>
              <div className="mobile-equipment-heading">
                <div><h3>{item.equipment_name}</h3><span>{item.department_name || '设备'}</span></div>
                {itemBookings.length > 0 && <b>{itemBookings.length} 项任务</b>}
              </div>
              <div className="mobile-equipment-track" onClick={(event) => openAtPoint(event, item.equipment_id)}>
                {currentLine !== null && <i className="mobile-booking-now" style={{ left: `${currentLine}%` }} />}
                {itemBookings.map((booking) => {
                  const left = Math.max(0, ((new Date(booking.start_time) - range.start) / (TOTAL_HOURS * 60 * 60 * 1000)) * 100);
                  const width = Math.max(2.5, ((new Date(booking.end_time) - new Date(booking.start_time)) / (TOTAL_HOURS * 60 * 60 * 1000)) * 100);
                  const pending = booking.approval_status === 'pending';
                  return (
                    <button
                      type="button"
                      key={booking.booking_id}
                      className={pending ? 'pending' : 'booked'}
                      style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                      onClick={(event) => { event.stopPropagation(); openBooking(booking); }}
                      title={`${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`}
                    >
                      <span>{booking.reserved_user_name || booking.booker_name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mobile-equipment-hours" aria-hidden="true"><span>08</span><span>12</span><span>16</span><span>20</span><span>24</span></div>
            </section>
          );
        })}
        {!loading && equipment.length === 0 && !error && <div className="mobile-booking-empty">暂无可预约设备</div>}
      </div>

      {modalInitial && (
        <BookingModal
          initial={modalInitial}
          equipmentOptions={equipment}
          onClose={() => setModalInitial(null)}
          onSaved={() => { setModalInitial(null); loadData(); }}
          onCancelBooking={cancelBooking}
        />
      )}
    </div>
  );
}
