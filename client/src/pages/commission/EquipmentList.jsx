import React, { useState, useEffect } from 'react';
import { api } from '../../api.js';
import './EquipmentList.css';

const EquipmentList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState([]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        const headers = {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        };
        const response = await fetch('/api/commission-form/department-options', { headers });
        if (response.ok) {
          const data = await response.json();
          setDepartmentOptions(data);
        }
      } catch (error) {
        console.error('获取部门列表失败:', error);
      }
    };
    fetchDepartments();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 直接使用fetch而不是通过api对象
      const params = new URLSearchParams({
        q: searchQuery,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      
      if (departmentFilter) params.append('department_id', departmentFilter);

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/commission-form/equipment-list?${params.toString()}`, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setData(data.data);
      setTotal(data.total);
    } catch (error) {
      console.error('获取设备清单数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, searchQuery, departmentFilter]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setSearchQuery('');
    setDepartmentFilter('');
    setPage(1);
  };

  const handleStatusToggle = async (item) => {
    const newStatus = item.status === '正常' ? '维修' : '正常';
    const actionName = newStatus === '正常' ? '启用' : '禁用';

    if (!window.confirm(`确定要${actionName}设备"${item.equipment_name}"吗？`)) {
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/commission-form/equipment/${item.equipment_id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('操作失败');
      }

      fetchData();
    } catch (error) {
      console.error('更新设备状态失败:', error);
      alert('操作失败，请重试');
    }
  };

  return (
    <div className="equipment-list">
      {/* 搜索和筛选区域 - 首行 */}
      <div className="filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>搜索:</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索设备名称、编号、型号..."
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="filter-group">
            <label>部门:</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">所有部门</option>
              {departmentOptions.map(dept => (
                <option key={dept.department_id} value={dept.department_id}>
                  {dept.department_name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-actions">
            <button onClick={handleSearch} className="btn-primary">搜索</button>
            <button onClick={handleReset} className="btn-secondary">重置</button>
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="table-container">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <>
            <div className="table-info">
              共 {total} 条记录，当前第 {page} 页
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>设备ID</th>
                    <th>设备名称</th>
                    <th>型号</th>
                    <th>部门</th>
                    <th>设备标签</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.equipment_id}>
                      <td>{item.equipment_id}</td>
                      <td>{item.equipment_name || '-'}</td>
                      <td>{item.model || '-'}</td>
                      <td>{item.department_name || '-'}</td>
                      <td>{item.equipment_label || '-'}</td>
                      <td>
                        <span style={{ 
                          color: item.status === '正常' || !item.status ? 'green' : 'red',
                          fontWeight: 'bold'
                        }}>
                          {item.status || '正常'}
                        </span>
                      </td>
                      <td>
                        <button
                          className={item.status === '正常' || !item.status ? 'btn-secondary' : 'btn-primary'}
                          onClick={() => handleStatusToggle(item)}
                          style={{ padding: '2px 8px', fontSize: '12px' }}
                        >
                          {item.status === '正常' || !item.status ? '禁用' : '启用'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {total > pageSize && (
              <div className="pagination">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn-secondary"
                >
                  上一页
                </button>
                <span className="page-info">
                  第 {page} 页，共 {Math.ceil(total / pageSize)} 页
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="btn-secondary"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentList;
