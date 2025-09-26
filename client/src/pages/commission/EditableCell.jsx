import React, { useState, useEffect, useRef } from 'react';
import './EditableCell.css';

const EditableCell = ({ 
  value, 
  type = 'text', 
  options = [], 
  onSave, 
  field, 
  testItemId,
  placeholder = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [showOptions, setShowOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);
  const optionsRef = useRef(null);

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
      }
    };

    if (isEditing && showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing, showOptions]);

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
    if (!isEditing) {
      setIsEditing(true);
      if (type === 'autocomplete') {
        // 初始显示所有选项
        setFilteredOptions(options);
        setShowOptions(true);
        // 计算下拉框位置
        setTimeout(calculateDropdownPosition, 0);
      }
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
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
    setShowOptions(false);
  };

  const handleOptionSelect = (option) => {
    setEditValue(option.name);
    setShowOptions(false);
    setIsEditing(false);
    // 直接保存选中的值
    onSave(field, option.name, testItemId);
  };

  const formatValue = (val) => {
    if (!val) return '';
    if (type === 'date') {
      return new Date(val).toLocaleDateString('zh-CN');
    }
    return val;
  };

  if (!isEditing) {
    return (
      <span 
        className={`editable-cell ${type === 'number' ? 'number' : type}`} 
        onClick={handleClick}
        title="点击编辑"
      >
        {formatValue(value)}
      </span>
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

export default EditableCell;
