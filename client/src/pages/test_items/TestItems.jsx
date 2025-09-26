import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import SimpleFileUpload from '../../components/SimpleFileUpload';

// 组长审核弹窗组件
function SupervisorReviewModal({ testItem, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    quantity: testItem?.quantity || 1,
    machine_hours: testItem?.machine_hours || 0,
    work_hours: testItem?.work_hours || 0,
    equipment_id: testItem?.equipment_id || '',
    unit_price: testItem?.unit_price || 0,
    check_notes: ''
  });
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  // 加载设备选项
  useEffect(() => {
    loadEquipmentOptions();
  }, []);

  const loadEquipmentOptions = async () => {
    try {
      setLoadingEquipment(true);
      const departmentId = testItem?.department_id;
      if (departmentId) {
        const options = await api.getEquipmentByDepartment(departmentId);
        setEquipmentOptions(options);
      } else {
        const res = await api.listEquipment({ pageSize: 1000 });
        setEquipmentOptions(res.data);
      }
    } catch (e) {
      console.error('加载设备列表失败:', e);
      alert('加载设备列表失败: ' + e.message);
    } finally {
      setLoadingEquipment(false);
    }
  };

  const handleApprove = async () => {
    try {
      setLoading(true);
      await api.updateTestItem(testItem.test_item_id, {
        quantity: Number(formData.quantity),
        machine_hours: Number(formData.machine_hours),
        work_hours: Number(formData.work_hours),
        equipment_id: Number(formData.equipment_id),
        unit_price: Number(formData.unit_price),
        check_notes: formData.check_notes,
        status: 'report_uploaded'
      });
      
      alert('审核通过，状态已更新为待传数据');
      onSuccess();
    } catch (e) {
      alert('审核失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!formData.check_notes.trim()) {
      alert('请填写审批备注说明退回原因');
      return;
    }

    try {
      setLoading(true);
      await api.updateTestItem(testItem.test_item_id, {
        check_notes: formData.check_notes,
        status: 'running'
      });
      
      alert('已退回给实验员，请查看审批备注');
      onSuccess();
    } catch (e) {
      alert('退回失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '500px',
        maxWidth: '700px'
      }}>
        <h3>审核检测项目</h3>
        <p>项目：{testItem?.detail_name} ({testItem?.test_code})</p>
        
        <div style={{ marginBottom: '20px', padding: '12px', background: '#f8f9fa', borderRadius: '4px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>实验员填写的信息：</h4>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>机时：{testItem?.machine_hours}小时 | 工时：{testItem?.work_hours}小时 | 单价：{testItem?.unit_price}元</p>
          {testItem?.test_notes && (
            <p style={{ margin: '4px 0', fontSize: '13px' }}>实验备注：{testItem.test_notes}</p>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label>数量 *</label>
            <input 
              className="input" 
              type="number" 
              step="0.1"
              value={formData.quantity} 
              onChange={e => setFormData({...formData, quantity: e.target.value})}
              required
            />
          </div>
          
          <div>
            <label>机时（小时）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.1"
              value={formData.machine_hours} 
              onChange={e => setFormData({...formData, machine_hours: e.target.value})}
              required
            />
          </div>
          
          <div>
            <label>工时（小时）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.1"
              value={formData.work_hours} 
              onChange={e => setFormData({...formData, work_hours: e.target.value})}
              required
            />
          </div>
          
          <div>
            <label>单价（元）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.01"
              value={formData.unit_price} 
              onChange={e => setFormData({...formData, unit_price: e.target.value})}
              required
            />
          </div>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label>使用的设备 *</label>
          {loadingEquipment ? (
            <div>加载设备列表中...</div>
          ) : (
            <select 
              className="input" 
              value={formData.equipment_id} 
              onChange={e => setFormData({...formData, equipment_id: e.target.value})}
              required
            >
              <option value="">请选择设备</option>
              {equipmentOptions.map(equipment => (
                <option key={equipment.equipment_id} value={equipment.equipment_id}>
                  {equipment.equipment_name} ({equipment.equipment_no || equipment.model})
                </option>
              ))}
            </select>
          )}
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label>审批备注 *</label>
          <textarea 
            className="input" 
            rows="3"
            value={formData.check_notes} 
            onChange={e => setFormData({...formData, check_notes: e.target.value})}
            placeholder="请填写审批意见，如有问题请说明具体原因"
            required
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button 
            type="button" 
            className="btn btn-warning" 
            onClick={handleReject}
            disabled={loading}
          >
            {loading ? '处理中...' : '退回修改'}
          </button>
          <button 
            type="button" 
            className="btn btn-success" 
            onClick={handleApprove}
            disabled={loading}
          >
            {loading ? '处理中...' : '审核通过'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 员工完成弹窗组件
function EmployeeCompleteModal({ testItem, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    machine_hours: testItem?.machine_hours || 0,
    work_hours: testItem?.work_hours || 0,
    equipment_id: '',
    unit_price: testItem?.unit_price || 0,
    test_notes: ''
  });
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  // 加载设备选项
  useEffect(() => {
    loadEquipmentOptions();
  }, []);

  const loadEquipmentOptions = async () => {
    try {
      setLoadingEquipment(true);
      // 根据检测项目的部门ID获取设备列表
      const departmentId = testItem?.department_id;
      if (departmentId) {
        const options = await api.getEquipmentByDepartment(departmentId);
        setEquipmentOptions(options);
      } else {
        // 如果没有部门ID，获取所有设备
        const res = await api.listEquipment({ pageSize: 1000 });
        setEquipmentOptions(res.data);
      }
    } catch (e) {
      console.error('加载设备列表失败:', e);
      alert('加载设备列表失败: ' + e.message);
    } finally {
      setLoadingEquipment(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.equipment_id) {
      alert('请选择使用的设备');
      return;
    }

    try {
      setLoading(true);
      // 更新检测项目，包含机时、工时、设备ID、单价、实验备注，状态改为待审核
      await api.updateTestItem(testItem.test_item_id, {
        machine_hours: Number(formData.machine_hours),
        work_hours: Number(formData.work_hours),
        equipment_id: Number(formData.equipment_id),
        unit_price: Number(formData.unit_price),
        test_notes: formData.test_notes,
        status: 'waiting_review'
      });
      
      alert('完成提交成功，状态已更新为待审核，等待组长审核');
      onSuccess();
    } catch (e) {
      alert('提交失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '400px',
        maxWidth: '600px'
      }}>
        <h3>完成检测项目</h3>
        <p>项目：{testItem?.detail_name} ({testItem?.test_code})</p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label>机时（小时）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.1"
              value={formData.machine_hours} 
              onChange={e => setFormData({...formData, machine_hours: e.target.value})}
              required
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label>工时（小时）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.1"
              value={formData.work_hours} 
              onChange={e => setFormData({...formData, work_hours: e.target.value})}
              required
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label>使用的设备 *</label>
            {loadingEquipment ? (
              <div>加载设备列表中...</div>
            ) : (
              <select 
                className="input" 
                value={formData.equipment_id} 
                onChange={e => setFormData({...formData, equipment_id: e.target.value})}
                required
              >
                <option value="">请选择设备</option>
                {equipmentOptions.map(equipment => (
                  <option key={equipment.equipment_id} value={equipment.equipment_id}>
                    {equipment.equipment_name} ({equipment.equipment_no || equipment.model})
                  </option>
                ))}
              </select>
            )}
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label>单价（元）*</label>
            <input 
              className="input" 
              type="number" 
              step="0.01"
              value={formData.unit_price} 
              onChange={e => setFormData({...formData, unit_price: e.target.value})}
              required
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label>实验备注</label>
            <textarea 
              className="input" 
              rows="3"
              value={formData.test_notes} 
              onChange={e => setFormData({...formData, test_notes: e.target.value})}
              placeholder="请输入实验过程中的备注信息"
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button 
              type="submit" 
              className="btn btn-success" 
              disabled={loading}
            >
              {loading ? '提交中...' : '确认完成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 批量分配弹窗组件
function BatchAssignModal({ selectedItems, user, onClose, onSuccess }) {
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    loadAssigneeOptions();
  }, []);

  const loadAssigneeOptions = async () => {
    try {
      setLoadingOptions(true);
      let options = [];
          
      if (user.role === 'leader') {
        
        if (!user.department_id) {
          // 临时解决方案：通过group_id查询department_id
          console.log('department_id不存在，尝试通过group_id查询');
          const departmentId = await api.getDepartmentIdByGroupId(user.group_id);
          if (departmentId) {
            options = await api.getSupervisorsByDepartment(departmentId);
          } else {
            alert('无法确定部门信息，请联系管理员设置department_id');
            return;
          }
        } else {
          options = await api.getSupervisorsByDepartment(user.department_id);
        }
      } else if (user.role === 'supervisor') {
        // 组长：获取该小组的所有实验员
        options = await api.getEmployeesByGroup(user.group_id);
      }
      
      setAssigneeOptions(options);
    } catch (e) {
      alert('获取分配选项失败: ' + e.message);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAssignee) {
      alert('请选择分配对象');
      return;
    }

    try {
      setLoading(true);
      const newStatus = user.role === 'leader' ? 'assigned' : 'running';
      const assignField = user.role === 'leader' ? 'supervisor_id' : 'technician_id';
      
      await api.batchAssignTestItems({
        testItemIds: selectedItems,
        [assignField]: selectedAssignee,
        status: newStatus
      });
      
      alert('批量分配成功');
      onSuccess();
    } catch (e) {
      alert('批量分配失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (user.role === 'leader') return '批量分配给组长';
    if (user.role === 'supervisor') return '批量分配给实验员';
    return '批量分配';
  };

  const getAssigneeLabel = () => {
    if (user.role === 'leader') return '选择组长';
    if (user.role === 'supervisor') return '选择实验员';
    return '选择分配对象';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '400px',
        maxWidth: '600px'
      }}>
        <h3>{getTitle()}</h3>
        <p>已选择 {selectedItems.length} 个项目进行分配</p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label>{getAssigneeLabel()}</label>
            {loadingOptions ? (
              <div>加载中...</div>
            ) : (
              <select 
                className="input" 
                value={selectedAssignee} 
                onChange={e => setSelectedAssignee(e.target.value)}
                required
              >
                <option value="">请选择</option>
                {assigneeOptions.map(option => (
                  <option key={option.user_id} value={option.user_id}>
                    {option.name} ({option.account})
                  </option>
                ))}
              </select>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || !selectedAssignee}
            >
              {loading ? '分配中...' : '确认分配'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TestItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBatchAssignModal, setShowBatchAssignModal] = useState(false);
  const [showEmployeeCompleteModal, setShowEmployeeCompleteModal] = useState(false);
  const [showSupervisorReviewModal, setShowSupervisorReviewModal] = useState(false);
  const [selectedTestItem, setSelectedTestItem] = useState(null);
  const [user, setUser] = useState(null);
  const [showFileView, setShowFileView] = useState(false);
  const [selectedFileTestItem, setSelectedFileTestItem] = useState(null);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.listTestItems({ q, page, pageSize, status });
      setItems(res.data);
      setTotal(res.total);
    } catch (e) {
      alert(e.message);
      navigate('/login');
    }
  }
  
  useEffect(()=>{ 
    // 获取当前用户信息
    const userData = JSON.parse(localStorage.getItem('lims_user') || 'null');
    setUser(userData);
    load(); 
  }, [q, page, status]);

  const totalPages = Math.max(1, Math.ceil(total/pageSize));

  // 分组数据：按委托单号和大类分组
  const groupedItems = items.reduce((acc, item) => {
    const key = `${item.order_id}-${item.category_name}`;
    if (!acc[key]) {
      acc[key] = {
        order_id: item.order_id,
        category_name: item.category_name,
        items: []
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  const toggleGroup = (key) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const getStatusColor = (status) => {
    const colors = {
      'new': '#6c757d',
      'assigned': '#17a2b8',
      'running': '#ffc107',
      'waiting_review': '#fd7e14',
      'report_uploaded': '#20c997',
      'completed': '#28a745',
      'cancelled': '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusText = (status) => {
    const texts = {
      'new': '新建',
      'assigned': '已分配',
      'running': '进行中',
      'waiting_review': '待审核',
      'report_uploaded': '待传数据',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return texts[status] || status;
  };

  const getArrivalModeText = (mode) => {
    const texts = {
      'on_site': '现场',
      'delivery': '寄样'
    };
    return texts[mode] || mode || '-';
  };

  const getSampleArrivalStatusText = (status) => {
    // 如果已经是中文，直接返回；如果是英文，则转换
    const texts = {
      'arrived': '已到',
      'not_arrived': '未到',
      'partial_arrived': '部分到达',
      '已到': '已到',
      '未到': '未到',
      '部分到达': '部分到达'
    };
    return texts[status] || status || '-';
  };

  // 多选框相关函数
  const toggleItemSelection = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleGroupSelection = (groupItems) => {
    const groupItemIds = groupItems.map(item => item.test_item_id);
    const allSelected = groupItemIds.every(id => selectedItems.has(id));
    
    const newSelected = new Set(selectedItems);
    if (allSelected) {
      // 取消选择该组所有项目
      groupItemIds.forEach(id => newSelected.delete(id));
    } else {
      // 选择该组所有项目
      groupItemIds.forEach(id => newSelected.add(id));
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    const allItemIds = items.map(item => item.test_item_id);
    setSelectedItems(new Set(allItemIds));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // 检查是否有选中的项目
  const hasSelectedItems = selectedItems.size > 0;

  // 检查当前用户是否可以批量分配
  const canBatchAssign = user && (user.role === 'leader' || user.role === 'supervisor');

  // 角色权限与动作
  const canEdit = (user && (user.role === 'admin' || user.role === 'leader'));
  const canDelete = canEdit;

  const canReview = (item) => user && user.role === 'supervisor' && item.status === 'waiting_review';
  const canAssignSingle = (item) => user && user.role === 'supervisor' && item.status === 'assigned';
  const canCompleteBySupervisor = (item) => user && user.role === 'supervisor' && item.status === 'running' && item.supervisor_id === user.user_id;
  const canCompleteByEmployee = (item) => user && user.role === 'employee' && item.status === 'running';
  const canDeliverBySales = (item) => user && user.role === 'sales' && item.status === 'report_uploaded';
  const canTransfer = (item) => user && user.role === 'admin' && item.sample_arrival_status === 'not_arrived';
  const canCancel = (item) => user && user.role === 'admin' && item.status !== 'cancelled';

  // 切换文件查看
  const toggleFileView = (testItemId) => {
    const testItem = items.find(item => item.test_item_id === testItemId);
    setSelectedFileTestItem(testItem);
    setShowFileView(!showFileView);
  };

  async function handleUpdateStatus(id, status) {
    await api.updateTestItem(id, { status });
    load();
  }

  async function handleTransfer(id) {
    if (confirm('确定要将样品状态改为已到吗？流转后其他角色将能看到此项目。')) {
      await api.updateTestItem(id, { sample_arrival_status: 'arrived' });
      load();
    }
  }

  function openAssignForOne(id) {
    setSelectedItems(new Set([id]));
    setShowBatchAssignModal(true);
  }

  function openEmployeeCompleteModal(testItem) {
    setSelectedTestItem(testItem);
    setShowEmployeeCompleteModal(true);
  }

  function openSupervisorReviewModal(testItem) {
    setSelectedTestItem(testItem);
    setShowSupervisorReviewModal(true);
  }

  async function handleCancelTestItem(id) {
    if (confirm('确定要取消这个测试吗？取消后的测试将不会参与今后的统计。')) {
      try {
        await api.cancelTestItem(id);
        alert('测试已成功取消');
        load();
      } catch (e) {
        alert('取消失败: ' + e.message);
      }
    }
  }

  return (
    <div>
      <h2>检测项目处理</h2>
      <style>{`
        .grouped-items .group-header:hover {
          background: #e9ecef !important;
        }
        .grouped-items .group-content {
          margin: 0;
          position: relative;
        }
        .grouped-items .group-content .table {
          margin: 0;
          border: 1px solid #dee2e6;
        }
        .grouped-items .group-content .table th {
          background: #f8f9fa;
          font-size: 13px;
          padding: 8px 12px;
          white-space: nowrap;
        }
        .grouped-items .group-content .table td {
          padding: 8px 12px;
          font-size: 13px;
          white-space: nowrap;
          vertical-align: top;
        }
        .grouped-items .group-content .table tbody tr:hover {
          background: #f8f9fa;
        }
        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          color: white;
          font-weight: 500;
        }
        .actions-buttons {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: flex-start;
          align-items: center;
          padding: 4px;
        }
        .actions-buttons .btn {
          font-size: 11px;
          padding: 4px 8px;
          min-width: auto;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .actions-buttons .btn-primary {
          background: #007bff;
          border-color: #007bff;
        }
        .actions-buttons .btn-success {
          background: #28a745;
          border-color: #28a745;
        }
        .actions-buttons .btn-danger {
          background: #dc3545;
          border-color: #dc3545;
        }
        .actions-buttons .btn-warning {
          background: #ffc107;
          border-color: #ffc107;
          color: #212529;
        }
        .actions-buttons .btn-info {
          background: #17a2b8;
          border-color: #17a2b8;
        }
        .actions-buttons .btn-secondary {
          background: #6c757d;
          border-color: #6c757d;
        }
        .table-container {
          position: relative;
        }
        .table-container .table tbody tr {
          height: 60px;
        }
        .table-container .table tbody td {
          height: 60px;
          vertical-align: top;
          padding-top: 8px;
        }
        .scroll-indicator {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0,0,0,0.1);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          color: #666;
          z-index: 5;
        }
      `}</style>
      <div className="toolbar">
        <input className="input" placeholder="搜索（大类/细项/代码/委托单号）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:200}} value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}}>
          <option value="">所有状态</option>
          <option value="new">新建</option>
          <option value="assigned">已分配</option>
          <option value="running">进行中</option>
          <option value="waiting_review">待审核</option>
          <option value="report_uploaded">待传数据</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <button className="btn btn-primary" onClick={()=>navigate('/test-items/new')}>+ 新增项目</button>
        {canBatchAssign && (
          <>
            <button className="btn btn-secondary" onClick={selectAll}>全选</button>
            <button className="btn btn-secondary" onClick={clearSelection}>取消选择</button>
            <button 
              className={`btn ${hasSelectedItems ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBatchAssignModal(true)}
              disabled={!hasSelectedItems}
            >
              批量分配 ({selectedItems.size})
            </button>
          </>
        )}
        <button className="btn btn-secondary" onClick={()=>{
          const allKeys = Object.keys(groupedItems);
          if (expandedGroups.size === allKeys.length) {
            setExpandedGroups(new Set());
          } else {
            setExpandedGroups(new Set(allKeys));
          }
        }}>
          {expandedGroups.size === Object.keys(groupedItems).length ? '全部收起' : '全部展开'}
        </button>
      </div>
      <div className="grouped-items">
        {Object.entries(groupedItems).map(([key, group]) => (
          <div key={key} className="group-container">
            <div 
              className="group-header" 
              onClick={() => toggleGroup(key)}
              style={{
                background: '#f5f5f5',
                padding: '12px 16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 'bold'
              }}
            >
              <div>
                <span style={{fontSize: '16px', color: '#333'}}>
                  {group.order_id} - {group.category_name}
                </span>
                <span style={{marginLeft: '16px', fontSize: '14px', color: '#666'}}>
                  ({group.items.length} 项)
                </span>
              </div>
              <div style={{fontSize: '18px', color: '#666'}}>
                {expandedGroups.has(key) ? '▼' : '▶'}
              </div>
            </div>
            
            {expandedGroups.has(key) && (
              <div className="group-content" style={{marginLeft: '20px', marginBottom: '20px'}}>
                <div className="table-container" style={{display: 'flex', position: 'relative'}}>
                  {/* 可滚动的数据表格 */}
                  <div style={{flex: 1, overflowX: 'auto', marginRight: '250px'}}>
                    <table className="table" style={{minWidth: '1200px', marginBottom: 0}}>
                      <thead>
                        <tr>
                          <th style={{width: '40px'}}>
                            {canBatchAssign && (
                              <input 
                                type="checkbox" 
                                checked={group.items.every(item => selectedItems.has(item.test_item_id))}
                                onChange={() => toggleGroupSelection(group.items)}
                              />
                            )}
                          </th>
                          <th style={{width: '80px'}}>ID</th>
                          <th style={{width: '150px'}}>细项</th>
                          <th style={{width: '100px'}}>代码</th>
                          <th style={{width: '100px'}}>执行部门</th>
                          <th style={{width: '100px'}}>执行小组</th>
                          <th style={{width: '80px'}}>数量</th>
                          <th style={{width: '100px'}}>单价</th>
                          <th style={{width: '100px'}}>到达方式</th>
                          <th style={{width: '100px'}}>样品状态</th>
                          <th style={{width: '100px'}}>状态</th>
                          <th style={{width: '120px'}}>执行人</th>
                          <th style={{width: '120px'}}>负责人</th>
                          <th style={{width: '120px'}}>实验员</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(it => (
                          <tr key={it.test_item_id}>
                            <td>
                              {canBatchAssign && (
                                <input 
                                  type="checkbox" 
                                  checked={selectedItems.has(it.test_item_id)}
                                  onChange={() => toggleItemSelection(it.test_item_id)}
                                />
                              )}
                            </td>
                            <td>{it.test_item_id}</td>
                            <td>{it.detail_name}</td>
                            <td>{it.test_code}</td>
                            <td>{it.department_id}</td>
                            <td>{it.group_id}</td>
                            <td>{it.quantity}</td>
                            <td>{it.unit_price}</td>
                            <td>{getArrivalModeText(it.arrival_mode)}</td>
                            <td>{getSampleArrivalStatusText(it.sample_arrival_status)}</td>
                            <td>
                              <span className={`badge status-${it.status}`} style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                backgroundColor: getStatusColor(it.status),
                                color: 'white'
                              }}>
                                {getStatusText(it.status)}
                              </span>
                            </td>
                            <td>{it.current_assignee ? `${it.assignee_name||''}（${it.current_assignee}）` : ''}</td>
                            <td>{it.supervisor_id ? `${it.supervisor_name||''}（${it.supervisor_id}）` : ''}</td>
                            <td>{it.technician_id ? `${it.technician_name||''}（${it.technician_id}）` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* 固定的操作列 */}
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    width: '250px',
                    background: 'white',
                    zIndex: 100,
                    boxShadow: '-2px 0 5px rgba(0,0,0,0.1)',
                    borderLeft: '1px solid #dee2e6'
                  }}>
                    <table className="table" style={{margin: 0}}>
                      <thead>
                        <tr>
                          <th style={{background: '#f8f9fa', padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap'}}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(it => (
                          <tr key={it.test_item_id} style={{height: 'auto'}}>
                            <td style={{padding: '4px', verticalAlign: 'top'}}>
                              <div className="actions-buttons">
                                {/* 主要操作按钮 - 按优先级排序 */}
                                {/* 查看：所有人都有 */}
                                <button className="btn btn-secondary" onClick={()=>navigate(`/test-items/${it.test_item_id}?view=1`)} title="查看详情">查看</button>

                                {/* 编辑：管理员、室主任 */}
                                {canEdit && (
                                  <button className="btn btn-primary" onClick={()=>navigate(`/test-items/${it.test_item_id}`)} title="编辑项目">编辑</button>
                                )}

                                {/* 审核：组长，状态=待审核 */}
                                {canReview(it) && (
                                  <button className="btn btn-primary" onClick={()=>openSupervisorReviewModal(it)} title="审核项目">审核</button>
                                )}

                                {/* 指派：组长，状态=已分配 */}
                                {canAssignSingle(it) && (
                                  <button className="btn btn-primary" onClick={()=>openAssignForOne(it.test_item_id)} title="指派给实验员">指派</button>
                                )}

                                {/* 完成：组长，状态=进行中 且 指派给自己 */}
                                {canCompleteBySupervisor(it) && (
                                  <button className="btn btn-success" onClick={()=>handleUpdateStatus(it.test_item_id, 'completed')} title="标记为完成">完成</button>
                                )}

                                {/* 完成：实验员，状态=进行中 */}
                                {canCompleteByEmployee(it) && (
                                  <button className="btn btn-success" onClick={()=>openEmployeeCompleteModal(it)} title="完成检测">完成</button>
                                )}

                                {/* 交付：业务员，状态=已传报告 */}
                                {canDeliverBySales(it) && (
                                  <button className="btn btn-info" onClick={()=>handleUpdateStatus(it.test_item_id, 'completed')} title="交付给客户">交付</button>
                                )}

                                {/* 流转：管理员，样品状态=未到 */}
                                {canTransfer(it) && (
                                  <button className="btn btn-warning" onClick={()=>handleTransfer(it.test_item_id)} title="样品流转">流转</button>
                                )}

                                {/* 文件：所有角色都可以查看文件 */}
                                <button className="btn btn-info" onClick={()=>toggleFileView(it.test_item_id)} title="文件管理">文件</button>

                                {/* 危险操作 - 放在最后 */}
                                {/* 取消：管理员，状态不是已取消 */}
                                {canCancel(it) && (
                                  <button className="btn btn-danger" onClick={()=>handleCancelTestItem(it.test_item_id)} title="取消测试">取消</button>
                                )}

                                {/* 删除：管理员、室主任 */}
                                {canDelete && (
                                  <button className="btn btn-danger" onClick={async ()=>{ if (confirm('确定要删除这个检测项目吗？')) { await api.deleteTestItem(it.test_item_id); load(); }}} title="删除项目">删除</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="scroll-indicator">← 左右滑动查看更多 →</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="pagination">
        <button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div className="text-muted">第 {page} 页，共 {totalPages} 页</div>
        <button className="btn btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>

      {/* 批量分配弹窗 */}
      {showBatchAssignModal && (
        <BatchAssignModal 
          selectedItems={Array.from(selectedItems)}
          user={user}
          onClose={() => setShowBatchAssignModal(false)}
          onSuccess={() => {
            setShowBatchAssignModal(false);
            setSelectedItems(new Set());
            load();
          }}
        />
      )}

      {/* 文件查看弹窗 */}
      {showFileView && selectedFileTestItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '90%',
            maxHeight: '90%',
            overflow: 'auto',
            width: '800px'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3>文件管理 - 检测项目 #{selectedFileTestItem.test_item_id}</h3>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowFileView(false)}
              >
                关闭
              </button>
            </div>
            
            <SimpleFileUpload
              testItemId={selectedFileTestItem.test_item_id}
              orderId={selectedFileTestItem.order_id}
              userRole={user?.role}
              onFileUploaded={() => {
                // 文件上传成功后的回调
                console.log('文件上传成功');
              }}
            />
          </div>
        </div>
      )}

      {/* 员工完成弹窗 */}
      {showEmployeeCompleteModal && (
        <EmployeeCompleteModal 
          testItem={selectedTestItem}
          onClose={() => setShowEmployeeCompleteModal(false)}
          onSuccess={() => {
            setShowEmployeeCompleteModal(false);
            setSelectedTestItem(null);
            load();
          }}
        />
      )}

      {/* 组长审核弹窗 */}
      {showSupervisorReviewModal && (
        <SupervisorReviewModal 
          testItem={selectedTestItem}
          onClose={() => setShowSupervisorReviewModal(false)}
          onSuccess={() => {
            setShowSupervisorReviewModal(false);
            setSelectedTestItem(null);
            load();
          }}
        />
      )}
    </div>
  )
}


