import { useMemo } from "react";
import { useUser } from "@clerk/clerk-react";

import { useBackendClient } from "@/hooks/useBackendClient";
import type { BillingSummary } from "@/types/billing";

/**
 * Helpers used during the first-login onboarding flow. Demo billing setup now
 * calls the processing backend via the shared backend client while the rest of
 * the onboarding state continues to live inside Clerk's unsafe metadata.
 */
export type OnboardingMetadata = {
  workspaceCreated?: boolean;
  demoPlanInitialized?: boolean;
  presentationCompleted?: boolean;
  completed?: boolean;
  completedAt?: string;
};

type DemoSetupPayload = {
  userId: string;
  emailAddress?: string | null;
};

type PresentationPayload = {
  userId: string;
};

export interface OnboardingService {
  setupDemoPlan: (payload: DemoSetupPayload) => Promise<BillingSummary | null>;
  markOnboardingPresentationComplete: (
    payload: PresentationPayload,
  ) => Promise<void>;
}

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const useOnboardingService = (): OnboardingService => {
  const { user } = useUser();
  const { setupDemoPlan: requestDemoPlan, getBillingSummary } = useBackendClient();

  return useMemo(() => {
    const fetchSummary = async (): Promise<BillingSummary | null> => {
      try {
        return await getBillingSummary();
      } catch (error) {
        console.warn("[Onboarding] Unable to fetch billing summary", error);
        return null;
      }
    };

    const setupDemoPlan = async ({
      userId,
      emailAddress,
    }: DemoSetupPayload): Promise<BillingSummary | null> => {
      const payload: Record<string, unknown> = { user_id: userId };
      if (emailAddress) {
        payload.email = emailAddress;
      }

      console.info(
        `[Onboarding] Provisioning demo plan for user ${userId}${
          emailAddress ? ` (${emailAddress})` : ""
        }.`,
      );

      try {
        return await requestDemoPlan(payload);
      } catch (error) {
        const message = normalizeErrorMessage(error);

        if (message === "plan_already_configured") {
          console.info(
            `[Onboarding] Demo plan already configured for user ${userId}, fetching summary.`,
          );
          return fetchSummary();
        }

        if (message.toLowerCase().includes("unauthorized")) {
          console.error("[Onboarding] Demo plan request unauthorized");
          throw new Error("demo_plan_unauthorized");
        }

        console.error("[Onboarding] Demo plan request failed", error);
        throw new Error(message);
      }
    };

    const markOnboardingPresentationComplete = async ({
      userId,
    }: PresentationPayload): Promise<void> => {
      if (!user) {
        console.warn(
          `[Onboarding] Unable to mark onboarding presentation for ${userId}: Clerk user unavailable.`,
        );
        return;
      }

      if (user.id !== userId) {
        console.warn(
          `[Onboarding] Mismatched Clerk user (${user.id}) when marking onboarding presentation for ${userId}. Continuing with active session user.`,
        );
      }

      type UnsafeMetadataShape = Record<string, unknown> & {
        onboarding?: OnboardingMetadata;
      };

      const existingUnsafeMetadata = (user.unsafeMetadata || {}) as UnsafeMetadataShape;
      const onboardingMetadata: OnboardingMetadata =
        (existingUnsafeMetadata.onboarding as OnboardingMetadata | undefined) ?? {};

      if (onboardingMetadata.presentationCompleted) {
        console.info(
          `[Onboarding] Product tour already marked as completed for user ${user.id}.`,
        );
        return;
      }

      const updatedOnboarding: OnboardingMetadata = {
        ...onboardingMetadata,
        presentationCompleted: true,
      };

      try {
        await user.update({
          unsafeMetadata: {
            ...existingUnsafeMetadata,
            onboarding: updatedOnboarding,
          },
        });
        Object.assign(onboardingMetadata, updatedOnboarding);
        console.info(
          `[Onboarding] Marked product tour as completed for user ${user.id}. Progress stored via Clerk metadata.`,
        );
      } catch (error) {
        console.error(
          `[Onboarding] Failed to mark product tour as completed for user ${user.id}.`,
          error,
        );
        throw error instanceof Error ? error : new Error(String(error));
      }
    };

    return {
      setupDemoPlan,
      markOnboardingPresentationComplete,
    };
  }, [getBillingSummary, requestDemoPlan, user]);
};

export const isOnboardingComplete = (
  metadata: OnboardingMetadata | undefined,
): boolean =>
  Boolean(
    metadata?.workspaceCreated &&
      metadata?.demoPlanInitialized &&
      metadata?.presentationCompleted,
  );

