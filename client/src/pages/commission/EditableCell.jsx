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
      }
    };

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOptions]);

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      if (type === 'autocomplete') {
        setShowOptions(true);
      }
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
    handleSave();
  };

  const formatValue = (val) => {
    if (!val) return '-';
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

export default EditableCell;
