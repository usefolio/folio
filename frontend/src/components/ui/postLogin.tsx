import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import {
  isOnboardingComplete,
  OnboardingMetadata,
  useOnboardingService,
} from "@/services/onboardingService";

export default function AfterSignIn() {
  const { isSignedIn, user } = useUser();
  const createDefaultWorkspace = useMutation(
    api.service_credentials.createDefaultWorkspace,
  );
  const onboardingInFlightRef = useRef(false);
  const { setupDemoPlan, markOnboardingPresentationComplete } =
    useOnboardingService();

  useEffect(() => {
    if (!isSignedIn || !user?.id) return;
    if (onboardingInFlightRef.current) return;

    type UnsafeMetadataShape = Record<string, unknown> & {
      onboarding?: OnboardingMetadata;
      onboarded?: boolean;
    };

    const existingUnsafeMetadata = (user.unsafeMetadata || {}) as UnsafeMetadataShape;
    const onboardingMetadata: OnboardingMetadata =
      (existingUnsafeMetadata.onboarding as OnboardingMetadata | undefined) ?? {};
    const isUserOnboarded = Boolean(existingUnsafeMetadata.onboarded);

    if (
      onboardingMetadata.completed &&
      isOnboardingComplete(onboardingMetadata)
    ) {
      if (!isUserOnboarded) {
        user
          .update({
            unsafeMetadata: {
              ...existingUnsafeMetadata,
              onboarded: true,
              onboarding: onboardingMetadata,
            },
          })
          .catch((error) => {
            console.error("Failed to persist onboarding metadata", error);
          });
      }
      return;
    }

    onboardingInFlightRef.current = true;

    const emailAddress =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      null;

    const runOnboarding = async () => {
      const updates: Partial<OnboardingMetadata> = {};
      try {
        // Persist each onboarding milestone in Clerk so the flow stays idempotent.
        if (!onboardingMetadata.workspaceCreated) {
          await createDefaultWorkspace({ name: "Default Workspace" });
          updates.workspaceCreated = true;
        }

        if (!onboardingMetadata.demoPlanInitialized) {
          await setupDemoPlan({
            userId: user.id,
            emailAddress,
          });
          updates.demoPlanInitialized = true;
        }

        if (!onboardingMetadata.presentationCompleted) {
          await markOnboardingPresentationComplete({ userId: user.id });
          updates.presentationCompleted = true;
        }

        const updatedOnboarding: OnboardingMetadata = {
          ...onboardingMetadata,
          ...updates,
        };

        Object.assign(onboardingMetadata, updatedOnboarding);

        if (isOnboardingComplete(updatedOnboarding)) {
          updatedOnboarding.completed = true;
          if (!updatedOnboarding.completedAt) {
            updatedOnboarding.completedAt = new Date().toISOString();
          }
        }

        const metadataChanged =
          Object.keys(updates).length > 0 ||
          Boolean(updatedOnboarding.completed) !==
            Boolean(onboardingMetadata.completed) ||
          updatedOnboarding.completedAt !== onboardingMetadata.completedAt;

        if (metadataChanged || !isUserOnboarded) {
          await user.update({
            unsafeMetadata: {
              ...existingUnsafeMetadata,
              onboarded: true,
              onboarding: updatedOnboarding,
            },
          });
        }
      } catch (error) {
        console.error("Error running onboarding flow", error);
      } finally {
        onboardingInFlightRef.current = false;
      }
    };

    void runOnboarding();
  }, [
    createDefaultWorkspace,
    isSignedIn,
    markOnboardingPresentationComplete,
    setupDemoPlan,
    user,
  ]);

  return null;
}
