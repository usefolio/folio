import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

type WarningAlertProps = {
  message?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

const WarningAlert: React.FC<WarningAlertProps> = ({ message, title, children, className }) => {
  return (
    <Alert className={`rounded-md pr-2 pl-2 py-2 border border-[#F2C14B] bg-[#FFFBED] ${className || ""}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle color="#E9A13B" className="h-4 w-4 mt-[1px]" />
        <div>
          {title && (
            <AlertTitle className="text-[#88451E] text-sm mb-0">{title}</AlertTitle>
          )}
          {(children || message) && (
            <AlertDescription className="text-xs text-[#A85823] m-0">
              {children || message}
            </AlertDescription>
          )}
        </div>
      </div>
    </Alert>
  );
};

export default WarningAlert;
