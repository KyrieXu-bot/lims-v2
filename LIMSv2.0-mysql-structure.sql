-- MySQL dump 10.13  Distrib 8.0.39, for Win64 (x86_64)
--
-- Host: localhost    Database: jitri2
-- ------------------------------------------------------
-- Server version	8.0.39

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `assignments`
--

DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignments` (
  `assignment_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '分配记录ID',
  `test_item_id` bigint unsigned NOT NULL COMMENT '检测项目ID（test_items）',
  `assigned_to` varchar(20) NOT NULL COMMENT '执行技术员（users.user_id 工号）',
  `supervisor_id` varchar(20) DEFAULT NULL COMMENT '组长/审核人（users.user_id 工号）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否当前激活分配（系统保证唯一）',
  `note` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_by` varchar(20) NOT NULL COMMENT '指派人（users.user_id 工号）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `active_key` bigint GENERATED ALWAYS AS ((case when (`is_active` = 1) then `test_item_id` else NULL end)) STORED,
  PRIMARY KEY (`assignment_id`),
  UNIQUE KEY `uq_assignment_active` (`active_key`),
  KEY `idx_as_to` (`assigned_to`),
  KEY `idx_as_ti` (`test_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分配记录：仅保留激活标记，无时间段';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commissioners`
--

