-- 设备预约功能表结构
-- 请在确认线上库表名/字符集后手动执行；Codex 未执行本脚本。

CREATE TABLE IF NOT EXISTS `equipment_bookings` (
  `booking_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '预约ID',
  `equipment_id` int NOT NULL COMMENT '设备ID，对应 equipment.equipment_id',
  `booker_id` varchar(20) NOT NULL COMMENT '申请人/操作人，对应 users.user_id',
  `reserved_user_id` varchar(20) DEFAULT NULL COMMENT '实际预约人/上机实验员，对应 users.user_id，可待定',
  `start_time` datetime(3) NOT NULL COMMENT '预约开始时间，允许跨天',
  `end_time` datetime(3) NOT NULL COMMENT '预约结束时间，必须晚于开始时间',
  `order_id` varchar(20) DEFAULT NULL COMMENT '可选绑定委托单号',
  `test_item_id` bigint unsigned DEFAULT NULL COMMENT '可选绑定检测项目ID',
  `note` varchar(800) DEFAULT NULL COMMENT '预约备注',
  `status` enum('active','cancelled','rejected') NOT NULL DEFAULT 'active' COMMENT '锁定状态：active=占用时间；cancelled/rejected=释放时间',
  `approval_status` enum('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required' COMMENT '审批状态：力学/管理员无需审批，显微默认待审批',
  `approved_by` varchar(20) DEFAULT NULL COMMENT '审批人',
  `approved_at` datetime(3) DEFAULT NULL COMMENT '审批时间',
  `rejection_reason` varchar(500) DEFAULT NULL COMMENT '驳回原因',
  `cancelled_by` varchar(20) DEFAULT NULL COMMENT '取消人',
  `cancelled_at` datetime(3) DEFAULT NULL COMMENT '取消时间',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  KEY `idx_equipment_bookings_equipment_time` (`equipment_id`, `status`, `start_time`, `end_time`),
  KEY `idx_equipment_bookings_booker_time` (`booker_id`, `status`, `start_time`),
  KEY `idx_equipment_bookings_reserved_time` (`reserved_user_id`, `status`, `start_time`),
  KEY `idx_equipment_bookings_approval` (`approval_status`, `status`, `start_time`),
  KEY `idx_equipment_bookings_order` (`order_id`),
  KEY `idx_equipment_bookings_test_item` (`test_item_id`),
  KEY `fk_equipment_bookings_cancelled_by` (`cancelled_by`),
  KEY `fk_equipment_bookings_approved_by` (`approved_by`),
  CONSTRAINT `fk_equipment_bookings_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`equipment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_booker` FOREIGN KEY (`booker_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_reserved_user` FOREIGN KEY (`reserved_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_test_item` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_equipment_bookings_time` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备预约记录';

-- 如果你已经按旧版本创建过 equipment_bookings，可以参考下面的迁移语句手动调整。
-- ALTER TABLE `equipment_bookings`
--   MODIFY COLUMN `booker_id` varchar(20) NOT NULL COMMENT '申请人/操作人，对应 users.user_id',
--   ADD COLUMN `reserved_user_id` varchar(20) DEFAULT NULL COMMENT '实际预约人/上机实验员，对应 users.user_id，可待定' AFTER `booker_id`,
--   MODIFY COLUMN `status` enum('active','cancelled','rejected') NOT NULL DEFAULT 'active' COMMENT '锁定状态：active=占用时间；cancelled/rejected=释放时间',
--   ADD COLUMN `approval_status` enum('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required' COMMENT '审批状态' AFTER `status`,
--   ADD COLUMN `approved_by` varchar(20) DEFAULT NULL COMMENT '审批人' AFTER `approval_status`,
--   ADD COLUMN `approved_at` datetime(3) DEFAULT NULL COMMENT '审批时间' AFTER `approved_by`,
--   ADD COLUMN `rejection_reason` varchar(500) DEFAULT NULL COMMENT '驳回原因' AFTER `approved_at`,
--   ADD INDEX `idx_equipment_bookings_reserved_time` (`reserved_user_id`, `status`, `start_time`),
--   ADD INDEX `idx_equipment_bookings_approval` (`approval_status`, `status`, `start_time`),
--   ADD INDEX `fk_equipment_bookings_approved_by` (`approved_by`),
--   ADD CONSTRAINT `fk_equipment_bookings_reserved_user` FOREIGN KEY (`reserved_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
--   ADD CONSTRAINT `fk_equipment_bookings_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 可选：如果希望设备列表按标签/部门检索更快，可以补充索引。
-- ALTER TABLE `equipment` ADD INDEX `idx_equipment_booking_scope` (`equipment_label`, `department_id`, `status`);
