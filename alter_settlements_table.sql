-- 修改settlements表，添加customer_name字段，并允许customer_id为NULL
ALTER TABLE `settlements` 
  ADD COLUMN `customer_name` varchar(160) DEFAULT NULL COMMENT '客户名称（可自定义，不一定要在customers表中）' AFTER `customer_id`,
  MODIFY COLUMN `customer_id` bigint unsigned DEFAULT NULL COMMENT '客户ID（customers，可为空，如果为空则使用customer_name）';

-- 修改外键约束，允许customer_id为NULL时删除限制
-- 注意：MySQL中，如果外键列允许NULL，外键约束仍然有效，但NULL值不会触发约束检查
-- 如果需要，可以先删除外键再重新创建
ALTER TABLE `settlements` 
  DROP FOREIGN KEY `fk_settlements_customer`;

ALTER TABLE `settlements` 
  ADD CONSTRAINT `fk_settlements_customer` 
  FOREIGN KEY (`customer_id`) 
  REFERENCES `customers` (`customer_id`) 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

