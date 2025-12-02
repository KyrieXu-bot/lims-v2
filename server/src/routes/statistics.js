import { Router } from 'express';
import ExcelJS from 'exceljs';
import { getPool } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';

const router = Router();

const ALLOWED_ROLES = ['leader', 'supervisor', 'employee'];

router.use(requireAuth, requireAnyRole(ALLOWED_ROLES));

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const isValidDate = (value) => {
  if (!value) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
};

const normalizeTotals = (row = {}) => ({
  line_total: Number(row.total_line_total || 0),
  final_unit_price: Number(row.total_final_unit_price || 0),
  work_hours: Number(row.total_work_hours || 0),
  machine_hours: Number(row.total_machine_hours || 0)
});

async function resolveDepartmentId(pool, user) {
  const direct = parseNumber(user?.department_id);
  if (direct !== null) return direct;
  const [rows] = await pool.query(
    'SELECT department_id FROM users WHERE user_id = ? LIMIT 1',
    [user?.user_id || user?.sub]
  );
  if (rows.length === 0) return null;
  return parseNumber(rows[0].department_id);
}

async function resolveGroupId(pool, user) {
  const direct = parseNumber(user?.group_id);
  if (direct !== null) return direct;
  const [rows] = await pool.query(
    'SELECT group_id FROM users WHERE user_id = ? LIMIT 1',
    [user?.user_id || user?.sub]
  );
  if (rows.length === 0) return null;
  return parseNumber(rows[0].group_id);
}

async function buildLeaderData(pool, user, from, to) {
  const departmentId = await resolveDepartmentId(pool, user);
  if (departmentId === null) {
    throw new Error('当前用户未配置所属部门，无法查询统计数据');
  }

  const baseWhere = 'ti.actual_delivery_date BETWEEN ? AND ? AND ti.actual_delivery_date IS NOT NULL';
  const params = [from, to, departmentId];

  const [summaryRows] = await pool.query(
    `SELECT 
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.work_hours, 0)) AS total_work_hours,
        SUM(COALESCE(ti.machine_hours, 0)) AS total_machine_hours
     FROM test_items ti
     WHERE ${baseWhere} AND ti.department_id = ?`,
    params
  );

  const [supervisorRows] = await pool.query(
    `SELECT 
        ti.supervisor_id AS user_id,
        u.name,
        u.group_id,
        lg.group_name,
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.work_hours, 0)) AS total_work_hours
     FROM test_items ti
     JOIN users u ON u.user_id = ti.supervisor_id
     LEFT JOIN lab_groups lg ON lg.group_id = u.group_id
     WHERE ${baseWhere} AND ti.department_id = ? AND ti.supervisor_id IS NOT NULL
     GROUP BY ti.supervisor_id, u.name, u.group_id, lg.group_name
     ORDER BY total_line_total DESC`,
    params
  );

  const [employeeRows] = await pool.query(
    `SELECT 
        ti.technician_id AS user_id,
        u.name,
        u.group_id,
        lg.group_name,
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.work_hours, 0)) AS total_work_hours,
        SUM(COALESCE(ti.machine_hours, 0)) AS total_machine_hours
     FROM test_items ti
     JOIN users u ON u.user_id = ti.technician_id
     LEFT JOIN lab_groups lg ON lg.group_id = u.group_id
     WHERE ${baseWhere} AND ti.department_id = ? AND ti.technician_id IS NOT NULL
     GROUP BY ti.technician_id, u.name, u.group_id, lg.group_name
     ORDER BY total_line_total DESC`,
    params
  );

  const [equipmentRows] = await pool.query(
    `SELECT 
        ti.equipment_id,
        COALESCE(e.equipment_name, '未指定设备') AS equipment_name,
        SUM(COALESCE(ti.machine_hours, 0)) AS total_machine_hours
     FROM test_items ti
     LEFT JOIN equipment e ON e.equipment_id = ti.equipment_id
     WHERE ${baseWhere} AND ti.department_id = ?
     GROUP BY ti.equipment_id, e.equipment_name
     HAVING total_machine_hours > 0
     ORDER BY total_machine_hours DESC`,
    params
  );

  return {
    scope: { department_id: departmentId },
    summary: normalizeTotals(summaryRows[0]),
    supervisors: supervisorRows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      group_id: row.group_id,
      group_name: row.group_name,
      line_total: Number(row.total_line_total || 0),
      final_unit_price: Number(row.total_final_unit_price || 0),
      work_hours: Number(row.total_work_hours || 0)
    })),
    employees: employeeRows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      group_id: row.group_id,
      group_name: row.group_name,
      line_total: Number(row.total_line_total || 0),
      final_unit_price: Number(row.total_final_unit_price || 0),
      work_hours: Number(row.total_work_hours || 0),
      machine_hours: Number(row.total_machine_hours || 0)
    })),
    equipment: equipmentRows.map((row) => ({
      equipment_id: row.equipment_id,
      equipment_name: row.equipment_name,
      machine_hours: Number(row.total_machine_hours || 0)
    }))
  };
}

