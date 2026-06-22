import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useSocket } from '../../hooks/useSocket.js';
import './EquipmentBooking.css';

const DAY_START_HOUR = 8;
const DAY_HOURS = 16;
const SLOT_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateOnly(value) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

function getWindow(dateText) {
  const start = new Date(`${dateText}T${pad(DAY_START_HOUR)}:00:00`);
  const end = addMinutes(start, DAY_HOURS * 60);
  return { start, end };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTestItemTitle(item) {
  if (!item) return '';
  return [item.category_name, item.detail_name, item.sample_name].filter(Boolean).join(' / ');
}

function isBookingExpired(item, now = new Date()) {
  return new Date(item.end_time).getTime() < now.getTime();
}

function isBookingOngoing(item, now = new Date()) {
  const start = new Date(item.start_time).getTime();
  const end = new Date(item.end_time).getTime();
  const current = now.getTime();
  return start <= current && current <= end;
}

function getBookingStatus(item, now = new Date()) {
  if (isBookingExpired(item, now)) return { text: '已归档', className: 'archived' };
  if (item.approval_status === 'pending') return { text: '待审批', className: 'pending' };
  if (item.approval_status === 'approved') return { text: '已通过', className: 'approved' };
  if (isBookingOngoing(item, now)) return { text: '进行中', className: 'ongoing' };
  return { text: '未开始', className: 'upcoming' };
}

function formatUserLabel(userId, name) {
  if (!userId && !name) return '';
  if (!userId) return name || '';
  return `${name || userId}（${userId}）`;
}

function UserPicker({ label, value, displayName, equipmentId, onChange, onInputTextChange, optional = false }) {
  const [query, setQuery] = useState(() => formatUserLabel(value, displayName));
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const labelText = formatUserLabel(value, displayName);
    setQuery(labelText);
    onInputTextChange?.(labelText);
  }, [value, displayName]);

  useEffect(() => {
    let ignore = false;
    const raw = query.trim();
    if (!raw || (value && raw === formatUserLabel(value, displayName))) {
      setOptions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchBookingAssignees({ q: raw, equipment_id: equipmentId });
        if (!ignore) setOptions(data.data || []);
      } catch {
        if (!ignore) setOptions([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, equipmentId, value, displayName]);

  return (
    <label className="booking-field booking-user-picker">
      <span>{label}{optional ? '（选填）' : ''}</span>
      <div className="booking-user-input-row">
        <input
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onInputTextChange?.(next);
            onChange('', '');
          }}
          placeholder="输入姓名或工号搜索"
        />
        {value && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('', '')}>清空</button>
        )}
      </div>
      {options.length > 0 && (
        <div className="booking-user-options">
          {options.map((item) => (
            <button
              type="button"
              key={item.user_id}
              onClick={() => {
                onChange(item.user_id, item.name);
                onInputTextChange?.(formatUserLabel(item.user_id, item.name));
                setOptions([]);
              }}
            >
              {formatUserLabel(item.user_id, item.name)}
            </button>
          ))}
        </div>
      )}
      {loading && <span className="booking-picker-hint">搜索中...</span>}
    </label>
  );
}

