import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A square icon-only button with ghost styling.
// Matches the refresh button used in the billing balance component.
export interface IconButtonProps
  extends Omit<ButtonProps, "variant" | "size" | "shape" | "children"> {
  icon: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  className,
  ...props
}) => {
  return (
    <Button
      variant="ghost"
      size="iconSm"
      shape="square"
      className={cn(className)}
      {...props}
    >
      {icon}
    </Button>
  );
};

export default IconButton;
