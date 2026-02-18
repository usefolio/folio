import { useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import type { OnboardingMetadata } from "@/services/onboardingService";

type UnsafeMetadataShape = Record<string, unknown> & {
  onboarding?: OnboardingMetadata;
  demoAccountCreated?: boolean;
};

export const useDemoAccountStatus = () => {
  const { user } = useUser();

  const demoAccountCreated = useMemo(() => {
    const unsafeMetadata = (user?.unsafeMetadata || {}) as UnsafeMetadataShape;
    const onboardingMetadata = unsafeMetadata.onboarding;

    const onboardingFlag =
      typeof onboardingMetadata?.demoPlanInitialized === "boolean"
        ? onboardingMetadata.demoPlanInitialized
        : undefined;

    const directFlag =
      typeof unsafeMetadata.demoAccountCreated === "boolean"
        ? unsafeMetadata.demoAccountCreated
        : undefined;

    if (typeof directFlag === "boolean") {
      return directFlag;
    }

    if (typeof onboardingFlag === "boolean") {
      return onboardingFlag;
    }

    return false;
  }, [user?.unsafeMetadata]);

  return { demoAccountCreated };
};