function BookingModal({ initial, equipmentOptions, onClose, onSaved }) {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const isEdit = Boolean(initial?.booking_id);
  const [form, setForm] = useState(() => ({
    equipment_id: initial?.equipment_id || '',
    start_time: toLocalInputValue(initial?.start_time),
    end_time: toLocalInputValue(initial?.end_time),
    order_id: initial?.order_id || '',
    test_item_id: initial?.test_item_id || '',
    reserved_user_id: initial?.reserved_user_id || '',
    reserved_user_name: initial?.reserved_user_name || '',
    reserved_user_text: formatUserLabel(initial?.reserved_user_id, initial?.reserved_user_name),
    note: initial?.note || ''
  }));
  const [orderItems, setOrderItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedEquipment = equipmentOptions.find((item) => String(item.equipment_id) === String(form.equipment_id));

  useEffect(() => {
    let ignore = false;
    async function fetchItems() {
      if (!form.order_id.trim()) {
        setOrderItems([]);
        setForm((prev) => ({ ...prev, test_item_id: '' }));
        return;
      }
      setLoadingItems(true);
      try {
        const data = await api.getBookingOrderTestItems(form.order_id.trim());
        if (!ignore) setOrderItems(data.data || []);
      } catch (e) {
        if (!ignore) setError(e.message || '获取检测项目失败');
      } finally {
        if (!ignore) setLoadingItems(false);
      }
    }
    const timer = setTimeout(fetchItems, 350);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [form.order_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (form.reserved_user_text?.trim() && !form.reserved_user_id) {
        setError('预约人必须从搜索结果中选择，不能手动输入未匹配的人员');
        setSaving(false);
        return;
      }
      const payload = {
        ...form,
        order_id: form.order_id.trim() || null,
        test_item_id: form.test_item_id || null,
        reserved_user_id: form.reserved_user_id || null,
        note: form.note.trim() || null
      };
      if (isEdit) {
        await api.updateEquipmentBooking(initial.booking_id, payload);
      } else {
        await api.createEquipmentBooking(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="booking-modal-backdrop" onMouseDown={onClose}>
      <div className="booking-modal" onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="booking-modal-head">
            <input
              className="booking-title-input"
              value={selectedEquipment?.equipment_name || ''}
              readOnly
              placeholder="选择设备"
            />
            <button type="button" className="booking-icon-button" onClick={onClose} title="关闭">×</button>
          </div>

          <div className="booking-modal-row">
            <span className="booking-row-icon">人</span>
            <div>
              <div className="booking-muted">申请人</div>
              <div>{initial?.applicant_name || initial?.booker_name || user?.name || user?.username || '-'}</div>
            </div>
          </div>

          <label className="booking-field">
            <span>设备名称</span>
            <select
              value={form.equipment_id}
              onChange={(e) => setForm((prev) => ({ ...prev, equipment_id: e.target.value }))}
              required
            >
              <option value="">请选择设备</option>
              {equipmentOptions.map((item) => (
                <option key={item.equipment_id} value={item.equipment_id}>
                  {item.equipment_name}{item.equipment_no ? ` (${item.equipment_no})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="booking-time-fields">
            <label className="booking-field">
              <span>开始时间</span>
              <input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </label>
            <label className="booking-field">
              <span>结束时间</span>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                required
              />
            </label>
          </div>

          <UserPicker
            label="预约人"
            optional
            value={form.reserved_user_id}
            displayName={form.reserved_user_name}
            equipmentId={form.equipment_id}
            onChange={(userId, name) => setForm((prev) => ({
              ...prev,
              reserved_user_id: userId,
              reserved_user_name: name
            }))}
            onInputTextChange={(text) => setForm((prev) => ({
              ...prev,
              reserved_user_text: text
            }))}
          />

          <label className="booking-field">
            <span>委托单号</span>
            <input
              value={form.order_id}
              onChange={(e) => setForm((prev) => ({ ...prev, order_id: e.target.value }))}
              placeholder="选填，输入后可绑定检测项目"
            />
          </label>

          <label className="booking-field">
            <span>对应检测项目</span>
            <select
              value={form.test_item_id}
              onChange={(e) => setForm((prev) => ({ ...prev, test_item_id: e.target.value }))}
              disabled={!form.order_id || loadingItems}
            >
              <option value="">{loadingItems ? '加载中...' : '不绑定检测项目'}</option>
              {orderItems.map((item) => (
                <option key={item.test_item_id} value={item.test_item_id}>
                  {getTestItemTitle(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="booking-field">
            <span>备注</span>
            <textarea
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              rows={3}
              placeholder="选填"
            />
          </label>

          {error && <div className="booking-error">{error}</div>}

          <div className="booking-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : (isEdit ? '保存修改' : '保存')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EquipmentBooking() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const { socket, isConnected } = useSocket('equipment-booking');
  const [viewMode, setViewMode] = useState('timeline');
  const [dateFilter, setDateFilter] = useState(dateOnly(new Date()));
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [approvalBookings, setApprovalBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalInitial, setModalInitial] = useState(null);
  const [dragDraft, setDragDraft] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const rowRefs = useRef(new Map());

  const windowRange = useMemo(() => getWindow(dateFilter), [dateFilter]);

  const filteredEquipment = useMemo(() => {
    return equipment.filter((item) => {
      if (equipmentFilter && String(item.equipment_id) !== String(equipmentFilter)) return false;
      if (departmentFilter && String(item.department_id) !== String(departmentFilter)) return false;
      return true;
    });
  }, [equipment, equipmentFilter, departmentFilter]);

  const myBookings = useMemo(() => {
    return bookings.filter((item) => String(item.booker_id) === String(user?.user_id));
  }, [bookings, user?.user_id]);

  const myOpenBookings = useMemo(() => {
    return myBookings.filter((item) => !isBookingExpired(item, now));
  }, [myBookings, now]);

  const loadLookups = useCallback(async () => {
    const [deptData, equipmentData] = await Promise.all([
      api.listBookingDepartments(),
      api.listBookingEquipment({ department_id: departmentFilter })
    ]);
    setDepartments(deptData.data || []);
    setEquipment(equipmentData.data || []);
  }, [departmentFilter]);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        from: toLocalInputValue(windowRange.start),
        to: toLocalInputValue(windowRange.end),
        equipment_id: equipmentFilter,
        department_id: departmentFilter
      };
      const [data, approvals] = await Promise.all([
        api.listEquipmentBookings(params),
        api.listEquipmentBookingApprovals(params).catch(() => ({ data: [] }))
      ]);
      setBookings(data.data || []);
      setApprovalBookings(approvals.data || []);
    } finally {
      setLoading(false);
    }
  }, [windowRange.start, windowRange.end, equipmentFilter, departmentFilter]);

  useEffect(() => {
    loadLookups().catch(console.error);
  }, [loadLookups]);

  useEffect(() => {
    loadBookings().catch(console.error);
  }, [loadBookings]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => loadBookings().catch(console.error);
    socket.on('equipment-booking-updated', refresh);
    return () => socket.off('equipment-booking-updated', refresh);
  }, [socket, loadBookings]);

  function getTimeFromPointer(e, equipmentId) {
    const el = rowRefs.current.get(String(equipmentId));
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const minutes = Math.round((x / rect.width) * DAY_HOURS * 60 / SLOT_MINUTES) * SLOT_MINUTES;
    return addMinutes(windowRange.start, minutes);
  }

  function openQuickBooking(equipmentId, start, end) {
    setModalInitial({
      equipment_id: equipmentId,
      start_time: start,
      end_time: end || addMinutes(start, 60)
    });
  }

  function handleMouseDown(e, equipmentId) {
    if (e.button !== 0 || e.target.closest('.booking-event')) return;
    const start = getTimeFromPointer(e, equipmentId);
    if (!start) return;
    setDragDraft({ equipmentId, start, end: addMinutes(start, SLOT_MINUTES) });
  }

  function handleMouseMove(e, equipmentId) {
    if (!dragDraft || String(dragDraft.equipmentId) !== String(equipmentId)) return;
    const end = getTimeFromPointer(e, equipmentId);
    if (!end) return;
    setDragDraft((prev) => ({ ...prev, end: addMinutes(end, SLOT_MINUTES) }));
  }

  function handleMouseUp() {
    if (!dragDraft) return;
    const startMs = dragDraft.start.getTime();
    const endMs = dragDraft.end.getTime();
    const start = new Date(Math.min(startMs, endMs));
    const end = new Date(Math.max(startMs, endMs));
    setDragDraft(null);
    openQuickBooking(dragDraft.equipmentId, start, end.getTime() === start.getTime() ? addMinutes(start, 60) : end);
  }

  async function handleCancel(booking) {
    if (isBookingExpired(booking, now)) return;
    if (!window.confirm(`确定取消 ${booking.equipment_name} 的预约吗？`)) return;
    await api.cancelEquipmentBooking(booking.booking_id);
    await loadBookings();
  }

  function handleEdit(booking) {
    if (String(booking.booker_id) !== String(user?.user_id) && !booking.can_approve) return;
    if (isBookingExpired(booking, now)) return;
    setModalInitial(booking);
  }

  const hours = Array.from({ length: DAY_HOURS + 1 }, (_, i) => DAY_START_HOUR + i);

  return (
    <div className="equipment-booking-page" onMouseUp={handleMouseUp}>
      <div className="booking-toolbar">
        <div className="booking-toolbar-title">
          <h2>设备预约</h2>
          <span className={isConnected ? 'booking-live on' : 'booking-live'}>{isConnected ? '实时同步' : '离线'}</span>
        </div>
        <div className="booking-filters">
          <label>
            筛选日期
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </label>
          <label>
            筛选设备
            <select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
              <option value="">全部设备</option>
              {equipment.map((item) => (
                <option key={item.equipment_id} value={item.equipment_id}>{item.equipment_name}</option>
              ))}
            </select>
          </label>
          <label>
            筛选部门
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="">全部部门</option>
              {departments.map((item) => (
                <option key={item.department_id} value={item.department_id}>{item.department_name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="booking-view-toggle">
          <button className={viewMode === 'timeline' ? 'active' : ''} onClick={() => setViewMode('timeline')}>时间线</button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>列表</button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <div className="booking-timeline-shell">
          <div className="booking-timeline-head">
            <div className="booking-equipment-head">设备</div>
            <div className="booking-hour-head">
              {hours.map((hour) => <span key={hour}>{pad(hour)}:00</span>)}
            </div>
          </div>
          <div className="booking-timeline-body">
            {filteredEquipment.map((item) => {
              const rowBookings = bookings.filter((booking) => String(booking.equipment_id) === String(item.equipment_id));
              const draft = dragDraft && String(dragDraft.equipmentId) === String(item.equipment_id) ? dragDraft : null;
              return (
                <div className="booking-timeline-row" key={item.equipment_id}>
                  <div className="booking-equipment-cell">
                    <strong>{item.equipment_name}</strong>
                    <span>{item.department_name || '未分部门'}{item.equipment_no ? ` · ${item.equipment_no}` : ''}</span>
                  </div>
                  <div
                    className="booking-row-track"
                    ref={(node) => {
                      if (node) rowRefs.current.set(String(item.equipment_id), node);
                      else rowRefs.current.delete(String(item.equipment_id));
                    }}
                    onMouseDown={(e) => handleMouseDown(e, item.equipment_id)}
                    onMouseMove={(e) => handleMouseMove(e, item.equipment_id)}
                    onDoubleClick={(e) => {
                      const start = getTimeFromPointer(e, item.equipment_id);
                      if (start) openQuickBooking(item.equipment_id, start);
                    }}
                  >
                    {rowBookings.map((booking) => {
                      const start = new Date(booking.start_time);
                      const end = new Date(booking.end_time);
                      const left = clamp((start - windowRange.start) / (DAY_HOURS * 60 * MS_PER_MINUTE) * 100, 0, 100);
                      const right = clamp((end - windowRange.start) / (DAY_HOURS * 60 * MS_PER_MINUTE) * 100, 0, 100);
                      const isMine = String(booking.booker_id) === String(user?.user_id);
                      const status = getBookingStatus(booking, now);
                      return (
                        <div
                          key={booking.booking_id}
                          className={['booking-event', isMine ? 'mine' : '', status.className].filter(Boolean).join(' ')}
                          style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }}
                          title={`${status.text} ${booking.booker_name || booking.booker_id} ${formatDateTime(booking.start_time)} - ${formatDateTime(booking.end_time)}${booking.note ? ` ${booking.note}` : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(booking);
                          }}
                        >
                          <strong>{booking.reserved_user_name || booking.booker_name || booking.booker_id}</strong>
                          <span>{booking.detail_name || booking.order_id || '设备预约'}</span>
                        </div>
                      );
                    })}
                    {draft && (
                      <div
                        className="booking-draft"
                        style={{
                          left: `${clamp((Math.min(draft.start, draft.end) - windowRange.start) / (DAY_HOURS * 60 * MS_PER_MINUTE) * 100, 0, 100)}%`,
                          width: `${Math.max(2, Math.abs(draft.end - draft.start) / (DAY_HOURS * 60 * MS_PER_MINUTE) * 100)}%`
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {!filteredEquipment.length && <div className="booking-empty">暂无可预约设备</div>}
          </div>
        </div>
      ) : (
        <div className="booking-list-layout">
          {approvalBookings.length > 0 && (
            <ApprovalPanel
              data={approvalBookings}
              now={now}
              onEdit={handleEdit}
              onApprove={async (item) => {
                await api.approveEquipmentBooking(item.booking_id);
                await loadBookings();
              }}
              onReject={async (item) => {
                const reason = window.prompt('请输入驳回原因（可选）') || '';
                await api.rejectEquipmentBooking(item.booking_id, { reason });
                await loadBookings();
              }}
            />
          )}
          <MyBookingCards
            openData={myOpenBookings}
            now={now}
            equipmentFilter={equipmentFilter}
            departmentFilter={departmentFilter}
            onCancel={handleCancel}
            onEdit={handleEdit}
          />
          <BookingTable title="预约情况" data={bookings} currentUserId={user?.user_id} now={now} onCancel={handleCancel} onEdit={handleEdit} onApprove={async (item) => {
            await api.approveEquipmentBooking(item.booking_id);
            await loadBookings();
          }} onReject={async (item) => {
            const reason = window.prompt('请输入驳回原因（可选）') || '';
            await api.rejectEquipmentBooking(item.booking_id, { reason });
            await loadBookings();
          }} />
        </div>
      )}

      {loading && <div className="booking-loading">加载预约中...</div>}
      {modalInitial && (
        <BookingModal
          initial={modalInitial}
          equipmentOptions={equipment}
          onClose={() => setModalInitial(null)}
          onSaved={() => {
            setModalInitial(null);
            loadBookings().catch(console.error);
          }}
        />
      )}
    </div>
  );
}

function MyBookingCards({ openData, now, equipmentFilter, departmentFilter, onCancel, onEdit }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function loadHistoryCount() {
      try {
        const data = await api.listEquipmentBookings({
          mine: true,
          equipment_id: equipmentFilter,
          department_id: departmentFilter
        });
        const count = (data.data || []).filter((item) => isBookingExpired(item, now)).length;
        if (!ignore) setHistoryCount(count);
      } catch {
        if (!ignore) setHistoryCount(0);
      }
    }
    loadHistoryCount();
    return () => {
      ignore = true;
    };
  }, [equipmentFilter, departmentFilter, now]);

  return (
    <section className="my-booking-panel">
      <div className="my-booking-head">
        <h3>我的预约</h3>
        <div className="my-booking-head-actions">
          <span>{openData.length} 条未结束 / {historyCount} 条历史</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setHistoryOpen(true)}>历史预约</button>
        </div>
      </div>
      {openData.length ? (
        <div className="my-booking-card-row">
          {openData.map((item) => {
            const status = getBookingStatus(item, now);
            return (
            <article className="my-booking-card" key={item.booking_id}>
              <div className="my-booking-card-main">
                <strong>{item.equipment_name}</strong>
                <span>{item.department_name || '未分部门'}</span>
              </div>
              <span className={`booking-status ${status.className}`}>{status.text}</span>
              <div className="my-booking-card-meta">
                申请人：{formatUserLabel(item.booker_id, item.booker_name)}
              </div>
              <div className="my-booking-card-meta">
                预约人：{item.reserved_user_id ? formatUserLabel(item.reserved_user_id, item.reserved_user_name) : '待定'}
              </div>
              <div className="my-booking-card-time">
                {formatDateTime(item.start_time)} 至 {formatDateTime(item.end_time)}
              </div>
              <div className="my-booking-card-meta">
                {item.test_item_id ? getTestItemTitle(item) : (item.order_id || '未绑定检测项目')}
              </div>
              {item.note && <div className="my-booking-card-note">{item.note}</div>}
              <div className="my-booking-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>编辑</button>
                <button className="btn btn-danger btn-sm" onClick={() => onCancel(item)}>取消预约</button>
              </div>
            </article>
          );})}
        </div>
      ) : (
        <div className="my-booking-empty">当前筛选范围内没有未结束预约</div>
      )}
      {historyOpen && (
        <HistoryBookingModal
          now={now}
          equipmentFilter={equipmentFilter}
          departmentFilter={departmentFilter}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </section>
  );
}

function ApprovalPanel({ data, now, onEdit, onApprove, onReject }) {
  return (
    <section className="approval-panel">
      <div className="approval-panel-head">
        <h3>待我审批</h3>
        <span>{data.length} 条</span>
      </div>
      <div className="approval-list">
        {data.map((item) => {
          const status = getBookingStatus(item, now);
          return (
            <article className="approval-item" key={item.booking_id}>
              <div className="approval-main">
                <strong>{item.equipment_name}</strong>
                <span className={`booking-status ${status.className}`}>{status.text}</span>
              </div>
              <div className="approval-meta">
                <span>申请人：{formatUserLabel(item.booker_id, item.booker_name)}</span>
                <span>预约人：{item.reserved_user_id ? formatUserLabel(item.reserved_user_id, item.reserved_user_name) : '待定'}</span>
                <span>{formatDateTime(item.start_time)} 至 {formatDateTime(item.end_time)}</span>
                <span>{item.test_item_id ? getTestItemTitle(item) : (item.order_id || '未绑定检测项目')}</span>
              </div>
              <div className="approval-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>补充信息</button>
                <button className="btn btn-primary btn-sm" onClick={() => onApprove(item)}>通过</button>
                <button className="btn btn-danger btn-sm" onClick={() => onReject(item)}>驳回</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HistoryBookingModal({ now, equipmentFilter, departmentFilter, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadHistory() {
      setLoading(true);
      setError('');
      try {
        const data = await api.listEquipmentBookings({
          mine: true,
          equipment_id: equipmentFilter,
          department_id: departmentFilter
        });
        const history = (data.data || [])
          .filter((item) => isBookingExpired(item, now))
          .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());
        if (!ignore) setItems(history);
      } catch (e) {
        if (!ignore) setError(e.message || '加载历史预约失败');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadHistory();
    return () => {
      ignore = true;
    };
  }, [equipmentFilter, departmentFilter, now]);

  return (
    <div className="booking-modal-backdrop" onMouseDown={onClose}>
      <div className="booking-history-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="booking-history-head">
          <div>
            <h3>历史预约</h3>
            <span>共 {items.length} 条已归档预约</span>
          </div>
          <button type="button" className="booking-icon-button" onClick={onClose} title="关闭">×</button>
        </div>
        {error && <div className="booking-error">{error}</div>}
        {loading ? (
          <div className="booking-empty">加载历史预约中...</div>
        ) : (
          <div className="booking-history-table-wrap">
            <table className="table booking-history-table">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>部门</th>
                  <th>申请人</th>
                  <th>预约人</th>
                  <th>预约时间</th>
                  <th>检测项目</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.booking_id}>
                    <td>{item.equipment_name}</td>
                    <td>{item.department_name || '-'}</td>
                    <td>{formatUserLabel(item.booker_id, item.booker_name)}</td>
                    <td>{item.reserved_user_id ? formatUserLabel(item.reserved_user_id, item.reserved_user_name) : '待定'}</td>
                    <td>{formatDateTime(item.start_time)} 至 {formatDateTime(item.end_time)}</td>
                    <td>{item.test_item_id ? getTestItemTitle(item) : (item.order_id || '-')}</td>
                    <td>{item.note || '-'}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={7} className="booking-empty-cell">暂无历史预约</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingTable({ title, data, currentUserId, now, onCancel, onEdit, onApprove, onReject }) {
  return (
    <section className="booking-table-panel">
      <h3>{title}</h3>
      <div className="booking-table-wrap">
        <table className="table booking-table">
          <thead>
            <tr>
              <th>设备</th>
              <th>部门</th>
              <th>申请人</th>
              <th>预约人</th>
              <th>预约时间</th>
              <th>检测项目</th>
              <th>备注</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const status = getBookingStatus(item, now);
              const canEdit = (String(item.booker_id) === String(currentUserId) || item.can_approve) && status.className !== 'archived';
              const canCancel = (String(item.booker_id) === String(currentUserId) || item.can_cancel) && status.className !== 'archived';
              return (
                <tr key={item.booking_id} className={status.className === 'archived' ? 'booking-row-archived' : ''}>
                  <td>{item.equipment_name}</td>
                  <td>{item.department_name || '-'}</td>
                  <td>{formatUserLabel(item.booker_id, item.booker_name)}</td>
                  <td>{item.reserved_user_id ? formatUserLabel(item.reserved_user_id, item.reserved_user_name) : '待定'}</td>
                  <td>{formatDateTime(item.start_time)} 至 {formatDateTime(item.end_time)}</td>
                  <td>{item.test_item_id ? getTestItemTitle(item) : (item.order_id || '-')}</td>
                  <td>{item.note || '-'}</td>
                  <td><span className={`booking-status ${status.className}`}>{status.text}</span></td>
                  <td>
                    {item.can_approve ? (
                      <div className="booking-table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>编辑</button>
                        <button className="btn btn-primary btn-sm" onClick={() => onApprove(item)}>通过</button>
                        <button className="btn btn-danger btn-sm" onClick={() => onReject(item)}>驳回</button>
                      </div>
                    ) : canEdit || canCancel ? (
                      <div className="booking-table-actions">
                        {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>编辑</button>}
                        {canCancel && <button className="btn btn-danger btn-sm" onClick={() => onCancel(item)}>取消预约</button>}
                      </div>
                    ) : (
                      <span className="booking-muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!data.length && (
              <tr>
                <td colSpan={9} className="booking-empty-cell">暂无预约</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
