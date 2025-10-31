-- 为commissioners表添加委托方名称(commissioner_name)和地址(address)字段
ALTER TABLE `commissioners` 
ADD COLUMN `commissioner_name` varchar(255) DEFAULT NULL COMMENT '委托方名称' AFTER `payer_id`,
ADD COLUMN `address` varchar(500) DEFAULT NULL COMMENT '地址' AFTER `email`;

