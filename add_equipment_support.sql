-- 添加equipment表
CREATE TABLE IF NOT EXISTS `equipment` (
  `equipment_id` int NOT NULL AUTO_INCREMENT,
  `equipment_no` varchar(100) DEFAULT NULL COMMENT '设备编号',
  `equipment_name` varchar(255) NOT NULL,
  `model` varchar(255) NOT NULL,
  `department_id` varchar(100) DEFAULT NULL,
  `equipment_label` varchar(100) DEFAULT NULL COMMENT '设备标签',
  `parameters_and_accuracy` varchar(255) DEFAULT NULL COMMENT '参数及精度',
  `validity_period` varchar(255) DEFAULT NULL COMMENT '有效期',
  `report_title` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=120 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 为test_items表添加equipment_id字段
ALTER TABLE test_items 
ADD COLUMN equipment_id INT NULL COMMENT '使用的设备ID' 
AFTER sample_arrival_status;

-- 添加审批备注字段
ALTER TABLE test_items 
ADD COLUMN check_notes TEXT NULL COMMENT '审批备注' 
AFTER equipment_id;

-- 添加实验备注字段
ALTER TABLE test_items 
ADD COLUMN test_notes TEXT NULL COMMENT '实验备注' 
AFTER check_notes;

-- 添加外键约束（可选，建议在数据迁移完成后添加）
-- ALTER TABLE test_items 
-- ADD CONSTRAINT fk_test_items_equipment 
-- FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) 
-- ON DELETE SET NULL ON UPDATE CASCADE;
