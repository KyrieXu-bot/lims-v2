import express from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 获取费用结算列表
router.get('/', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.settlement_id,
        s.invoice_date,
        s.order_ids,
        s.invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        COALESCE(s.customer_nature, c.nature) as display_customer_nature,
        u.name as assignee_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      ORDER BY s.invoice_date DESC, s.created_at DESC
    `);
    
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 创建费用结算记录
router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以创建结算记录
  if (user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可以创建结算记录' });
  }
  
  const { 
    invoice_date, 
    order_ids, 
    invoice_amount, 
    remarks, 
    customer_id, 
    customer_name,
    customer_nature,
    assignee_id,
    test_item_ids,
    test_item_amounts
  } = req.body;
  
  if (!invoice_date || !order_ids || !invoice_amount) {
    return res.status(400).json({ error: '开票日期、委托单号组、开票金额为必填项' });
  }
  
  // customer_id和customer_name至少有一个
  if (!customer_id && !customer_name) {
    return res.status(400).json({ error: '客户ID或客户名称为必填项' });
  }
  
  const pool = await getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let final_customer_id = customer_id || null;
    let final_customer_name = customer_name || null;
    let final_customer_nature = customer_nature || null;
    
    // 如果提供了customer_id，从customers表获取信息
    if (customer_id) {
      const [customerRows] = await connection.query(
        'SELECT customer_name, nature FROM customers WHERE customer_id = ?',
        [customer_id]
      );
      if (customerRows.length > 0) {
        final_customer_name = customer_name || customerRows[0].customer_name;
        // 如果前端没有提供customer_nature，则使用customers表中的nature
        if (!customer_nature) {
          final_customer_nature = customerRows[0].nature || null;
        }
      }
    }
    
    // 插入结算记录
    const [result] = await connection.query(
      `INSERT INTO settlements 
       (invoice_date, order_ids, invoice_amount, remarks, customer_id, customer_name, assignee_id, customer_nature, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '未到款')`,
      [invoice_date, order_ids, invoice_amount, remarks || null, final_customer_id, final_customer_name, assignee_id || null, final_customer_nature]
    );
    
    // 如果有test_item_ids和test_item_amounts，按比例分配开票金额
    if (test_item_ids && Array.isArray(test_item_ids) && test_item_ids.length > 0 && 
        test_item_amounts && Array.isArray(test_item_amounts) && test_item_amounts.length > 0) {
      
      // 计算总金额
      const totalAmount = test_item_amounts.reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
      
      if (totalAmount > 0) {
        // 按比例分配开票金额
        const allocations = test_item_ids.map((testItemId, index) => {
          const itemAmount = parseFloat(test_item_amounts[index]) || 0;
          const proportion = itemAmount / totalAmount;
          const allocatedAmount = parseFloat((invoice_amount * proportion).toFixed(2));
          return {
            test_item_id: testItemId,
            unpaid_amount: allocatedAmount
          };
        });
        
        // 处理精度问题：确保总和等于开票金额
        const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
        const difference = invoice_amount - allocatedTotal;
        if (Math.abs(difference) > 0.01) {
          // 将差额加到最后一个项目
          allocations[allocations.length - 1].unpaid_amount = parseFloat((allocations[allocations.length - 1].unpaid_amount + difference).toFixed(2));
        }
        
        // 批量更新test_items表的unpaid_amount
        for (const allocation of allocations) {
          await connection.query(
            'UPDATE test_items SET unpaid_amount = ? WHERE test_item_id = ?',
            [allocation.unpaid_amount, allocation.test_item_id]
          );
        }
      }
    }
    
    // 获取刚插入的记录
    const [newRecord] = await connection.query(
      `SELECT 
        s.settlement_id,
        s.invoice_date,
        s.order_ids,
        s.invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        u.name as assignee_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      WHERE s.settlement_id = ?`,
      [result.insertId]
    );
    
    await connection.commit();
    res.status(201).json(newRecord[0]);
  } catch (e) {
    await connection.rollback();
    return res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

// 更新费用结算记录（主要用于更新到账金额、到账日期、到款情况等）
router.put('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以更新结算记录
  if (user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可以更新结算记录' });
  }
  
  const { 
    invoice_amount,
    received_amount, 
    received_date, 
    payment_status,
    remarks,
    customer_name,
    customer_id,
    customer_nature,
    assignee_id
  } = req.body;
  
  const pool = await getPool();
  
  try {
    const updateFields = [];
    const updateValues = [];
    
    if (received_amount !== undefined) {
      updateFields.push('received_amount = ?');
      updateValues.push(received_amount);
    }
    
    if (received_date !== undefined) {
      // 处理日期格式：如果是 ISO 格式或 Date 对象，转换为 YYYY-MM-DD
      let formattedDate = received_date;
      if (received_date !== null && received_date !== '') {
        try {
          // 如果是 ISO 格式字符串（包含 T 或 Z），转换为 Date 对象再格式化
          if (typeof received_date === 'string' && (received_date.includes('T') || received_date.includes('Z'))) {
            const date = new Date(received_date);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              formattedDate = `${year}-${month}-${day}`;
            }
          } else if (typeof received_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(received_date)) {
            // 如果已经是 YYYY-MM-DD 格式，直接使用
            formattedDate = received_date;
          }
        } catch (e) {
          // 如果转换失败，使用原值（可能会报错，但至少不会丢失数据）
          formattedDate = received_date;
        }
      }
      updateFields.push('received_date = ?');
      updateValues.push(formattedDate === '' ? null : formattedDate);
    }
    
    if (payment_status !== undefined) {
      updateFields.push('payment_status = ?');
      updateValues.push(payment_status);
    }
    
    if (remarks !== undefined) {
      updateFields.push('remarks = ?');
      updateValues.push(remarks);
    }
    
    // 如果更新了开票金额，需要重新分配test_items的unpaid_amount
    let shouldRecalculate = false;
    let newInvoiceAmount = null;
    
    if (invoice_amount !== undefined) {
      updateFields.push('invoice_amount = ?');
      updateValues.push(invoice_amount);
      shouldRecalculate = true;
      newInvoiceAmount = invoice_amount;
    }
    
    if (customer_name !== undefined) {
      updateFields.push('customer_name = ?');
      updateValues.push(customer_name);
    }
    
    // 如果提供了customer_id，更新它；如果customer_id为null，也更新
    if (customer_id !== undefined) {
      updateFields.push('customer_id = ?');
      updateValues.push(customer_id);
    }
    
    if (customer_nature !== undefined) {
      updateFields.push('customer_nature = ?');
      updateValues.push(customer_nature);
    }
    
    if (assignee_id !== undefined) {
      updateFields.push('assignee_id = ?');
      updateValues.push(assignee_id);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }
    
    updateValues.push(req.params.id);
    
    // 如果更新了开票金额，需要重新计算分配
    if (shouldRecalculate) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        // 先获取当前结算记录的order_ids
        const [currentSettlement] = await connection.query(
          'SELECT order_ids FROM settlements WHERE settlement_id = ?',
          [req.params.id]
        );
        
        if (currentSettlement.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: '结算记录不存在' });
        }
        
        const orderIds = currentSettlement[0].order_ids;
        
        // 更新settlements表
        await connection.query(
          `UPDATE settlements SET ${updateFields.join(', ')}, updated_at = NOW() WHERE settlement_id = ?`,
          updateValues
        );
        
        // 重新计算并分配test_items的unpaid_amount
        if (orderIds) {
          // 解析order_ids（用"-"分隔）
          const orderIdArray = orderIds.split('-').filter(id => id.trim());
          
          if (orderIdArray.length > 0) {
            // 获取这些委托单下的所有test_items及其金额
            const placeholders = orderIdArray.map(() => '?').join(',');
            const [testItems] = await connection.query(
              `SELECT test_item_id, 
                      COALESCE(final_unit_price * actual_sample_quantity, 
                               line_total, 
                               unit_price * actual_sample_quantity, 
                               0) as item_amount
               FROM test_items 
               WHERE order_id IN (${placeholders}) 
               AND status != 'cancelled'`,
              orderIdArray
            );
            
            if (testItems.length > 0) {
              // 计算总金额
              const totalAmount = testItems.reduce((sum, item) => sum + (parseFloat(item.item_amount) || 0), 0);
              
              if (totalAmount > 0) {
                // 按比例分配开票金额
                const allocations = testItems.map((item) => {
                  const itemAmount = parseFloat(item.item_amount) || 0;
                  const proportion = itemAmount / totalAmount;
                  const allocatedAmount = parseFloat((newInvoiceAmount * proportion).toFixed(2));
                  return {
                    test_item_id: item.test_item_id,
                    unpaid_amount: allocatedAmount
                  };
                });
                
                // 处理精度问题：确保总和等于开票金额
                const allocatedTotal = allocations.reduce((sum, item) => sum + item.unpaid_amount, 0);
                const difference = newInvoiceAmount - allocatedTotal;
                if (Math.abs(difference) > 0.01) {
                  // 将差额加到最后一个项目
                  allocations[allocations.length - 1].unpaid_amount = parseFloat((allocations[allocations.length - 1].unpaid_amount + difference).toFixed(2));
                }
                
                // 更新test_items的unpaid_amount
                for (const allocation of allocations) {
                  await connection.query(
                    'UPDATE test_items SET unpaid_amount = ? WHERE test_item_id = ?',
                    [allocation.unpaid_amount, allocation.test_item_id]
                  );
                }
              }
            }
          }
        }
        
        await connection.commit();
        connection.release();
      } catch (e) {
        await connection.rollback();
        connection.release();
        throw e;
      }
    } else {
      // 如果没有更新开票金额，直接更新
      await pool.query(
        `UPDATE settlements SET ${updateFields.join(', ')}, updated_at = NOW() WHERE settlement_id = ?`,
        updateValues
      );
    }
    
    // 获取更新后的记录
    const [updatedRecord] = await pool.query(
      `SELECT 
        s.settlement_id,
        s.invoice_date,
        s.order_ids,
        s.invoice_amount,
        s.received_amount,
        s.received_date,
        s.remarks,
        s.payment_status,
        s.customer_id,
        s.customer_name,
        s.assignee_id,
        s.customer_nature,
        s.created_at,
        s.updated_at,
        COALESCE(s.customer_name, c.customer_name) as display_customer_name,
        u.name as assignee_name
      FROM settlements s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      LEFT JOIN users u ON s.assignee_id = u.user_id
      WHERE s.settlement_id = ?`,
      [req.params.id]
    );
    
    if (updatedRecord.length === 0) {
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    res.json(updatedRecord[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取客户列表（用于开票单位选择）
router.get('/customers', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      'SELECT customer_id, customer_name FROM customers WHERE is_active = 1 ORDER BY customer_name ASC'
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 客户模糊查询（用于开票单位输入+模糊查询）
router.get('/customers/search', requireAuth, async (req, res) => {
  const { q = '' } = req.query;
  const pool = await getPool();
  try {
    if (!q || q.trim() === '') {
      return res.json([]);
    }
    const searchTerm = `%${q.trim()}%`;
    const [rows] = await pool.query(
      `SELECT customer_id, customer_name, nature as customer_nature 
       FROM customers 
       WHERE is_active = 1 AND customer_name LIKE ? 
       ORDER BY customer_name ASC 
       LIMIT 20`,
      [searchTerm]
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 删除费用结算记录
router.delete('/:id', requireAuth, async (req, res) => {
  const user = req.user;
  
  // 只有管理员可以删除结算记录
  if (user.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可以删除结算记录' });
  }
  
  const pool = await getPool();
  
  try {
    const [result] = await pool.query(
      'DELETE FROM settlements WHERE settlement_id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '结算记录不存在' });
    }
    
    res.json({ ok: true, message: '删除成功' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取业务人员列表（用于业务人员选择，只返回sales角色）
router.get('/assignees', requireAuth, async (req, res) => {
  const pool = await getPool();
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name 
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'sales' AND u.is_active = 1
       ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;



