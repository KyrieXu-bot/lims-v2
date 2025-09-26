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
      }
    };

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOptions]);

  // 监听外部数据更新
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate(field, testItemId, (newValue) => {
        setEditValue(newValue);
      });
    }
  }, [onDataUpdate, field, testItemId]);

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
        setShowOptions(true);
      }
      
      // 通知其他用户我正在编辑
      emitUserEditing && emitUserEditing(field, testItemId, true);
    }
  };

  const handleChange = (e) => {
    const newValue = e.target.value;
    setEditValue(newValue);
    
    if (type === 'autocomplete') {
      const filtered = options.filter(option => 
        option.name.toLowerCase().includes(newValue.toLowerCase()) ||
        option.name.includes(newValue)
      );
      setFilteredOptions(filtered);
      setShowOptions(true);
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
    handleSave();
  };

  const formatValue = (val) => {
    if (!val) return '-';
    if (type === 'date') {
      return new Date(val).toLocaleDateString('zh-CN');
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

  if (type === 'autocomplete') {
    return (
      <div className="autocomplete-container" ref={optionsRef}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowOptions(false), 200)}
          className="editable-input autocomplete-input"
          placeholder={placeholder}
        />
        {showOptions && filteredOptions.length > 0 && (
          <div className="options-dropdown">
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

