-- 在test_items表中添加unpaid_amount字段（开票金额）
ALTER TABLE `test_items` 
  ADD COLUMN `unpaid_amount` decimal(12,2) DEFAULT NULL COMMENT '开票未到款金额' AFTER `final_unit_price`;

