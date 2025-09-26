-- 为委托单登记表和平台设备清单添加必要字段

-- 为orders表添加服务加急字段
ALTER TABLE orders 
ADD COLUMN period_type ENUM('normal', 'urgent_1_5x', 'urgent_2x') DEFAULT 'normal' COMMENT '服务加急类型：normal-不加急，urgent_1_5x-加急1.5倍，urgent_2x-特急2倍';

-- 为test_items表添加现场测试时间字段
ALTER TABLE test_items 
ADD COLUMN field_test_time DATETIME NULL COMMENT '现场测试时间';

-- 为test_items表添加实际交付日期字段
ALTER TABLE test_items 
ADD COLUMN actual_delivery_date DATE NULL COMMENT '实际交付日期';

-- 为test_items表添加实际样品数量字段（区别于开单登记的quantity）
ALTER TABLE test_items 
ADD COLUMN actual_sample_quantity INT NULL COMMENT '实际样品数量';

-- 为test_items表添加测试工时字段（如果不存在）
ALTER TABLE test_items 
ADD COLUMN work_hours DECIMAL(8,2) NULL COMMENT '测试工时';

-- 为test_items表添加测试机时字段（如果不存在）
ALTER TABLE test_items 
ADD COLUMN machine_hours DECIMAL(8,2) NULL COMMENT '测试机时';
