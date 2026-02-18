import React from "react";
import { AccessResult } from "@/hooks/useAccess";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface AccessTooltipProps {
  access: AccessResult;
  children: React.ReactNode;
}

export const AccessTooltip: React.FC<AccessTooltipProps> = ({
  access,
  children,
}) => {
  const { t } = useTranslation();
  // If access is granted, just render the children without any wrapper.
  if (access.ok) {
    return <>{children}</>;
  }

  // If access is denied, wrap the children in a tooltip that shows the reason.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* This span wrapper is crucial for the tooltip to work on disabled elements. */}
          <span tabIndex={0}>{children}</span>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-sm text-primary">
            {t("global.service_credential_missing")}
          </p>
          <p className="text-xs text-muted-foreground">{access.reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
