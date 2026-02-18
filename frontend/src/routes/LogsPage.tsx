import { LogBrowser } from "@/components/logs/logBrowser";
import React from "react";
import { useTranslation } from "react-i18next";

const LogsPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-hidden bg-muted/40 flex flex-col p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold mb-4">{t("logs_page.title")}</h1>
      </div>
      <div className="flex-1 min-h-0">
        <LogBrowser />
      </div>
    </div>
  );
};
export default LogsPage;
