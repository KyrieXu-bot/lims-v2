import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import DetailViewLink from '../../components/DetailViewLink.jsx';
import './PayerLedger.css';

const TX_TYPE_TEXT = {
  prepayment_credit: '预存入账',
  settlement_debit: '结算扣款',
  invoice_receipt_credit: '到账冲抵',
  adjustment: '手工调整'
};

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `¥${amount.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

export default function PayerLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const result = await api.getPayerLedger(id);
        setData(result);
      } catch (e) {
        alert(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div>加载中...</div>;
  if (!data) return <div>暂无数据</div>;

  const { payer, summary, transactions } = data;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2>付款方账户流水</h2>
        <button className="btn" onClick={() => navigate('/payers')}>返回付款方</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{payer.contact_name}（{payer.customer_name}）</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: 12 }}>
          <div><strong>当前余额</strong><br />{formatCurrency(summary.current_balance)}</div>
          <div><strong>预存入账</strong><br />{formatCurrency(summary.prepaid_balance)}</div>
          <div><strong>待结算金额</strong><br />{formatCurrency(summary.pending_settlement_amount)}</div>
          <div><strong>已扣款金额</strong><br />{formatCurrency(summary.settlement_debit_amount)}</div>
          <div><strong>到账冲抵</strong><br />{formatCurrency(summary.receipt_credit_amount)}</div>
        </div>
      </div>

      <div className="payer-ledger-table-wrap">
        <table className="table payer-ledger-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>流水类型</th>
              <th>方向</th>
              <th>金额</th>
              <th>结算流水</th>
              <th>票号</th>
              <th>委托单号组</th>
              <th>备注</th>
              <th>创建人</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: 20 }}>暂无流水</td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.transaction_id}>
                <td>{formatDate(tx.occurred_at)}</td>
                <td>{TX_TYPE_TEXT[tx.transaction_type] || tx.transaction_type}</td>
                <td>{tx.direction === 'credit' ? '增加' : '扣减'}</td>
                <td style={{ color: tx.direction === 'credit' ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                  {tx.direction === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                </td>
                <td>{tx.settlement_id || '-'}</td>
                <td>
                  <DetailViewLink
                    text={tx.invoice_number || ''}
                    maxLength={22}
                    fieldName="票号"
                    className="payer-ledger-detail-link"
                  />
                </td>
                <td>{tx.order_ids || '-'}</td>
                <td>
                  <DetailViewLink
                    text={tx.remarks || ''}
                    maxLength={28}
                    fieldName="备注"
                    className="payer-ledger-detail-link"
                  />
                </td>
                <td>{tx.created_by_name || tx.created_by || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
