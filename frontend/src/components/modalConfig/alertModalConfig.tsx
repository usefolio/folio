import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import VisualQueryBuilder from "@/components/visualQueryBuilder/visualQueryBuilder";
import { useDataContext } from "@/context/DataContext";
import { QueryBuilderState } from "@/interfaces/interfaces";
import type { Doc } from "convex/_generated/dataModel";
import { AlertModalConfigProps } from "@/interfaces/interfaces";
import { AlertData, AlertFormErrors } from "@/types/types";
import { showSuccessNotification } from "../notification/NotificationHandler";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function AlertModalConfig({
  onSave,
  onCancel,
  isLoading,
}: AlertModalConfigProps) {
  const { columns } = useDataContext();
  const { t } = useTranslation();
  const fieldNames = React.useMemo(() => columns.map((c) => c.name), [columns]);

  const [alertName, setAlertName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<AlertData["frequency"]>("daily");
  const [errors, setErrors] = useState<AlertFormErrors>({});

  // State for the VisualQueryBuilder
  const [sqlCondition, setSqlCondition] = useState("1=1");
  const [builderState, setBuilderState] = useState<QueryBuilderState | null>(
    null,
  );
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [constructedQueryVisible, setConstructedQueryVisible] = useState(false);

  const handleSave = () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return; // Stop the save if there are errors
    }

    const data: AlertData = {
      name: alertName,
      description,
      conditions: sqlCondition,
      queryBuilderState: builderState
        ? JSON.stringify(builderState)
        : undefined,
      frequency,
      email,
    };
    onSave(data);
  };
  const validateForm = (): AlertFormErrors => {
    const newErrors: AlertFormErrors = {};

    if (!alertName.trim()) {
      newErrors.alertName = t(
        "modal_manager.alert_modal_config.alert_name_required",
      );
    }

    if (!email.trim()) {
      newErrors.email = t("modal_manager.alert_modal_config.email_required");
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t("modal_manager.alert_modal_config.email_invalid");
    }

    return newErrors;
  };
  const handleSetSqlCondition = (sqlCondition: string) => {
    setSqlCondition(sqlCondition);
    showSuccessNotification(
      t("modal_config.alert_modal_config.condition_set"),
      t("modal_config.alert_modal_config.condition_set_successfully"),
    );
  };
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Alert Name */}
        <div className="space-y-1">
          <Label className="text-gray-500 text-xs" htmlFor="alertName">
            {t("modal_manager.alert_modal_config.alert_name_label")}
          </Label>
          <Input
            id="alertName"
            placeholder={t(
              "modal_manager.alert_modal_config.alert_name_placeholder",
            )}
            value={alertName}
            onChange={(e) => {
              setAlertName(e.target.value);
              if (errors.alertName)
                setErrors({ ...errors, alertName: undefined });
            }}
            className={cn("text-sm rounded-md", {
              "border-destructive": !!errors.alertName,
            })}
          />
          {errors.alertName && (
            <p className="text-xs text-destructive mt-1">{errors.alertName}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-gray-500 text-xs" htmlFor="description">
            {t("modal_manager.alert_modal_config.description_label")}
          </Label>
          <Input
            id="description"
            placeholder="Brief description of what this alert monitors"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm rounded-md"
          />
        </div>

        {/* Conditions - Using VisualQueryBuilder */}
        <div className="space-y-1">
          <Label className="text-gray-500 text-xs">
            {t("modal_manager.alert_modal_config.conditions_label")}
          </Label>
          <VisualQueryBuilder
            viewName={
              alertName ||
              t("modal_manager.alert_modal_config.new_alert_default_name")
            }
            fields={fieldNames}
            loading={false}
            isAddingCondition={isAddingCondition}
            setIsAddingCondition={setIsAddingCondition}
            constructedQueryVisible={constructedQueryVisible}
            setConstructedQueryVisible={setConstructedQueryVisible}
            onStateChange={setBuilderState}
            onSave={handleSetSqlCondition} // Capture the generated SQL string
            onCancel={() => {}} // Not used here, main cancel is in footer
            projectColumns={columns as Doc<"column">[]}
            mode={"alert"}
          />
        </div>

        {/* Frequency */}
        <div className="space-y-1">
          <Label className="text-gray-500 text-xs" htmlFor="frequency">
            {t("modal_manager.alert_modal_config.frequency_label")}
          </Label>
          <Select
            value={frequency}
            onValueChange={(v) => setFrequency(v as AlertData["frequency"])}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">
                {t("modal_manager.alert_modal_config.frequency_immediate")}
              </SelectItem>
              <SelectItem value="hourly">
                {t("modal_manager.alert_modal_config.frequency_hourly")}
              </SelectItem>
              <SelectItem value="daily">
                {t("modal_manager.alert_modal_config.frequency_daily")}
              </SelectItem>
              <SelectItem value="weekly">
                {t("modal_manager.alert_modal_config.frequency_weekly")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <Label className="text-gray-500 text-xs" htmlFor="email">
            {t("modal_manager.alert_modal_config.email_label")}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder={t(
              "modal_manager.alert_modal_config.email_placeholder",
            )}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({ ...errors, email: undefined });
            }}
            className={cn("text-sm rounded-md", {
              "border-destructive": !!errors.email,
            })}
          />
          {errors.email && (
            <p className="text-xs text-destructive mt-1">{errors.email}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex justify-end gap-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="h-8 rounded-md"
        >
          {t("global.cancel")}
        </Button>
        <Button
          variant="default"
          onClick={handleSave}
          size="sm"
          disabled={isLoading}
          className="h-8 hover:bg-orange-600 rounded-md"
        >
          {isLoading
            ? t("modal_manager.alert_modal_config.saving_button")
            : t("modal_manager.alert_modal_config.create_alert_button")}
        </Button>
      </div>
    </div>
  );
}
