-- 费用结算表
CREATE TABLE IF NOT EXISTS `settlements` (
  `settlement_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '结算记录ID',
  `invoice_date` date NOT NULL COMMENT '开票日期',
  `order_ids` text NOT NULL COMMENT '委托单号组（多个委托单号用"-"拼接）',
  `invoice_amount` decimal(12,2) NOT NULL COMMENT '开票金额',
  `received_amount` decimal(12,2) DEFAULT NULL COMMENT '到账金额',
  `received_date` date DEFAULT NULL COMMENT '到账日期',
  `remarks` varchar(500) DEFAULT NULL COMMENT '备注',
  `payment_status` enum('未到款','已到款','部分到款') NOT NULL DEFAULT '未到款' COMMENT '到款情况',
  `customer_id` bigint unsigned NOT NULL COMMENT '客户ID（customers）',
  `assignee_id` varchar(20) DEFAULT NULL COMMENT '业务人员ID（users.user_id）',
  `customer_nature` varchar(64) DEFAULT NULL COMMENT '企业性质（冗余存储，从customers.nature获取）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`settlement_id`),
  KEY `idx_settlements_customer` (`customer_id`),
  KEY `idx_settlements_assignee` (`assignee_id`),
  KEY `idx_settlements_invoice_date` (`invoice_date`),
  KEY `idx_settlements_payment_status` (`payment_status`),
  CONSTRAINT `fk_settlements_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='费用结算表';












