import React from "react";
import { AutomationInput } from "@/components/landingResearch/automationInput";
import { StarterPrompts } from "@/components/landingResearch/starterPrompts";
import { useTranslation } from "react-i18next";
const LandingResearch: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-background min-h-screen w-full flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-semibold text-center text-foreground mb-8">
          {t("landing_research_page.title")}
        </h1>
        <AutomationInput />
        <StarterPrompts />
      </div>
    </div>
  );
};
export default LandingResearch;
