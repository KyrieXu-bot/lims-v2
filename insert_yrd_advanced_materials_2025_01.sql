-- ============================================
-- 批量新增/更新客户、付款方及委托方（长三角先进材料研究院 2025-01 批次）
-- 客户：
--   长三角先进材料研究院（新增付款方/委托方：包祖国-大数据平台多个委托方）
-- 规则：
--   • 客户以 tax_id 去重，存在则更新时间。
--   • 付款方以 客户+姓名+电话 去重。
--   • 委托方以 付款方+联系人+电话 去重。
-- ============================================

START TRANSACTION;

-- 业务员工号
SET @XUCUXIA_USER_ID = 'JC0060'; -- 徐翠霞

-- ============================================
-- 长三角先进材料研究院（新增付款方/委托方：包祖国-大数据平台多个委托方）
-- ============================================
SET @customer_id_yrd = (
    SELECT customer_id FROM customers WHERE tax_id = '12320507MB1B43133J' LIMIT 1
);

INSERT INTO `payers` (
    `customer_id`, `contact_name`, `contact_phone`,
    `payment_term_days`, `discount_rate`, `owner_user_id`, `is_active`
)
SELECT
    @customer_id_yrd, '包祖国', '19962005575',
    365, 50.00, @XUCUXIA_USER_ID, 1
WHERE @customer_id_yrd IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payers
    WHERE customer_id = @customer_id_yrd
      AND contact_name = '包祖国'
      AND contact_phone = '19962005575'
);

SET @payer_id_yrd_bao = (
    SELECT payer_id FROM payers
    WHERE customer_id = @customer_id_yrd
      AND contact_name = '包祖国'
      AND contact_phone = '19962005575'
    LIMIT 1
);

-- 委托方：谢宇杰
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '谢宇杰', '18601559159', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '谢宇杰'
      AND contact_phone = '18601559159'
);

-- 委托方：魏晨笛
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '魏晨笛', '13244230708', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '魏晨笛'
      AND contact_phone = '13244230708'
);

-- 委托方：岳中杰
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '岳中杰', '18861683306', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '岳中杰'
      AND contact_phone = '18861683306'
);

-- 委托方：董瑞涵
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '董瑞涵', '15269313527', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '董瑞涵'
      AND contact_phone = '15269313527'
);

-- 委托方：包祖国
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '包祖国', '19962005575', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '包祖国'
      AND contact_phone = '19962005575'
);

-- 委托方：张优
INSERT INTO `commissioners` (
    `payer_id`, `commissioner_name`, `contact_name`, `contact_phone`, `address`, `is_active`
)
SELECT @payer_id_yrd_bao, '长三角先进材料研究院-大数据平台', '张优', '19936040996', '苏州市相城区高铁新城青龙港路286号研发组团三1号楼', 1
WHERE @payer_id_yrd_bao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissioners
    WHERE payer_id = @payer_id_yrd_bao
      AND contact_name = '张优'
      AND contact_phone = '19936040996'
);

COMMIT;

-- ============================================
-- 使用说明：
--   • 可直接执行整段脚本导入/更新；
--   • 如需单独执行某个客户，截取相应段落即可。
-- ============================================

