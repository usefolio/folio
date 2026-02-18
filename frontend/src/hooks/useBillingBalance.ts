import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackendClient } from "@/hooks/useBackendClient";
import type { BillingSummary } from "@/types/billing";

export const useBillingBalance = () => {
  const [balance, setBalance] = useState<number>(0);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const { getBillingSummary } = useBackendClient() as unknown as {
    getBillingSummary: () => Promise<BillingSummary>;
  };
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    setErrorStatus(null);
    setRefreshIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);
    setErrorStatus(null);
    getBillingSummary()
      .then((res) => {
        if (!mounted) return;
        setSummary(res ?? null);
        const val = res?.usd_remaining;
        setBalance(typeof val === "number" ? val : 0);
        setErrorStatus(null);
      })
      .catch((caughtError) => {
        if (!mounted) return;
        setSummary(null);
        setBalance(0);
        setError(true);
        const status =
          typeof caughtError === "object" && caughtError !== null
            ? (caughtError as { status?: number }).status
            : undefined;
        setErrorStatus(typeof status === "number" ? status : null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshIndex]);

  useEffect(() => {
    const id = setInterval(refresh, 300000); // 5 minutes
    return () => clearInterval(id);
  }, [refresh]);

  const monthlyCostUsd = useMemo(() => {
    if (!summary) return null;
    return summary.monthly_cost_usd ?? 0;
  }, [summary]);

  const isForbidden = errorStatus === 403;

  return {
    balance,
    refresh,
    loading,
    summary,
    monthlyCostUsd,
    error,
    errorStatus,
    isForbidden,
  };
};
