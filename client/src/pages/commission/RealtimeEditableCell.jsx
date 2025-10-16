import React, { useState, useEffect, useRef } from 'react';
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
  emitUserStopEditing
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [showOptions, setShowOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);
  const optionsRef = useRef(null);
  const editingTimeoutRef = useRef(null);

  useEffect(() => {
    setEditValue(value || '');
  }, [value]);

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

  // 监听外部数据更新
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate(field, testItemId, (newValue) => {
        setEditValue(newValue);
      });
    }
  }, [onDataUpdate, field, testItemId]);

  const calculateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
    }
  };

  const handleClick = () => {
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
      if (type === 'autocomplete') {
        // 初始显示所有选项
        setFilteredOptions(options);
        setShowOptions(true);
        // 计算下拉框位置
        setTimeout(calculateDropdownPosition, 0);
      }
      
      // 通知其他用户我正在编辑
      emitUserEditing && emitUserEditing(field, testItemId, true);
    }
  };

  const handleChange = (e) => {
    const newValue = e.target.value;
    setEditValue(newValue);
    
    if (type === 'autocomplete') {
      if (newValue.trim() === '') {
        // 如果输入为空，显示所有选项
        setFilteredOptions(options);
      } else {
        // 支持按姓氏过滤，也支持全名匹配
        const filtered = options.filter(option => {
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
      // 重新计算下拉框位置
      calculateDropdownPosition();
    }

    // 对于select类型，选择后立即保存
    if (type === 'select') {
      handleSave();
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
    try {
      await onSave(field, editValue, testItemId);
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
    if (!val) return '';
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
    return val;
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
      <textarea
        ref={inputRef}
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="editable-input textarea-input"
        placeholder={placeholder}
        rows={3}
        style={{
          resize: 'vertical',
          minHeight: '40px',
          width: '100%',
          fontFamily: 'inherit',
          lineHeight: '1.4'
        }}
      />
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
          <div 
            className="options-dropdown"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left
            }}
          >
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
    <input
      ref={inputRef}
      type={type}
      value={editValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleSave}
      className="editable-input"
      placeholder={placeholder}
    />
  );
};

export default RealtimeEditableCell;

