import React from "react";
import { Input } from "../ui/input";
const FloatingLabelInput = React.memo(
  ({
    label,
    ...props
  }: { label: string } & React.ComponentProps<typeof Input>) => {
    return (
      <div className="relative">
        <Input
          {...props}
          placeholder=" "
          className="h-10 pt-4 pb-1 px-3 text-sm rounded-md peer"
        />
        <label className="absolute top-1 left-3 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs">
          {label}
        </label>
      </div>
    );
  },
);
export default FloatingLabelInput;
