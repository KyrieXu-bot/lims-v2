CREATE TABLE IF NOT EXISTS `system_announcements` (
  `announcement_key` varchar(80) NOT NULL,
  `title` varchar(120) NOT NULL,
  `summary` varchar(255) NOT NULL,
  `content_json` json NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `run_id` varchar(64) DEFAULT NULL,
  `auto_close_at` datetime(3) DEFAULT NULL,
  `enabled_at` datetime(3) DEFAULT NULL,
  `enabled_by` varchar(20) DEFAULT NULL,
  `disabled_at` datetime(3) DEFAULT NULL,
  `disabled_by` varchar(20) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`announcement_key`),
  KEY `idx_system_announcements_active` (`is_active`, `auto_close_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