async function buildSupervisorData(pool, user, from, to) {
  const supervisorId = user?.user_id || user?.sub;
  const groupId = await resolveGroupId(pool, user);
  // 恢复：按照actual_delivery_date有值来统计
  const baseWhere = 'ti.actual_delivery_date BETWEEN ? AND ? AND ti.actual_delivery_date IS NOT NULL';
  const params = [from, to];
  
  // 修改逻辑：根据组长的group_id筛选组员数据，而不是根据test_items的group_id
  // 筛选条件：只统计组长负责的项目（ti.supervisor_id = ?），与导出功能保持一致
  // 不再使用OR条件，避免重复计算或遗漏
  const scopeWhere = 'ti.supervisor_id = ?';
  const scopeParams = [supervisorId];

  const [summaryRows] = await pool.query(
    `SELECT 
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.work_hours, 0)) AS total_work_hours
     FROM test_items ti
     WHERE ${baseWhere} AND ${scopeWhere}`,
    [...params, ...scopeParams]
  );

  // 组员统计：只统计组长负责的项目中的组员，与导出功能保持一致
  const [memberRows] = await pool.query(
    `SELECT 
        ti.technician_id AS user_id,
        u.name,
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.work_hours, 0)) AS total_work_hours
     FROM test_items ti
     JOIN users u ON u.user_id = ti.technician_id
     WHERE ${baseWhere} AND ${scopeWhere} AND ti.technician_id IS NOT NULL
     GROUP BY ti.technician_id, u.name
     ORDER BY total_line_total DESC`,
    [...params, ...scopeParams]
  );

  return {
    scope: { group_id: groupId, supervisor_id: supervisorId },
    summary: {
      line_total: Number(summaryRows[0]?.total_line_total || 0),
      final_unit_price: Number(summaryRows[0]?.total_final_unit_price || 0),
      work_hours: Number(summaryRows[0]?.total_work_hours || 0)
    },
    members: memberRows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      line_total: Number(row.total_line_total || 0),
      final_unit_price: Number(row.total_final_unit_price || 0),
      work_hours: Number(row.total_work_hours || 0)
    }))
  };
}

