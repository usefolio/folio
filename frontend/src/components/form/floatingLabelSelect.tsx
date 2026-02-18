import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "../ui/select";

const FloatingLabelSelect = React.memo(
  ({
    label,
    children,
    disabled,
    ...props
  }: {
    label: string;
    children: React.ReactNode;
    disabled?: boolean;
  } & React.ComponentProps<typeof Select>) => (
    <div className="relative">
      <Select {...props}>
        <SelectTrigger
          className="h-10 pt-4 pb-1 px-3 text-sm rounded-md"
          disabled={disabled}
        >
          <SelectValue placeholder=" " />
        </SelectTrigger>
        {!disabled && <SelectContent>{children}</SelectContent>}
      </Select>
      <label className="absolute top-1 left-3 text-xs text-muted-foreground">
        {label}
      </label>
    </div>
  ),
);
export default FloatingLabelSelect;
