import React, { useState, useRef, useEffect } from "react";
import { Input } from "../ui/input";
import { ViewNameInputProps } from "@/interfaces/interfaces";

// This component is completely isolated and manages its own state
const ViewNameInput: React.FC<ViewNameInputProps> = ({
  initialValue,
  onSave,
  disabled,
  placeholder,
}) => {
  // Local state is completely independent of parent component
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when initialValue changes (rarely happens)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Handle change with debounced parent updates
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Immediately update local state for responsive UI
    setLocalValue(newValue);

    // Debounce the update to parent
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSave(newValue);
    }, 300);
  };

  // Clean up any pending timers
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Render the input with only local state
  return (
    <Input
      ref={inputRef}
      value={localValue}
      disabled={disabled}
      onChange={handleChange}
      placeholder={placeholder}
      className="h-7 rounded-md w-40 !text-xs mr-2 font-medium placeholder:text-xs"
    />
  );
};

export default ViewNameInput;
