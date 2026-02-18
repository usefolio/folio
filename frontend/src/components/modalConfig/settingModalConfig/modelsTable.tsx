import React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ModelsTableProps } from "@/interfaces/interfaces";
const ModelsTable: React.FC<ModelsTableProps> = ({
  models,
  isVisible = true,
}) => {
  const { t } = useTranslation();
  if (!models || models.length === 0) {
    return (
      <div className="text-xs text-center py-2 text-gray-500">
        {t("modal_manager.settings_modal_config.table_no_models")}
      </div>
    );
  }

  return (
    <div
      className="space-y-1 w-full"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: "opacity 300ms ease-in-out, transform 300ms ease-in-out",
        transform: isVisible ? "translateY(0)" : "translateY(-10px)",
        transitionDelay: isVisible ? "50ms" : "0ms",
      }}
    >
      <div className="border border-gray-200 bg-white shadow-sm rounded-md">
        <div
          className="grid grid-cols-[1fr_120px] gap-2 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200 z-50 sticky top-0"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: "opacity 250ms ease-in-out",
            transitionDelay: "50ms",
          }}
        >
          <div>{t("modal_manager.settings_modal_config.table_model")}</div>
          <div className="text-right">
            {t("modal_manager.settings_modal_config.table_tokens_used")}
          </div>
        </div>

        <div
          className="overflow-y-auto"
          style={{
            maxHeight: "200px",
            scrollbarWidth: "thin", // Firefox
            msOverflowStyle: "none", // IE/Edge
          }}
        >
          {/* Model rows */}
          {models.map((model, index) => (
            <div
              key={model.id}
              className={cn(
                "grid grid-cols-[1fr_120px] gap-2 items-center px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0",
              )}
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(10px)",
                transition:
                  "opacity 250ms ease-in-out, transform 250ms ease-in-out",
                transitionDelay: isVisible ? `${100 + index * 50}ms` : "0ms",
              }}
            >
              <div className="truncate pr-2 text-sm" title={model.name}>
                {model.name}
              </div>
              <div className="text-xs text-right font-mono">
                {model.tokensUsed.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModelsTable;
