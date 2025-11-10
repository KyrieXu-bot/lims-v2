import React, { useState, useEffect, useRef, useMemo } from 'react';
import './EditableCell.css';

const RealtimeEditableCell = ({ 
  value, 
  type = 'text', 
  options = [], 
  onSave, 
  field, 
  testItemId,
  placeholder = '',
  onDataUpdate,
  isFieldBeingEdited,
  getEditingUser,
  emitUserEditing,
  emitUserStopEditing,
  suffix = '',
  loadOptions // 新增：动态加载选项的函数
}) => {
  const [isEditing, setIsEditing] = useState(false);
  // 对于 number 类型，0 是有效值，应该保留；对于其他类型，null/undefined 转为空字符串
  const getInitialEditValue = (val) => {
    if (type === 'number') {
      return val === null || val === undefined || val === '' ? '' : val;
    }
    return val || '';
  };
  const [editValue, setEditValue] = useState(getInitialEditValue(value));
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [currentOptions, setCurrentOptions] = useState(options);
  const [showOptions, setShowOptions] = useState(false);
  const inputRef = useRef(null);
  const optionsRef = useRef(null);
  const editingTimeoutRef = useRef(null);
  
  // 使用 useRef 来存储上一次的 options，避免不必要的更新
  const prevOptionsRef = useRef(options);
  
  // 检查 options 是否真的发生了变化
  const optionsChanged = useMemo(() => {
    const prev = prevOptionsRef.current;
    if (prev.length !== options.length) {
      prevOptionsRef.current = options;
      return true;
    }
    const changed = options.some((opt, idx) => {
      const prevOpt = prev[idx];
      return !prevOpt || opt.value !== prevOpt.value || opt.label !== prevOpt.label || opt.name !== prevOpt.name;
    });
    if (changed) {
      prevOptionsRef.current = options;
    }
    return changed;
  }, [options]);
  
  useEffect(() => {
    setEditValue(getInitialEditValue(value));
  }, [value, type]);

  // 当options变化时更新currentOptions - 只在真正变化时更新
  useEffect(() => {
    if (optionsChanged) {
      setCurrentOptions(options);
      if (!isEditing) {
        setFilteredOptions(options);
      }
    }
  }, [optionsChanged, options, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'text') {
        inputRef.current.select();
      }
    }
  }, [isEditing, type]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        // 检查点击是否在下拉框中
        const dropdown = document.querySelector('.options-dropdown');
        if (dropdown && dropdown.contains(event.target)) {
          return;
        }
        setShowOptions(false);
        setIsEditing(false);
        // 通知其他用户我停止了编辑
        emitUserStopEditing && emitUserStopEditing(field, testItemId);
      }
    };

    if (isEditing && showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing, showOptions, field, testItemId, emitUserStopEditing]);

  // 监听外部数据更新 - 使用 useRef 来避免依赖函数引用
  const onDataUpdateRef = useRef(onDataUpdate);
  useEffect(() => {
    onDataUpdateRef.current = onDataUpdate;
  }, [onDataUpdate]);

  useEffect(() => {
    if (onDataUpdateRef.current) {
      onDataUpdateRef.current(field, testItemId, (newValue) => {
        setEditValue(newValue);
      });
    }
  }, [field, testItemId]);

  const handleClick = async () => {
    // 检查是否有其他用户正在编辑
    if (isFieldBeingEdited && isFieldBeingEdited(field, testItemId)) {
      const editingUser = getEditingUser && getEditingUser(field, testItemId);
      if (editingUser) {
        alert(`${editingUser.userName} 正在编辑此字段，请稍后再试`);
        return;
      }
    }

    if (!isEditing) {
      setIsEditing(true);
      
      // 如果提供了动态加载选项的函数，则调用它
      if (type === 'autocomplete' && loadOptions) {
        try {
          const loadedOptions = await loadOptions();
          setCurrentOptions(loadedOptions);
          setFilteredOptions(loadedOptions);
        } catch (error) {
          console.error('加载选项失败:', error);
          // 如果加载失败，使用原有的选项
          setFilteredOptions(currentOptions);
        }
      } else if (type === 'autocomplete') {
        // 如果没有动态加载函数，使用传入的选项
        setFilteredOptions(currentOptions);
      }
      
      if (type === 'autocomplete') {
        setShowOptions(true);
      }
      
      // 通知其他用户我正在编辑
      emitUserEditing && emitUserEditing(field, testItemId, true);
    }
  };

  const handleChange = (e) => {
    let newValue = e.target.value;
    
    // 对于 number 类型，只允许数字、小数点和负号（仅在开头）
    if (type === 'number') {
      // 允许空字符串、数字、小数点
      // 不允许非数字字符（除了小数点和负号）
      const numberRegex = /^-?\d*\.?\d*$/;
      if (newValue !== '' && !numberRegex.test(newValue)) {
        // 如果输入不合法，不更新状态
        return;
      }
    }
    
    setEditValue(newValue);
    
    if (type === 'autocomplete') {
      if (newValue.trim() === '') {
        // 如果输入为空，显示所有选项
        setFilteredOptions(currentOptions);
      } else {
        // 支持按姓氏过滤，也支持全名匹配
        const filtered = currentOptions.filter(option => {
          const name = option.name.toLowerCase();
          const searchValue = newValue.toLowerCase();
          
          // 按姓氏匹配（取第一个字符）
          const firstName = name.charAt(0);
          const searchFirstChar = searchValue.charAt(0);
          
          return name.includes(searchValue) || firstName === searchFirstChar;
        });
        setFilteredOptions(filtered);
      }
      setShowOptions(true);
    }

    // 对于select类型，选择后立即保存
    // 注意：必须使用 newValue 而不是 editValue，因为 setEditValue 是异步的
    if (type === 'select') {
      handleSaveWithValue(newValue);
      return;
    }

    // 重置编辑超时
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
    }
    
    // 设置编辑超时，如果用户停止输入5秒后自动停止编辑状态
    editingTimeoutRef.current = setTimeout(() => {
      emitUserStopEditing && emitUserStopEditing(field, testItemId);
    }, 5000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleSave = async () => {
    await handleSaveWithValue(editValue);
  };

  const handleSaveWithValue = async (valueToSave) => {
    try {
      await onSave(field, valueToSave, testItemId);
      setIsEditing(false);
      setShowOptions(false);
      
      // 通知其他用户我停止了编辑
      emitUserStopEditing && emitUserStopEditing(field, testItemId);
      
      // 清除编辑超时
      if (editingTimeoutRef.current) {
        clearTimeout(editingTimeoutRef.current);
      }
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
    setShowOptions(false);
    
    // 通知其他用户我停止了编辑
    emitUserStopEditing && emitUserStopEditing(field, testItemId);
    
    // 清除编辑超时
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
    }
  };

  const handleOptionSelect = (option) => {
    setEditValue(option.name);
    setShowOptions(false);
    setIsEditing(false);
    // 直接保存选中的值
    onSave(field, option.name, testItemId);
    // 通知其他用户我停止了编辑
    emitUserStopEditing && emitUserStopEditing(field, testItemId);
  };

  const formatValue = (val) => {
    // 对于 number 类型，0 是有效值，不应该返回空字符串
    if (type === 'number') {
      if (val === null || val === undefined || val === '') return '';
      const formatted = val;
      return suffix ? `${formatted}${suffix}` : formatted;
    }
    // 对于其他类型，null/undefined/空字符串返回空
    if (!val && val !== 0) return '';
    if (type === 'date') {
      return new Date(val).toLocaleDateString('zh-CN');
    }
    if (type === 'datetime-local') {
      return new Date(val).toLocaleString('zh-CN');
    }
    if (type === 'select') {
      // 对于select类型，显示对应的中文标签
      const option = options.find(opt => opt.value === val);
      return option ? option.label : val;
    }
    return suffix ? `${val}${suffix}` : val;
  };

  // 检查是否有其他用户正在编辑此字段
  const isBeingEdited = isFieldBeingEdited && isFieldBeingEdited(field, testItemId);
  const editingUser = isBeingEdited && getEditingUser && getEditingUser(field, testItemId);

  if (!isEditing) {
    return (
      <div className="realtime-editable-cell">
        <span 
          className={`editable-cell ${type === 'number' ? 'number' : type} ${isBeingEdited ? 'being-edited' : ''}`} 
          onClick={handleClick}
          title={isBeingEdited ? `${editingUser?.userName} 正在编辑` : "点击编辑"}
        >
          {formatValue(value)}
        </span>
        {isBeingEdited && (
          <div className="editing-indicator">
            <span className="editing-dot"></span>
            <span className="editing-text">{editingUser?.userName} 编辑中</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'date') {
    return (
      <input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="editable-input date-input"
      />
    );
  }

  if (type === 'datetime-local') {
    return (
      <input
        ref={inputRef}
        type="datetime-local"
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="editable-input datetime-input"
      />
    );
  }

  if (type === 'textarea') {
    return (
      <div style={{ 
        position: 'relative',
        width: '100%'
      }}>
        <textarea
          ref={inputRef}
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="editable-input textarea-input"
          placeholder={placeholder}
          rows={6}
          style={{
            resize: 'vertical',
            height: 'auto',
            minHeight: '100px',
            width: '100%',
            maxWidth: '100%',
            fontFamily: 'inherit',
            lineHeight: '1.5',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            overflow: 'auto',
            boxSizing: 'border-box',
            display: 'block',
            backgroundColor: 'white',
            wordWrap: 'break-word',
            wordBreak: 'break-all'
          }}
        />
      </div>
    );
  }

  if (type === 'select') {
    return (
      <select
        ref={inputRef}
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="editable-input select-input"
      >
        {options.map((option, index) => (
          <option key={option.value || index} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'autocomplete') {
    return (
      <div className="autocomplete-container" ref={optionsRef}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="editable-input autocomplete-input"
          placeholder={placeholder}
        />
        {showOptions && filteredOptions.length > 0 && (
          <div className="options-dropdown" style={{ 
            left: 0,
            right: 0
          }}>
            {filteredOptions.map((option, index) => (
              <div
                key={option.id || index}
                className="option-item"
                onClick={() => handleOptionSelect(option)}
              >
                {option.name}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="editable-input"
        placeholder={placeholder}
        style={suffix ? { paddingRight: suffix ? '20px' : undefined } : {}}
      />
      {suffix && isEditing && (
        <span style={{ 
          position: 'absolute', 
          right: '8px', 
          pointerEvents: 'none',
          color: '#666',
          userSelect: 'none'
        }}>
          {suffix}
        </span>
      )}
    </div>
  );
};

export default RealtimeEditableCell;

