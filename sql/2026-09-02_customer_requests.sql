CREATE TABLE IF NOT EXISTS `customer_requests` (
  `request_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `request_type` enum('customer','payer','commissioner') NOT NULL,
  `payload` json NOT NULL,
  `applicant_id` varchar(20) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewer_id` varchar(20) DEFAULT NULL,
  `reject_reason` varchar(500) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`request_id`),
  KEY `idx_customer_requests_applicant` (`applicant_id`),
  KEY `idx_customer_requests_status` (`status`),
  CONSTRAINT `fk_customer_requests_applicant` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_customer_requests_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务员客户资料新增申请（JSON独立表单）';

ALTER TABLE `notifications`
  MODIFY COLUMN `type` enum('raw_data_upload','addon_request','cancel_request','delete_request','order_transfer_request','customer_request','system','other') NOT NULL DEFAULT 'other' COMMENT '通知类型',
  ADD COLUMN `related_customer_request_id` bigint unsigned DEFAULT NULL COMMENT '关联客户申请ID' AFTER `related_order_transfer_request_id`,
  ADD KEY `idx_notifications_customer_request` (`related_customer_request_id`),
  ADD CONSTRAINT `fk_notifications_customer_request` FOREIGN KEY (`related_customer_request_id`) REFERENCES `customer_requests` (`request_id`) ON DELETE SET NULL ON UPDATE CASCADE;
