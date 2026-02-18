import { AlertsList } from "@/components/alerts/alertsList";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useModal } from "@/context/ModalContext";
import React from "react";

const AlertsPage: React.FC = () => {
  const { t } = useTranslation();
  const { openModal } = useModal();

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6 scrollbar-thin">
      <div className="mx-auto flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold mb-1">
            {t("alerts_page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("alerts_page.subtitle")}
          </p>
        </div>
        <Button
          variant="default"
          size="compact"
          shape="square"
          onClick={() => openModal("alert")}
          className="hover:bg-orange-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("alerts_page.create_alert_button")}
        </Button>
      </div>
      <AlertsList />
    </div>
  );
};
export default AlertsPage;
