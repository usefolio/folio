import { useMemo } from "react";
import { useDataContext } from "@/context/DataContext";
import { useTranslation } from "react-i18next";
import { ServiceCredential } from "@/interfaces/interfaces";
import { ProviderName, getProviderDisplayName } from "@/types/types";
import { ENABLE_CREDENTIAL_CHECK } from "@/constants";

// Define the kinds of requirements you can check
export type Requirement = {
  kind: "service";
  service: ProviderName;
};
// | { kind: 'plan'; allowed: Plan[] } // Example for future extension
// | { kind: 'credits'; resource: 'gpt4'; min: number }; // Example for future extension

// Define the result of the access check
export type AccessResult = { ok: true } | { ok: false; reason: string };

/**
 * The core evaluation logic.
 * serviceCredentials - The user's available service credentials.
 * reqs - An array of requirements to check.
 * t - The translation function.
 * AccessResult - An object indicating if access is granted and why.
 */
export function evaluateAccess(
  serviceCredentials: ServiceCredential[] | null,
  reqs: Requirement[],
  t: (key: string, p?: Record<string, unknown>) => string,
): AccessResult {
  // Loop through each requirement
  for (const r of reqs) {
    switch (r.kind) {
      case "service": {
        const hasCredential = serviceCredentials?.some(
          (cred) => cred.service === r.service,
        );
        if (!hasCredential) {
          const serviceName = getProviderDisplayName(r.service);
          return {
            ok: false,
            reason: t("global.service_credential_missing_message", {
              service: serviceName,
            }),
          };
        }
        break;
      }
      // Add other cases here in the future, e.g., 'plan', 'credits'
    }
  }

  // If all checks passed
  return { ok: true };
}

/**
 * A hook to easily check for user access rights within any component.
 * reqs - An array of requirements for the component/action.
 * AccessResult - A memoized object indicating if access is granted.
 * If disabled is added the useAccess can be bypassed if necessary
 */
export function useAccess(reqs: Requirement[]): AccessResult {
  const { serviceCredentials } = useDataContext();
  const { t } = useTranslation();

  const result = useMemo(
    () => evaluateAccess(serviceCredentials, reqs, t),
    [serviceCredentials, reqs, t],
  );

  if (!ENABLE_CREDENTIAL_CHECK) {
    return { ok: true };
  }
  return result;
}
