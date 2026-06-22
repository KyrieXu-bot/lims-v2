-- LIMS-v2 settlement approval, prepayment, and payer account ledger.
-- Run this manually after backing up the database.

ALTER TABLE settlements
  ADD COLUMN settlement_type ENUM('invoice','prepayment') NOT NULL DEFAULT 'invoice' COMMENT '流水类型：invoice=普通开票结算，prepayment=预存充值' AFTER settlement_id,
  ADD COLUMN payer_id BIGINT UNSIGNED DEFAULT NULL COMMENT '付款方ID（payers）' AFTER customer_nature,
  ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审批状态' AFTER payment_status,
  ADD COLUMN approved_by VARCHAR(20) DEFAULT NULL COMMENT '审批人（users.user_id）' AFTER approval_status,
  ADD COLUMN approved_at DATETIME(3) DEFAULT NULL COMMENT '审批时间' AFTER approved_by,
  ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT '审批意见' AFTER approved_at,
  ADD KEY idx_settlements_type (`settlement_type`),
  ADD KEY idx_settlements_payer (`payer_id`),
  ADD KEY idx_settlements_approval (`approval_status`),
  ADD CONSTRAINT fk_settlements_payer FOREIGN KEY (`payer_id`) REFERENCES `payers` (`payer_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_settlements_approved_by FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS payer_balance_transactions (
  transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '账户流水ID',
  payer_id BIGINT UNSIGNED NOT NULL COMMENT '付款方ID',
  settlement_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联结算/预存流水ID',
  transaction_type ENUM('prepayment_credit','settlement_debit','invoice_receipt_credit','adjustment') NOT NULL COMMENT '流水类型',
  direction ENUM('credit','debit') NOT NULL COMMENT '方向：credit=增加余额，debit=扣减余额',
  amount DECIMAL(12,2) NOT NULL COMMENT '流水金额',
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发生时间',
  remarks VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_by VARCHAR(20) DEFAULT NULL COMMENT '创建人',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`transaction_id`),
  UNIQUE KEY uq_payer_tx_source (`settlement_id`, `transaction_type`),
  KEY idx_payer_balance_payer (`payer_id`),
  KEY idx_payer_balance_type (`transaction_type`),
  KEY idx_payer_balance_occurred (`occurred_at`),
  CONSTRAINT fk_payer_balance_payer FOREIGN KEY (`payer_id`) REFERENCES `payers` (`payer_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_payer_balance_settlement FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`settlement_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_payer_balance_created_by FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='付款方预存/扣款/到账账户流水';

-- Optional backfill: map historical invoice settlements to payer_id by order_ids.
-- Review first if one settlement can contain orders from multiple payer_ids.
-- UPDATE settlements s
-- JOIN orders o ON FIND_IN_SET(o.order_id, REPLACE(s.order_ids, '-', ',')) > 0
-- SET s.payer_id = o.payer_id
-- WHERE s.payer_id IS NULL AND o.payer_id IS NOT NULL;
