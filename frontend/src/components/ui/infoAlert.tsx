import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";

type InfoAlertProps = {
  message: React.ReactNode;
  className?: string;
};

const InfoAlert: React.FC<InfoAlertProps> = ({ message, className }) => {
  return (
    <Alert className={`rounded-md border bg-blue-50/50 ${className || ""}`}>
      <InfoIcon className="h-4 w-4" />
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  );
};

export default InfoAlert;