DROP TABLE IF EXISTS `commissioners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commissioners` (
  `commissioner_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '委托方ID',
  `payer_id` bigint unsigned NOT NULL COMMENT '关联付款方ID（payers）',
  `commissioner_name` varchar(255) DEFAULT NULL COMMENT '委托方名称',
  `contact_name` varchar(80) NOT NULL COMMENT '委托人',
  `contact_phone` varchar(40) DEFAULT NULL COMMENT '委托人电话',
  `email` varchar(120) DEFAULT NULL COMMENT '邮箱',
  `address` varchar(500) DEFAULT NULL COMMENT '地址',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`commissioner_id`),
  KEY `idx_commissioners_payer` (`payer_id`),
  KEY `idx_commissioners_email` (`email`),
  CONSTRAINT `fk_commissioners_payer` FOREIGN KEY (`payer_id`) REFERENCES `payers` (`payer_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='委托方：从付款方继承客户名称';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `customer_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '客户ID',
  `customer_name` varchar(160) NOT NULL COMMENT '客户名称',
  `address` varchar(255) DEFAULT NULL COMMENT '地址',
  `phone` varchar(40) DEFAULT NULL COMMENT '电话（可空）',
  `bank_name` varchar(160) DEFAULT NULL COMMENT '开户行信息（可空）',
  `tax_id` varchar(40) NOT NULL COMMENT '税号（唯一）',
  `bank_account` varchar(64) DEFAULT NULL COMMENT '银行账号（可空）',
  `province` varchar(64) DEFAULT NULL COMMENT '区域（省）',
  `nature` varchar(64) DEFAULT NULL COMMENT '性质（企业/高校/科研/个人等）',
  `scale` varchar(64) DEFAULT NULL COMMENT '规模（预留）',
  `cooperation_time` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '合作时间（yyyy-MM格式）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `tax_id` (`tax_id`),
  KEY `idx_customers_name` (`customer_name`),
  KEY `idx_customers_province` (`province`),
  KEY `idx_customers_cooperation_time` (`cooperation_time`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户库（税号唯一）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `department_id` smallint unsigned NOT NULL AUTO_INCREMENT COMMENT '部门ID',
  `department_name` varchar(80) NOT NULL COMMENT '部门名称（如 力学/显微/物化）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `department_name` (`department_name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `equipment`
--

DROP TABLE IF EXISTS `equipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment` (
  `equipment_id` int NOT NULL AUTO_INCREMENT,
  `equipment_no` varchar(100) DEFAULT NULL COMMENT '设备编号',
  `equipment_name` varchar(255) NOT NULL,
  `model` varchar(255) NOT NULL,
  `department_id` varchar(100) DEFAULT NULL,
  `equipment_label` varchar(100) DEFAULT NULL COMMENT '设备标签',
  `parameters_and_accuracy` varchar(255) DEFAULT NULL COMMENT '参数及精度',
  `validity_period` varchar(255) DEFAULT NULL COMMENT '有效期',
  `report_title` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(20) DEFAULT '正常' COMMENT '设备运行状态（正常、维修）',
  `status_update_time` datetime DEFAULT NULL COMMENT '状态变更时间',
  PRIMARY KEY (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=232 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lab_groups`
--

DROP TABLE IF EXISTS `lab_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_groups` (
  `group_id` smallint unsigned NOT NULL AUTO_INCREMENT COMMENT '实验小组ID',
  `group_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '小组编码（L/M/C/其他）',
  `group_name` varchar(64) NOT NULL COMMENT '小组名称',
  `department_id` smallint unsigned NOT NULL COMMENT '所属部门ID',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_code` (`group_code`),
  KEY `fk_labgroups_dept` (`department_id`),
  CONSTRAINT `fk_labgroups_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='实验小组（与部门关联）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `order_id` varchar(20) NOT NULL COMMENT '委托单号（业务主键，如 JC2504001 或其他前缀）',
  `customer_id` bigint unsigned NOT NULL COMMENT '客户ID（customers）',
  `payer_id` bigint unsigned DEFAULT NULL COMMENT '付款方ID（payers）',
  `commissioner_id` bigint unsigned DEFAULT NULL COMMENT '委托方ID（commissioners）',
  `created_by` varchar(20) NOT NULL COMMENT '开单员（users.user_id 工号）',
  `is_internal` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否内部委托（如失效分析）',
  `agreement_note` varchar(255) DEFAULT NULL COMMENT '合作协议/内委托备注',
  `note` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `total_price` decimal(12,2) DEFAULT NULL COMMENT '订单总价（人民币）',
  `delivery_days_after_receipt` int DEFAULT NULL COMMENT '收样后交付工作日（用于前端 deliveryDays）',
  `subcontracting_not_accepted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否不接受分包（1: 不接受）',
  `remarks` text COMMENT '备注',
  `settlement_status` enum('unpaid','paid','partial') DEFAULT 'unpaid' COMMENT '结算状态',
  PRIMARY KEY (`order_id`),
  KEY `idx_o_customer` (`customer_id`),
  KEY `idx_o_created` (`created_at`),
  KEY `fk_o_comm` (`commissioner_id`),
  KEY `fk_o_creator` (`created_by`),
  KEY `fk_o_payer` (`payer_id`),
  CONSTRAINT `fk_o_comm` FOREIGN KEY (`commissioner_id`) REFERENCES `commissioners` (`commissioner_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_o_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_o_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_o_payer` FOREIGN KEY (`payer_id`) REFERENCES `payers` (`payer_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='委托单（业务主键编码：JC+YYMM+序号）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `outsource_info`
--

DROP TABLE IF EXISTS `outsource_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outsource_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `test_item_id` bigint unsigned NOT NULL,
  `outsource_supplier` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '委外供应商名称',
  `outsource_contact` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '对接人',
  `outsource_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '对接人联系电话',
  `outsource_price` decimal(10,2) DEFAULT NULL COMMENT '委外价格',
  `outsource_report_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '委外报告文件路径',
  `return_tracking_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '寄回快递单号',
  `outsource_status` enum('pending','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '委外状态',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_test_item` (`test_item_id`),
  CONSTRAINT `outsource_info_ibfk_1` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payers`
--

DROP TABLE IF EXISTS `payers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payers` (
  `payer_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '付款方ID',
  `customer_id` bigint unsigned NOT NULL COMMENT '关联客户ID（customers）',
  `contact_name` varchar(80) NOT NULL COMMENT '付款人',
  `contact_phone` varchar(40) DEFAULT NULL COMMENT '付款人电话',
  `payment_term_days` int unsigned DEFAULT NULL COMMENT '账期（天）',
  `discount_rate` decimal(5,2) DEFAULT NULL COMMENT '折扣（百分比 0~100）',
  `owner_user_id` varchar(20) DEFAULT NULL COMMENT '业务绑定（负责人 users.user_id 工号）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`payer_id`),
  KEY `idx_payers_customer` (`customer_id`),
  KEY `idx_payers_contact` (`contact_name`),
  KEY `idx_payers_owner` (`owner_user_id`),
  CONSTRAINT `fk_payers_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payers_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='付款方：账期/折扣/业务绑定';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `price`
--

DROP TABLE IF EXISTS `price`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `price` (
  `price_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '价格项ID',
  `category_name` varchar(160) NOT NULL COMMENT '检测大类，如“金属室温拉伸（T）”',
  `detail_name` varchar(200) NOT NULL COMMENT '具体检测项目，如“金属抗拉强度/断后伸长率”',
  `test_code` varchar(40) DEFAULT NULL COMMENT '检测代码（用于检索/委外识别，如OS001）',
  `standard_code` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '检测标准编号（如 GB/T ...）',
  `department_id` smallint unsigned DEFAULT NULL COMMENT '归属部门ID',
  `group_id` smallint unsigned DEFAULT NULL COMMENT '归属实验小组ID（如 L/M/C）',
  `unit_price` varchar(100) NOT NULL COMMENT '收费标准',
  `minimum_price` varchar(255) DEFAULT NULL COMMENT '最低价格',
  `is_outsourced` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否委外（用于主界面标识/筛选）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `note` varchar(255) DEFAULT NULL COMMENT '备注',
  `active_from` date DEFAULT NULL COMMENT '生效开始日期（可选）',
  `active_to` date DEFAULT NULL COMMENT '生效结束日期（可选）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`price_id`),
  KEY `fk_price_group` (`group_id`),
  KEY `idx_price_code` (`test_code`),
  KEY `idx_price_cat` (`category_name`),
  CONSTRAINT `fk_price_group` FOREIGN KEY (`group_id`) REFERENCES `lab_groups` (`group_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4664 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='价格表：标准项目目录（大类/细项）与单价';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_files`
--

DROP TABLE IF EXISTS `project_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_files` (
  `file_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '文件ID',
  `category` enum('order_attachment','raw_data','experiment_report') NOT NULL COMMENT '文件类别',
  `filename` varchar(200) NOT NULL COMMENT '文件名',
  `filepath` varchar(300) NOT NULL COMMENT '文件路径',
  `order_id` varchar(20) DEFAULT NULL COMMENT '关联委托单（可空）',
  `test_item_id` bigint unsigned DEFAULT NULL COMMENT '关联检测项目（可空）',
  `sample_id` bigint unsigned DEFAULT NULL COMMENT '关联样品（可空）',
  `uploaded_by` varchar(20) NOT NULL COMMENT '上传人（users.user_id 工号）',
  `last_download_time` datetime(3) DEFAULT NULL COMMENT '最后下载时间',
  `last_download_by` varchar(120) DEFAULT NULL COMMENT '最后下载人姓名',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`file_id`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `idx_pf_cat` (`category`),
  KEY `idx_pf_order` (`order_id`),
  KEY `idx_pf_ti` (`test_item_id`),
  KEY `idx_pf_sample` (`sample_id`),
  KEY `idx_category` (`category`),
  CONSTRAINT `project_files_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_files_ibfk_2` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `project_files_ibfk_3` FOREIGN KEY (`sample_id`) REFERENCES `samples` (`sample_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `project_files_ibfk_4` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='附件：原始记录/委外报告/收样照片等';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `report_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` varchar(20) NOT NULL COMMENT '关联 orders.order_id',
  `vat_type` tinyint NOT NULL DEFAULT '1' COMMENT '发票类型：1 普通，2 专用（对应前端 vatType）',
  `report_type` json DEFAULT NULL COMMENT '报告文档多选数组，存前端 reportInfo.type，例如 [1,2,3]',
  `paper_report_shipping_type` tinyint DEFAULT NULL COMMENT '纸质寄送方式（1 委托方 2 付款方 3 其它）',
  `report_additional_info` varchar(500) DEFAULT NULL COMMENT '纸质报告的额外信息/地址',
  `header_type` tinyint DEFAULT NULL COMMENT '报告抬头类型（1 同委托方 2 其它）',
  `header_other` varchar(500) DEFAULT NULL COMMENT '报告抬头为其它时的补充信息',
  `format_type` tinyint DEFAULT NULL COMMENT '报告版式（1 单份 2 每项一份 等）',
  `report_seals` json DEFAULT NULL COMMENT '报告印章要求，如 ["normal","cnas","cma"]',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_reports_order_id` (`order_id`),
  KEY `idx_reports_created` (`created_at`),
  CONSTRAINT `fk_reports_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='委托单对应的报告设置（reportInfo / vatType /report_seals 等）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `role_id` tinyint unsigned NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `role_code` varchar(32) NOT NULL COMMENT '角色编码：admin/leader/supervisor/technician/sales/finance 等',
  `role_name` varchar(64) NOT NULL COMMENT '角色名称（中文）',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_code` (`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sample_handling`
--

DROP TABLE IF EXISTS `sample_handling`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sample_handling` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` varchar(20) NOT NULL COMMENT '关联 orders.order_id',
  `handling_type` tinyint NOT NULL DEFAULT '1' COMMENT '处理方式：1 服务方处理(保留) 2 委托方自取 3 服务方协助寄回 4 无剩余样品（对应前端 sampleSolutionType）',
  `return_info` json DEFAULT NULL COMMENT '当 handling_type=3 时的 return_info（包含 returnAddressOption、returnAddress 等）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_sample_handling_order` (`order_id`),
  CONSTRAINT `fk_sample_handling_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品处置信息（sampleHandling）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sample_requirements`
--

DROP TABLE IF EXISTS `sample_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sample_requirements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` varchar(20) NOT NULL COMMENT '关联 orders.order_id',
  `hazards` json DEFAULT NULL COMMENT '危险特性数组，例如 ["Safety","Flammability","Other"]',
  `hazard_other` varchar(255) DEFAULT NULL COMMENT '危险特性其它说明',
  `magnetism` varchar(50) DEFAULT NULL COMMENT '磁性（Non-magnetic/Weak-magnetic/Strong-magnetic/Unknown）',
  `conductivity` varchar(50) DEFAULT NULL COMMENT '导电性（Conductor/Semiconductor/Insulator/Unknown）',
  `breakable` enum('yes','no') DEFAULT NULL COMMENT '是否可破坏（yes/no）',
  `brittle` enum('yes','no') DEFAULT NULL COMMENT '是否孤品（yes/no）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_sample_requirements_order` (`order_id`),
  CONSTRAINT `fk_sample_requirements_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品要求（sampleRequirements）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sample_return_info`
--

DROP TABLE IF EXISTS `sample_return_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sample_return_info` (
  `return_info_id` int NOT NULL AUTO_INCREMENT,
  `tracking_id` int NOT NULL COMMENT '关联样品追踪ID',
  `test_item_id` int NOT NULL COMMENT '检测项目ID',
  `return_method` enum('pickup','delivery','disposal') NOT NULL COMMENT '回收方式：pickup-客户自取，delivery-寄回客户，disposal-销毁处理',
  `return_tracking_no` varchar(255) DEFAULT NULL COMMENT '寄送单号',
  `return_status` enum('pending','shipped','delivered','picked_up') DEFAULT 'pending' COMMENT '回收状态',
  `return_notes` text COMMENT '回收备注',
  `returned_by` varchar(100) DEFAULT NULL COMMENT '处理人员工号',
  `returned_at` datetime DEFAULT NULL COMMENT '处理时间',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_info_id`),
  KEY `idx_tracking_id` (`tracking_id`),
  KEY `idx_test_item_id` (`test_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品回收信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sample_tracking`
--

DROP TABLE IF EXISTS `sample_tracking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sample_tracking` (
  `tracking_id` int NOT NULL AUTO_INCREMENT,
  `test_item_id` int NOT NULL COMMENT '关联的检测项目ID',
  `order_id` varchar(100) NOT NULL COMMENT '委托单号',
  `category_name` varchar(255) NOT NULL COMMENT '大类名称',
  `sample_name` varchar(255) DEFAULT NULL COMMENT '样品名称',
  `material` varchar(255) DEFAULT NULL COMMENT '材质',
  `original_no` varchar(255) DEFAULT NULL COMMENT '样品原号',
  `barcode` varchar(255) NOT NULL COMMENT '扫码内容（可能是test_item_id或其他标识）',
  `current_status` enum('received','testing_completed','returned') NOT NULL DEFAULT 'received' COMMENT '当前状态：received-已接收，testing_completed-检测完成，returned-已回收',
  `lab_type` enum('mechanics','microscopy','physical_chemistry') NOT NULL COMMENT '实验室类型：mechanics-力学，microscopy-显微，physical_chemistry-物化',
  `received_by` varchar(100) DEFAULT NULL COMMENT '接收人员工号',
  `received_at` datetime DEFAULT NULL COMMENT '接收时间',
  `testing_completed_by` varchar(100) DEFAULT NULL COMMENT '检测完成人员工号',
  `testing_completed_at` datetime DEFAULT NULL COMMENT '检测完成时间',
  `returned_by` varchar(100) DEFAULT NULL COMMENT '回收人员工号',
  `returned_at` datetime DEFAULT NULL COMMENT '回收时间',
  `notes` text COMMENT '备注信息',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tracking_id`),
  KEY `idx_test_item_id` (`test_item_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_barcode` (`barcode`),
  KEY `idx_current_status` (`current_status`),
  KEY `idx_lab_type` (`lab_type`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品追踪表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `samples`
--

DROP TABLE IF EXISTS `samples`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `samples` (
  `sample_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '样品ID',
  `order_id` varchar(20) NOT NULL COMMENT '所属委托单号（orders.order_id）',
  `test_item_id` bigint unsigned DEFAULT NULL COMMENT '关联检测项目ID（常见一一；若未来要多对多可增映射表）',
  `sample_code` varchar(80) DEFAULT NULL COMMENT '样品条码/编号（扫码）',
  `description` varchar(255) DEFAULT NULL COMMENT '样品描述',
  `quantity_received` int DEFAULT NULL COMMENT '收样数量',
  `residue_qty` int DEFAULT NULL COMMENT '余样数量',
  `handling_method` enum('return','keep','dispose') DEFAULT NULL COMMENT '样品处理方式：寄回/留样/销毁',
  `return_required` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需寄回客户',
  `return_tracking_no` varchar(80) DEFAULT NULL COMMENT '寄回快递单号',
  `return_confirmed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '寄回确认（样品管理员确认）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`sample_id`),
  KEY `fk_s_ti` (`test_item_id`),
  KEY `idx_s_order` (`order_id`),
  KEY `idx_s_code` (`sample_code`),
  CONSTRAINT `fk_s_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_s_ti` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品：寄回/余样信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `test_items`
--

DROP TABLE IF EXISTS `test_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_items` (
  `test_item_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '检测项目ID',
  `order_id` varchar(20) NOT NULL COMMENT '所属委托单号（orders.order_id）',
  `price_id` bigint unsigned DEFAULT NULL COMMENT '引用标准价格项（price）',
  `category_name` varchar(160) NOT NULL COMMENT '检测大类（如 金属室温拉伸（T））',
  `detail_name` varchar(200) NOT NULL COMMENT '具体检测项目（如 金属抗拉强度/断后伸长率）',
  `sample_name` varchar(200) DEFAULT NULL COMMENT '样品名称（前端传）',
  `material` varchar(200) DEFAULT NULL COMMENT '材质/材料（前端传）',
  `sample_type` varchar(120) DEFAULT NULL COMMENT '样品类型（前端传）',
  `original_no` varchar(120) DEFAULT NULL COMMENT '原始编号（前端传）',
  `test_code` varchar(40) DEFAULT NULL COMMENT '检测代码（如 OS001；也用于委外识别）',
  `standard_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '检测标准编号（GB/T ...）',
  `department_id` smallint unsigned DEFAULT NULL COMMENT '执行部门ID',
  `group_id` smallint unsigned DEFAULT NULL COMMENT '执行小组ID（L/M/C）',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '件数/数量',
  `unit_price` decimal(10,2) DEFAULT NULL COMMENT '单价（下单时冻结；非标可手填）',
  `discount_rate` decimal(5,2) DEFAULT NULL COMMENT '折扣率（百分比整数0-100，如10表示10%），从付款方带出，可修改',
  `final_unit_price` decimal(10,2) DEFAULT NULL COMMENT '折后单价',
  `line_total` decimal(12,2) DEFAULT NULL COMMENT '行小计=折后单价*数量（可应用计算回填）',
  `machine_hours` decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '机时（记录）',
  `work_hours` decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '工时（记录）',
  `is_add_on` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否加测',
  `is_outsourced` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否委外（从价格项/代码识别后冻结）',
  `seq_no` int DEFAULT NULL COMMENT '流转顺序号（可选，用于按实验室顺序展示）',
  `sample_preparation` varchar(255) DEFAULT NULL COMMENT '样品预处理（前端传）',
  `note` varchar(255) DEFAULT NULL COMMENT '备注（前端传）',
  `status` enum('new','assigned','running','waiting_review','report_uploaded','completed','cancelled') NOT NULL DEFAULT 'new' COMMENT '项目状态（精简）',
  `abnormal_condition` varchar(255) DEFAULT NULL COMMENT '异常情况',
  `current_assignee` varchar(20) DEFAULT NULL COMMENT '当前执行人（users.user_id 工号），便于我的任务查询',
  `arrival_mode` enum('on_site','delivery') DEFAULT NULL COMMENT '样品到达方式：现场/寄样',
  `sample_arrival_status` enum('arrived','not_arrived') NOT NULL DEFAULT 'not_arrived' COMMENT '样品是否已到（未到则流程受限）',
  `service_urgency` enum('normal','urgent_1_5x','urgent_2x') NOT NULL DEFAULT 'normal' COMMENT '服务加急类型: normal-不加急, urgent_1_5x-加急1.5倍, urgent_2x-特急2倍',
  `equipment_id` int DEFAULT NULL COMMENT '使用的设备ID',
  `check_notes` text COMMENT '审批备注',
  `test_notes` text COMMENT '实验备注',
  `supervisor_id` varchar(20) DEFAULT NULL COMMENT '负责人（users.user_id 工号）',
  `technician_id` varchar(20) DEFAULT NULL COMMENT '实验员（users.user_id 工号）',
  `assignment_note` text COMMENT '指派备注',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `field_test_time` datetime DEFAULT NULL COMMENT '现场测试时间',
  `actual_delivery_date` date DEFAULT NULL COMMENT '实际交付日期',
  `business_note` text COMMENT '业务备注',
  `actual_sample_quantity` int DEFAULT NULL COMMENT '实际样品数量',
  `price_note` int DEFAULT NULL COMMENT '价格备注',
  `unit` varchar(20) DEFAULT '机时' COMMENT '单位（机时/样品数/元素/点位）',
  `business_confirmed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '业务确认价格',
  PRIMARY KEY (`test_item_id`),
  KEY `fk_ti_price` (`price_id`),
  KEY `fk_ti_dept` (`department_id`),
  KEY `fk_ti_assignee` (`current_assignee`),
  KEY `idx_ti_order` (`order_id`),
  KEY `idx_ti_code` (`test_code`),
  KEY `idx_ti_group_status` (`group_id`,`status`),
  KEY `idx_ti_supervisor` (`supervisor_id`),
  KEY `idx_ti_technician` (`technician_id`),
  CONSTRAINT `fk_ti_assignee` FOREIGN KEY (`current_assignee`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_group` FOREIGN KEY (`group_id`) REFERENCES `lab_groups` (`group_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_price` FOREIGN KEY (`price_id`) REFERENCES `price` (`price_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_technician` FOREIGN KEY (`technician_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='检测项目：大类/细项直存；支持非标、加测、委外';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` varchar(20) NOT NULL COMMENT '员工工号',
  `role_id` tinyint unsigned NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `fk_ur_role` (`role_id`),
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户-角色 关系';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` varchar(20) NOT NULL COMMENT '员工工号（如 LX005/WH012/XW123/YW888）',
  `account` varchar(255) NOT NULL COMMENT '登录账号（唯一）',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `name` varchar(100) NOT NULL COMMENT '姓名',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱（可空）',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号（可空）',
  `group_id` smallint unsigned DEFAULT NULL COMMENT '归属实验小组ID',
  `department_id` int DEFAULT NULL,
  `group_role` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '组内职能：leader=主任/负责人, supervisor=组长, member=组员',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `account` (`account`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_group` (`group_id`),
  KEY `idx_users_department_id` (`department_id`),
  CONSTRAINT `fk_users_group` FOREIGN KEY (`group_id`) REFERENCES `lab_groups` (`group_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表：主键为员工工号；强制一人仅属一个小组';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '通知ID',
  `user_id` varchar(20) NOT NULL COMMENT '接收用户ID（users.user_id 工号）',
  `title` varchar(255) NOT NULL COMMENT '通知标题',
  `content` text NOT NULL COMMENT '通知内容',
  `type` enum('raw_data_upload','addon_request','system','other') NOT NULL DEFAULT 'other' COMMENT '通知类型',
  `is_read` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已读',
  `related_order_id` varchar(20) DEFAULT NULL COMMENT '关联委托单号（orders.order_id）',
  `related_test_item_id` bigint unsigned DEFAULT NULL COMMENT '关联检测项目ID（test_items.test_item_id）',
  `related_file_id` bigint unsigned DEFAULT NULL COMMENT '关联文件ID（project_files.file_id）',
  `related_addon_request_id` bigint unsigned DEFAULT NULL COMMENT '关联加测申请ID（addon_requests.request_id）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `read_at` datetime(3) DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user` (`user_id`),
  KEY `idx_notifications_read` (`is_read`),
  KEY `idx_notifications_created` (`created_at`),
  KEY `idx_notifications_order` (`related_order_id`),
  KEY `idx_notifications_test_item` (`related_test_item_id`),
  KEY `idx_notifications_file` (`related_file_id`),
  KEY `idx_notifications_addon_request` (`related_addon_request_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_order` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_test_item` FOREIGN KEY (`related_test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_file` FOREIGN KEY (`related_file_id`) REFERENCES `project_files` (`file_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_addon_request` FOREIGN KEY (`related_addon_request_id`) REFERENCES `addon_requests` (`request_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息通知表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `addon_requests`
--

DROP TABLE IF EXISTS `addon_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addon_requests` (
  `request_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '加测申请ID',
  `applicant_id` varchar(20) NOT NULL COMMENT '申请人ID（users.user_id 工号）',
  `order_id` varchar(20) DEFAULT NULL COMMENT '关联委托单号（orders.order_id）',
  `test_item_data` json NOT NULL COMMENT '检测项目数据（JSON格式）',
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '申请状态',
  `note` text COMMENT '申请备注',
  `approved_by` varchar(20) DEFAULT NULL COMMENT '审核人ID（users.user_id 工号）',
  `approved_at` datetime(3) DEFAULT NULL COMMENT '审核时间',
  `test_item_id` bigint unsigned DEFAULT NULL COMMENT '创建的检测项目ID（test_items.test_item_id）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (`request_id`),
  KEY `idx_addon_requests_applicant` (`applicant_id`),
  KEY `idx_addon_requests_order` (`order_id`),
  KEY `idx_addon_requests_status` (`status`),
  KEY `idx_addon_requests_created` (`created_at`),
  CONSTRAINT `fk_addon_requests_applicant` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_addon_requests_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_addon_requests_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_addon_requests_test_item` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='加测申请表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'jitri2'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-05 15:34:50
