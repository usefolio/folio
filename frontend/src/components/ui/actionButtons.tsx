import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BaseProps = Omit<ButtonProps, "variant" | "size" | "shape"> & {
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  hoverBrand?: boolean; // adds hover:bg-orange-600
};

export function PrimaryActionButton({
  className,
  children,
  icon,
  iconPosition = "left",
  fullWidth,
  hoverBrand = true,
  ...props
}: BaseProps) {
  return (
    <Button
      variant="default"
      size="compact"
      shape="square"
      className={cn(hoverBrand && "hover:bg-orange-600", fullWidth && "w-full", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        {icon && iconPosition === "left" ? icon : null}
        {children}
        {icon && iconPosition === "right" ? icon : null}
      </div>
    </Button>
  );
}

type SecondaryProps = BaseProps & {
  variant?: ButtonProps["variant"]; // allow outline/destructive/ghost, default outline
};

export function SecondaryIconButton({
  className,
  children,
  icon,
  iconPosition = "left",
  fullWidth,
  variant = "outline",
  hoverBrand = false,
  ...props
}: SecondaryProps) {
  return (
    <Button
      variant={variant}
      size="compact"
      shape="square"
      className={cn(hoverBrand && "hover:bg-orange-600", fullWidth && "w-full", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        {icon && iconPosition === "left" ? icon : null}
        {children}
        {icon && iconPosition === "right" ? icon : null}
      </div>
    </Button>
  );
}

