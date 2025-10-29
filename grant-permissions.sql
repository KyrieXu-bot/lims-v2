-- 授予 jitri 用户对 jitri2 数据库的完整权限
GRANT SELECT, INSERT, UPDATE, DELETE ON jitri2.* TO 'jitri'@'localhost';

-- 特别针对 assignments 表
GRANT SELECT, INSERT, UPDATE, DELETE ON jitri2.assignments TO 'jitri'@'localhost';

-- 刷新权限
FLUSH PRIVILEGES;

-- 验证权限
SHOW GRANTS FOR 'jitri'@'localhost';



