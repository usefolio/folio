import React from "react";
import IconButton from "@/components/ui/iconButton";
import { Skeleton } from "@/components/ui/skeleton";
import Tag from "@/components/tags/tag";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBillingBalance } from "@/hooks/useBillingBalance";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDemoAccountStatus } from "@/hooks/useDemoAccountStatus";

const BillingBalance: React.FC = () => {
  const { t } = useTranslation();
  const { balance, refresh, loading, error, isForbidden } = useBillingBalance();
  const { demoAccountCreated } = useDemoAccountStatus();
  const isTrialProvisioning = !demoAccountCreated && isForbidden;

  // When trial provisioning finishes (tag disappears), fetch fresh balance once
  const prevIsTrialProvisioning = React.useRef<boolean>(isTrialProvisioning);
  React.useEffect(() => {
    if (prevIsTrialProvisioning.current && !isTrialProvisioning) {
      // Transitioned from provisioning -> normal; refresh balance
      refresh();
    }
    prevIsTrialProvisioning.current = isTrialProvisioning;
  }, [isTrialProvisioning, refresh]);

  return (
    <div className="flex items-center justify-between px-2.5 pb-2">
      <div>
        <span className="block text-xs text-muted-foreground">
          {t("sidebar.balance.label")}
        </span>
        <div className="flex items-center gap-1 text-sm">
          {isTrialProvisioning ? (
            // During trial provisioning show the tag and hide the $ amount
            <Tag tag={t("billing.trial_account.badge") as string} colorName="lightGray" className="mt-[2px]">
              {t("billing.trial_account.badge")}
            </Tag>
          ) : (
            <>
              {loading ? (
                <Skeleton className="h-4 w-16 rounded-md" />
              ) : (
                <span>{`$${Number.isFinite(balance) ? balance.toFixed(2) : "0.00"}`}</span>
              )}
              {error && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t("sidebar.balance.error_tooltip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>
      </div>
      {/* Hide refresh while trial provisioning is ongoing */}
      {!isTrialProvisioning && (
        loading ? (
          <IconButton
            disabled
            aria-label={t("sidebar.balance.refresh")}
            icon={<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          />
        ) : (
          <IconButton
            onClick={refresh}
            aria-label={t("sidebar.balance.refresh")}
            icon={<RefreshCw className="h-4 w-4" />}
          />
        )
      )}
    </div>
  );
};

export default BillingBalance;