async function buildEmployeeData(pool, user, from, to) {
  const employeeId = user?.user_id || user?.sub;
  const baseWhere = 'ti.actual_delivery_date BETWEEN ? AND ? AND ti.actual_delivery_date IS NOT NULL';
  const params = [from, to, employeeId];

  const [summaryRows] = await pool.query(
    `SELECT 
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.machine_hours, 0)) AS total_machine_hours
     FROM test_items ti
     WHERE ${baseWhere} AND ti.technician_id = ?`,
    params
  );

  const [dailyRows] = await pool.query(
    `SELECT 
        DATE(ti.actual_delivery_date) AS stat_date,
        SUM(COALESCE(ti.line_total, 0)) AS total_line_total,
        SUM(COALESCE(ti.final_unit_price, 0)) AS total_final_unit_price,
        SUM(COALESCE(ti.machine_hours, 0)) AS total_machine_hours
     FROM test_items ti
     WHERE ${baseWhere} AND ti.technician_id = ?
     GROUP BY stat_date
     ORDER BY stat_date ASC`,
    params
  );

  return {
    scope: { user_id: employeeId },
    summary: {
      line_total: Number(summaryRows[0]?.total_line_total || 0),
      final_unit_price: Number(summaryRows[0]?.total_final_unit_price || 0),
      machine_hours: Number(summaryRows[0]?.total_machine_hours || 0)
    },
    daily: dailyRows.map((row) => ({
      date: row.stat_date,
      line_total: Number(row.total_line_total || 0),
      final_unit_price: Number(row.total_final_unit_price || 0),
      machine_hours: Number(row.total_machine_hours || 0)
    }))
  };
}

async function buildStatisticsPayload(pool, user, from, to) {
  if (!isValidDate(from) || !isValidDate(to)) {
    throw new Error('日期参数无效，请检查起止日期格式');
  }
  if (new Date(from) > new Date(to)) {
    throw new Error('开始日期不得晚于结束日期');
  }

  const payload = {
    role: user.role,
    period: { from, to }
  };

  if (user.role === 'leader') {
    payload.detail = await buildLeaderData(pool, user, from, to);
  } else if (user.role === 'supervisor') {
    payload.detail = await buildSupervisorData(pool, user, from, to);
  } else if (user.role === 'employee') {
    payload.detail = await buildEmployeeData(pool, user, from, to);
  } else {
    throw new Error('当前登录角色暂不支持统计模块');
  }

  return payload;
}

router.get('/summary', async (req, res) => {
  const { from, to } = req.query;
  const pool = await getPool();

  try {
    const result = await buildStatisticsPayload(pool, req.user, from, to);
    res.json(result);
  } catch (error) {
    console.error('Failed to fetch statistics summary:', error);
    res.status(400).json({ error: error.message || '获取统计数据失败' });
  }
});

function appendLeaderSheets(workbook, payload) {
  const { period, detail } = payload;
  const summarySheet = workbook.addWorksheet('汇总');
  summarySheet.columns = [
    { header: '指标', key: 'label', width: 18 },
    { header: '数值', key: 'value', width: 22 }
  ];
  summarySheet.addRow({ label: '统计范围', value: `${period.from} ~ ${period.to}` });
  summarySheet.addRow({ label: '部门ID', value: detail.scope.department_id });
  summarySheet.addRow({ label: '总委托额', value: detail.summary.line_total });
  summarySheet.addRow({ label: '总合同额', value: detail.summary.final_unit_price });
  summarySheet.addRow({ label: '总工时', value: detail.summary.work_hours });
  summarySheet.addRow({ label: '总机时', value: detail.summary.machine_hours });

  const supervisorSheet = workbook.addWorksheet('组长明细');
  supervisorSheet.columns = [
    { header: '组长ID', key: 'user_id', width: 16 },
    { header: '姓名', key: 'name', width: 16 },
    { header: '所属组', key: 'group_name', width: 18 },
    { header: '组ID', key: 'group_id', width: 12 },
    { header: '总委托额', key: 'line_total', width: 18 },
    { header: '总合同额', key: 'final_unit_price', width: 18 },
    { header: '总工时', key: 'work_hours', width: 18 }
  ];
  detail.supervisors.forEach((item) => supervisorSheet.addRow(item));

  const employeeSheet = workbook.addWorksheet('员工明细');
  employeeSheet.columns = [
    { header: '员工ID', key: 'user_id', width: 16 },
    { header: '姓名', key: 'name', width: 16 },
    { header: '所属组', key: 'group_name', width: 18 },
    { header: '组ID', key: 'group_id', width: 12 },
    { header: '总委托额', key: 'line_total', width: 18 },
    { header: '总合同额', key: 'final_unit_price', width: 18 },
    { header: '总工时', key: 'work_hours', width: 18 },
    { header: '总机时', key: 'machine_hours', width: 18 }
  ];
  detail.employees.forEach((item) => employeeSheet.addRow(item));

  const equipmentSheet = workbook.addWorksheet('设备机时');
  equipmentSheet.columns = [
    { header: '设备ID', key: 'equipment_id', width: 16 },
    { header: '设备名称', key: 'equipment_name', width: 24 },
    { header: '总机时', key: 'machine_hours', width: 18 }
  ];
  detail.equipment.forEach((item) => equipmentSheet.addRow(item));
}

