import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import './Commissioners.css';
import '../PartyManagement.css';

const MAX_SIGNATURE_SIZE = 5 * 1024 * 1024;

export default function Commissioners() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const canManage = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [signatureUrls, setSignatureUrls] = useState({});
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const pageSize = 20;
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);
  const signatureUrlsRef = useRef({});
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || (user.role !== 'admin' && user.role !== 'sales' && user.user_id !== 'JC0089')) {
      navigate('/test-items');
    }
  }, [navigate]);

  function replaceSignatureUrls(nextUrls) {
    Object.values(signatureUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    signatureUrlsRef.current = nextUrls;
    setSignatureUrls(nextUrls);
  }

  async function load() {
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    try {
      const res = await api.listCommissioners({ q, page, pageSize, is_active: isActiveFilter });
      if (requestSequence !== requestSequenceRef.current) return;
      const rows = Array.isArray(res.data) ? res.data : [];
      setItems(rows);
      setTotal(res.total || 0);

      const signatures = await Promise.all(rows
        .filter((item) => item.signature_available)
        .map(async (item) => {
          try {
            const blob = await api.getCommissionerSignature(item.commissioner_id);
            return [String(item.commissioner_id), URL.createObjectURL(blob)];
          } catch {
            return null;
          }
        }));
      const nextUrls = Object.fromEntries(signatures.filter(Boolean));
      if (requestSequence !== requestSequenceRef.current) {
        Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      replaceSignatureUrls(nextUrls);
    } catch (error) {
      if (requestSequence === requestSequenceRef.current) {
        alert(error.message);
        navigate('/login');
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [q, page, isActiveFilter]);

  useEffect(() => () => {
    requestSequenceRef.current += 1;
    Object.values(signatureUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!previewItem) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPreviewItem(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewItem]);

  function chooseSignature(item) {
    uploadTargetRef.current = item;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function handleSignatureFile(event) {
    const file = event.target.files?.[0];
    const target = uploadTargetRef.current;
    if (!file || !target || uploadingId !== null) return;
    if (file.size > MAX_SIGNATURE_SIZE) {
      alert('委托人电子签名图片不能超过 5MB');
      return;
    }
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      alert('请选择 PNG 格式的电子签名图片');
      return;
    }

    setUploadingId(target.commissioner_id);
    try {
      await api.uploadCommissionerSignature(target.commissioner_id, file);
      await load();
    } catch (error) {
      alert(error.message || '电子签名上传失败，请重试');
    } finally {
      setUploadingId(null);
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteCommissioner(item) {
    if (!confirm(`确认删除委托人“${item.contact_name}”吗？`)) return;
    try {
      await api.deleteCommissioner(item.commissioner_id);
      await load();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteSignature(item) {
    if (!item.signature_available || !confirm(`确认删除“${item.contact_name}”的电子签名吗？`)) return;
    try {
      await api.deleteCommissionerSignature(item.commissioner_id);
      if (previewItem?.commissioner_id === item.commissioner_id) setPreviewItem(null);
      await load();
    } catch (error) {
      alert(error.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="commissioners-page party-management-page">
      <h2 className="party-page-title">委托人</h2>
      <div className="toolbar party-toolbar">
        <input
          className="input"
          placeholder="搜索（委托方名称、委托人、付款人、客户、电话号码）..."
          value={q}
          onChange={(event) => { setPage(1); setQ(event.target.value); }}
        />
        <select
          className="input"
          style={{ maxWidth: 160 }}
          value={isActiveFilter}
          onChange={(event) => { setPage(1); setIsActiveFilter(event.target.value); }}
        >
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        {canManage && <button className="btn party-button party-button-primary" onClick={() => navigate('/commissioners/new')}>+ 新增</button>}
      </div>

      <input
        ref={fileInputRef}
        className="commissioner-signature-input"
        type="file"
        accept="image/png,.png"
        onChange={handleSignatureFile}
      />

      <div className="commissioners-table-wrap party-table-wrap">
        <table className="table party-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>委托方名称</th>
              <th>委托人联系人</th>
              <th>付款人</th>
              <th>客户</th>
              <th>电话号码</th>
              <th>Email</th>
              <th>地址</th>
              <th>电子签名</th>
              {canManage && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr><td className="text-center text-muted" colSpan={canManage ? 10 : 9}>加载中...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td className="text-center text-muted" colSpan={canManage ? 10 : 9}>暂无委托人数据</td></tr>
            )}
            {items.map((item) => {
              const signatureUrl = signatureUrls[String(item.commissioner_id)];
              const uploading = uploadingId === item.commissioner_id;
              return (
                <tr key={item.commissioner_id}>
                  <td>{item.commissioner_id}</td>
                  <td>{item.commissioner_name || '-'}</td>
                  <td>{item.contact_name}</td>
                  <td>{item.payer_contact}</td>
                  <td>{item.customer_name}</td>
                  <td>{item.contact_phone || '-'}</td>
                  <td>{item.email || '-'}</td>
                  <td>{item.address || '-'}</td>
                  <td className="commissioner-signature-cell">
                    <div className="commissioner-signature-content">
                      {signatureUrl ? (
                        <button
                          type="button"
                          className="commissioner-signature-thumbnail-button"
                          onClick={() => setPreviewItem(item)}
                          aria-label={`查看${item.contact_name}的电子签名`}
                        >
                          <img src={signatureUrl} alt={`${item.contact_name}的电子签名`} />
                        </button>
                      ) : (
                        <span className="commissioner-signature-empty">（空）</span>
                      )}
                      <div className="commissioner-signature-actions">
                        <button className="btn party-button btn-sm commissioner-signature-upload-btn" disabled={uploading} onClick={() => chooseSignature(item)}>
                          {uploading ? '上传中...' : item.signature_available ? '重传' : '上传'}
                        </button>
                        <button className="btn party-button btn-sm commissioner-signature-upload-btn" disabled={!item.signature_available} onClick={() => deleteSignature(item)}>删除</button>
                      </div>
                    </div>
                  </td>
                  {canManage && <td className="actions party-actions">
                    <button className="btn party-button btn-sm" onClick={() => navigate(`/commissioners/${item.commissioner_id}`)}>编辑</button>
                    <button className="btn party-button btn-sm" onClick={() => deleteCommissioner(item)}>删除委托人</button>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="commissioners-pagination party-pagination">
        <button className="btn party-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
        <div>第 {page} / {totalPages} 页</div>
        <button className="btn party-button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button>
      </div>

      {previewItem && signatureUrls[String(previewItem.commissioner_id)] && (
        <div className="commissioner-signature-modal-backdrop" onMouseDown={() => setPreviewItem(null)}>
          <div
            className="commissioner-signature-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${previewItem.contact_name}的电子签名`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="commissioner-signature-modal-header">
              <div>
                <h3>电子签名</h3>
                <span>{previewItem.commissioner_name || previewItem.contact_name}</span>
              </div>
              <button type="button" className="commissioner-signature-modal-close" onClick={() => setPreviewItem(null)} aria-label="关闭">×</button>
            </div>
            <div className="commissioner-signature-modal-body">
              <img
                src={signatureUrls[String(previewItem.commissioner_id)]}
                alt={`${previewItem.contact_name}的电子签名大图`}
              />
            </div>
            <div className="commissioner-signature-modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewItem(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
