-- LIMS-v2 settlement payment methods and invoice/prepayment allocation lots.
-- Run manually after sql/2026-05-26_settlement_prepayment_accounts.sql.

ALTER TABLE settlements
  ADD COLUMN settlement_method ENUM('invoice','prepaid','mixed') NOT NULL DEFAULT 'invoice' COMMENT '结算方式：invoice=纯开票，prepaid=余额支付，mixed=组合支付' AFTER settlement_type,
  ADD COLUMN new_invoice_number VARCHAR(30) DEFAULT NULL COMMENT '组合支付/纯开票中新开票号' AFTER invoice_number,
  ADD COLUMN new_invoice_amount DECIMAL(12,2) DEFAULT NULL COMMENT '组合支付中新开票金额' AFTER invoice_amount,
  ADD KEY idx_settlements_method (`settlement_method`);

CREATE TABLE IF NOT EXISTS settlement_payment_allocations (
  allocation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '结算支付分摊ID',
  settlement_id BIGINT UNSIGNED NOT NULL COMMENT '消费/结算流水ID',
  payer_id BIGINT UNSIGNED NOT NULL COMMENT '付款方ID',
  payment_source_type ENUM('prepayment','invoice') NOT NULL COMMENT '支付来源：prepayment=预存票余额，invoice=新开票',
  source_settlement_id BIGINT UNSIGNED DEFAULT NULL COMMENT '预存充值流水ID；新开票为空',
  invoice_number VARCHAR(30) NOT NULL COMMENT '本次分摊对应票号',
  invoice_date DATE DEFAULT NULL COMMENT '票号开票日期',
  amount DECIMAL(12,2) NOT NULL COMMENT '本次使用/新开金额',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`allocation_id`),
  KEY idx_spa_settlement (`settlement_id`),
  KEY idx_spa_payer (`payer_id`),
  KEY idx_spa_source_settlement (`source_settlement_id`),
  KEY idx_spa_invoice_number (`invoice_number`),
  CONSTRAINT fk_spa_settlement FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`settlement_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_spa_payer FOREIGN KEY (`payer_id`) REFERENCES `payers` (`payer_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_spa_source_settlement FOREIGN KEY (`source_settlement_id`) REFERENCES `settlements` (`settlement_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='结算支付来源分摊：预存票FIFO扣款/新开票组成';