function appendSupervisorSheets(workbook, payload) {
  const { period, detail } = payload;
  const summarySheet = workbook.addWorksheet('汇总');
  summarySheet.columns = [
    { header: '指标', key: 'label', width: 18 },
    { header: '数值', key: 'value', width: 22 }
  ];
  summarySheet.addRow({ label: '统计范围', value: `${period.from} ~ ${period.to}` });
  summarySheet.addRow({ label: '组ID', value: detail.scope.group_id ?? '' });
  summarySheet.addRow({ label: '组长ID', value: detail.scope.supervisor_id });
  summarySheet.addRow({ label: '总委托额', value: detail.summary.line_total });
  summarySheet.addRow({ label: '总合同额', value: detail.summary.final_unit_price });
  summarySheet.addRow({ label: '总工时', value: detail.summary.work_hours });

  const memberSheet = workbook.addWorksheet('组员明细');
  memberSheet.columns = [
    { header: '人员ID', key: 'user_id', width: 16 },
    { header: '姓名', key: 'name', width: 18 },
    { header: '总委托额', key: 'line_total', width: 18 },
    { header: '总合同额', key: 'final_unit_price', width: 18 },
    { header: '总工时', key: 'work_hours', width: 18 }
  ];
  detail.members.forEach((item) => memberSheet.addRow(item));
}

function appendEmployeeSheets(workbook, payload) {
  const { period, detail } = payload;
  const summarySheet = workbook.addWorksheet('汇总');
  summarySheet.columns = [
    { header: '指标', key: 'label', width: 18 },
    { header: '数值', key: 'value', width: 22 }
  ];
  summarySheet.addRow({ label: '统计范围', value: `${period.from} ~ ${period.to}` });
  summarySheet.addRow({ label: '实验员ID', value: detail.scope.user_id });
  summarySheet.addRow({ label: '总委托额', value: detail.summary.line_total });
  summarySheet.addRow({ label: '总合同额', value: detail.summary.final_unit_price });
  summarySheet.addRow({ label: '总机时', value: detail.summary.machine_hours });

  const dailySheet = workbook.addWorksheet('每日明细');
  dailySheet.columns = [
    { header: '日期', key: 'date', width: 16 },
    { header: '总委托额', key: 'line_total', width: 18 },
    { header: '总合同额', key: 'final_unit_price', width: 18 },
    { header: '总机时', key: 'machine_hours', width: 18 }
  ];
  detail.daily.forEach((item) => dailySheet.addRow(item));
}

router.get('/export', async (req, res) => {
  const { from, to } = req.query;
  const pool = await getPool();

  try {
    const payload = await buildStatisticsPayload(pool, req.user, from, to);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LIMS V2';
    workbook.created = new Date();

    if (payload.role === 'leader') {
      appendLeaderSheets(workbook, payload);
    } else if (payload.role === 'supervisor') {
      appendSupervisorSheets(workbook, payload);
    } else if (payload.role === 'employee') {
      appendEmployeeSheets(workbook, payload);
    }

    const filename = encodeURIComponent(`统计数据_${payload.role}_${payload.period.from}_${payload.period.to}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to export statistics:', error);
    res.status(400).json({ error: error.message || '导出统计数据失败' });
  }
});

export default router;


