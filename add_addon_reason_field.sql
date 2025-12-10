-- 为 test_items 表添加加测原因字段
-- 字段类型：VARCHAR，用于存储加测原因

ALTER TABLE test_items 
ADD COLUMN addon_reason VARCHAR(100) NULL 
COMMENT '加测原因：增加样品、增加测试人员、样品评估不足、增加测试时段、更换设备';

