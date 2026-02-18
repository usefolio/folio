import React, { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

interface ColumnNameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error: string | null;
  disabled?: boolean;
}

const ColumnNameInput = React.memo(
  ({ value, onChange, placeholder, error, disabled }: ColumnNameInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    // Local state for immediate UI feedback

    useEffect(() => {
      if (inputRef.current && inputRef.current.value !== value) {
        inputRef.current.value = value;
      }
    }, [value]);
    // Clean up debounce on unmoun
    // Input is now unctrolled
    return (
      <Input
        ref={inputRef}
        id="column-name"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-md ${
          error ? "border-red-500 focus:ring-red-500" : ""
        }`}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  },
);

export default ColumnNameInput;
