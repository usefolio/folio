import React, { useState, type KeyboardEvent, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  CheckIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { Condition, Token } from "@/types/types";
import {
  canShowOperators,
  canAddCloseParenthesis,
  renderSQLQuery,
  isValidSQLFilter,
  canAddOpenParenthesis,
} from "@/utils/visualQueryBuilder";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { parseFilterString } from "./filterDisplay";
import { VisualQueryBuilderProps } from "@/interfaces/interfaces";
import { useDataContext } from "@/context/DataContext";
import { useAccess } from "@/hooks/useAccess";
import { AccessTooltip } from "@/components/accessTooltip";
import {
  CONDITION_BADGE_CLASS,
  CONDITION_OPERATOR_CLASS,
  CONNECTOR_BADGE_CLASS,
  CONNECTOR_LABEL_CLASS,
  PAREN_BADGE_CLASS,
  PAREN_LABEL_CLASS,
  CONNECTOR_BADGE_BUTTON_CLASS,
  PAREN_BADGE_BUTTON_CLASS,
} from "./badgeStyles";

const VisualQueryBuilder: React.FC<VisualQueryBuilderProps> = ({
  onSave,
  onCancel,
  fields,
  loading,
  isAddingCondition,
  setIsAddingCondition,
  constructedQueryVisible,
  setConstructedQueryVisible,
  viewName,
  initialState,
  onStateChange,
  projectColumns,
  mode,
}) => {
  const { t } = useTranslation();
  const access = useAccess([{ kind: "service", service: "openai" }]);
  // Initialize state, using initialState if provided
  const [tokens, setTokens] = useState<Token[]>(initialState?.tokens || []);
  const [currentCondition, setCurrentCondition] = useState<Condition>(
    initialState?.currentCondition || {
      field: "",
      operator: "",
      value: "",
      isEditing: true,
    },
  );

  const [showOperators, setShowOperators] = useState(
    initialState?.showOperators || false,
  );
  const { loadingColumnsSet } = useDataContext();

  const columnsInProgress = useMemo(() => {
    const inProgressColumns = new Set<string>();

    if (projectColumns) {
      projectColumns.forEach((column) => {
        if (loadingColumnsSet.has(column._id)) {
          inProgressColumns.add(column.name);
        }
      });
    }

    return inProgressColumns;
  }, [projectColumns, loadingColumnsSet]);
  // Notify parent component of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        tokens,
        currentCondition,
        showOperators,
      });
    }
  }, [tokens, currentCondition, showOperators, onStateChange]);

  useEffect(() => {
    if (initialState) {
      setTokens(initialState.tokens || []);
      setCurrentCondition(
        initialState.currentCondition || {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
      );
      setShowOperators(initialState.showOperators || false);
    }
  }, [initialState]);

  const addToken = (token: Token) => {
    const newTokens = [...tokens, token];
    setTokens(newTokens);

    // After adding an opening parenthesis, immediately show condition input
    if (token === "(") {
      setIsAddingCondition(true);
      return;
    }

    if (typeof token === "string" && (token === "AND" || token === "OR")) {
      setIsAddingCondition(true);
    } else {
      setShowOperators(false);
    }
  };

  const removeLastToken = () => {
    if (tokens.length > 0) {
      const newTokens = [...tokens];
      newTokens.pop();
      setTokens(newTokens);
    }
  };

  const updateCurrentCondition = (key: keyof Condition, value: string) => {
    setCurrentCondition({ ...currentCondition, [key]: value });
  };

  const finalizeCondition = () => {
    if (
      currentCondition.field &&
      currentCondition.operator &&
      currentCondition.value
    ) {
      addToken({ ...currentCondition, isEditing: false });
      setCurrentCondition({
        field: "",
        operator: "",
        value: "",
        isEditing: true,
      });
      setIsAddingCondition(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      finalizeCondition();
    }
  };
  const handleConditionButtonClick = () => {
    finalizeCondition();
  };

  const handleAddButtonClick = () => {
    if (isAddingCondition) {
      return;
    }
    const lastToken = tokens[tokens.length - 1];

    // (a) immediately follow an inline "(": jump to condition input
    if (lastToken === "(") {
      setIsAddingCondition(true);
      return;
    }

    // (b) FIRST token in the query → start a condition
    if (tokens.length === 0) {
      setIsAddingCondition(true);
      return;
    }

    // ⭐ (c) LAST token is AND / OR → open the operator-panel
    if (
      typeof lastToken === "string" &&
      (lastToken === "AND" || lastToken === "OR")
    ) {
      setShowOperators(true); // we want the little button panel
      return; //   not the condition editor
    }

    // (d) otherwise just toggle the operator-panel as before
    setShowOperators(!showOperators);
  };

  const operators = [
    { value: "=", label: t("visual_query_builder.equals") },
    { value: "!=", label: t("visual_query_builder.does_not_equal") },
    { value: "LIKE", label: t("visual_query_builder.contains") },
    { value: "NOT LIKE", label: t("visual_query_builder.does_not_contain") },
  ];
  const sqlQuery = useMemo(() => renderSQLQuery(tokens), [tokens]);
  const parsedTokens = useMemo(() => parseFilterString(sqlQuery), [sqlQuery]);
  const handleSubmit = () => {
    onSave(sqlQuery);
  };
  return (
    <div className={`${mode ? "px-0" : "px-4"} py-0 mb-1 mt-0 w-full relative`}>
      <div className="flex items-center min-h-9">
        <div className="flex justify-end items-center gap-2 mr-2 h-full">
          {!mode && (
            <Tooltip>
              <TooltipProvider>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-xs rounded-md h-7 w-7 disabled:opacity-20"
                    disabled={loading}
                    onClick={onCancel}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <TooltipContent className="text-xs">
                    {t("visual_query_builder.cancel_button")}
                  </TooltipContent>
                </TooltipTrigger>
              </TooltipProvider>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipProvider>
              <TooltipTrigger>
                <AccessTooltip access={access}>
                  <Button
                    variant="default"
                    size="icon"
                    className={`h-7 w-7 rounded-md ${loading ? "disabled:bg-[#f9f9f9] disabled:opacity-100" : "disabled:bg-[inherit] disabled:opacity-20 "} disabled:text-foreground hover:bg-orange-600 hover:text-background text-background`}
                    disabled={
                      !isValidSQLFilter(
                        tokens,
                        t("visual_query_builder.no_conditions"),
                      ) ||
                      loading ||
                      !sqlQuery ||
                      !viewName ||
                      !access.ok
                    }
                    onClick={handleSubmit}
                  >
                    {" "}
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CheckIcon className="h-4 w-4" />
                      </div>
                    )}
                  </Button>
                </AccessTooltip>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {mode
                  ? t("visual_query_builder.save_condition")
                  : t("visual_query_builder.create_view_button")}
              </TooltipContent>
            </TooltipProvider>
          </Tooltip>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-background border w-full py-1 px-1 relative min-h-9">
          {parsedTokens.map((token, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center gap-2 min-h-full"
            >
              {token.type === "condition" && token.parts ? (
                <div
                  className={`${CONDITION_BADGE_CLASS} flex flex-row items-center space-x-1`}
                >
                  <span className="text-gray-900">{token.parts.field} </span>
                  <span className={CONDITION_OPERATOR_CLASS}>
                    {token.parts.operator.toUpperCase()}
                  </span>{" "}
                  <span className="max-w-[100px] truncate text-gray-900">
                    {token.parts.value}
                  </span>
                  <div
                    className="text-xs cursor-pointer rounded-md flex items-center"
                    onClick={() => {
                      const operatorValue = operators.find(
                        (op) =>
                          op.label.toLocaleLowerCase() ===
                          token?.parts?.operator.toLocaleLowerCase(),
                      )?.value;
                      setCurrentCondition({
                        field: token?.parts?.field ?? "",
                        value: (
                          token?.parts?.value as Condition["value"]
                        ).replace(/^["']|["']$/g, ""),
                        operator: operatorValue as Condition["operator"],
                        isEditing: false,
                      });
                      setIsAddingCondition(true);
                      setTokens(tokens.filter((_, i) => i !== index));
                    }}
                  >
                    <Edit2 className="h-3 w-3 opacity-0 hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ) : token.type === "operator" ? (
                <div className={CONNECTOR_BADGE_CLASS}>
                  <span className={CONNECTOR_LABEL_CLASS}>{token.value}</span>
                </div>
              ) : token.type === "parenthesis" ? (
                <div className={PAREN_BADGE_CLASS}>
                  <span className={PAREN_LABEL_CLASS}>{token.value}</span>
                </div>
              ) : null}
            </div>
          ))}

          {tokens.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md bg-background disabled:opacity-20"
              onClick={removeLastToken}
              aria-label={t("visual_query_builder.remove_last_token")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <div
            className={`flex items-center gap-2  ${isAddingCondition && "hidden"}`}
          >
            {!isAddingCondition && (
              <div className="flex items-center gap-2 h-[26px]">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md disabled:opacity-20 bg-background"
                  onClick={handleAddButtonClick}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {showOperators && (
                  <>
                    {canShowOperators(tokens) && (
                      <>
                        <button
                          type="button"
                          className={CONNECTOR_BADGE_BUTTON_CLASS}
                          onClick={() => addToken("AND")}
                        >
                          <span className={CONNECTOR_LABEL_CLASS}>
                            {t("visual_query_builder.operator_and")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={CONNECTOR_BADGE_BUTTON_CLASS}
                          onClick={() => addToken("OR")}
                        >
                          <span className={CONNECTOR_LABEL_CLASS}>
                            {t("visual_query_builder.operator_or")}
                          </span>
                        </button>
                      </>
                    )}
                    {canAddOpenParenthesis(tokens) && (
                      <button
                        type="button"
                        className={PAREN_BADGE_BUTTON_CLASS}
                        onClick={() => addToken("(")}
                      >
                        <span className={PAREN_LABEL_CLASS}>{String("(")}</span>
                      </button>
                    )}
                    {canAddCloseParenthesis(tokens) && (
                      <button
                        type="button"
                        className={PAREN_BADGE_BUTTON_CLASS}
                        onClick={() => addToken(")")}
                      >
                        <span className={PAREN_LABEL_CLASS}>{String(")")}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div
            className="flex absolute ml-auto items-center h-full cursor-pointer right-2.5"
            onClick={() => setConstructedQueryVisible(!constructedQueryVisible)}
          >
            {isValidSQLFilter(
              tokens,
              t("visual_query_builder.no_conditions"),
            ) ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
      </div>
      {isAddingCondition && (
        <div className="flex items-center space-x-3 bg-muted p-2 rounded-md mt-1">
          <Select
            value={currentCondition.field}
            onValueChange={(value) => updateCurrentCondition("field", value)}
          >
            <SelectTrigger
              className={`w-[140px] rounded-md h-8 text-xs ${mode && "truncate"}`}
            >
              <SelectValue
                placeholder={t("visual_query_builder.field_placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {fields?.map((field) => {
                const isInProgress = columnsInProgress.has(field);
                return (
                  <SelectItem
                    key={field}
                    value={field}
                    disabled={isInProgress}
                    className={
                      isInProgress
                        ? "rounded-md opacity-40 cursor-not-allowed"
                        : "rounded-md"
                    }
                  >
                    <div className="flex items-center w-full">
                      <span className="flex-1">{field}</span>
                      {isInProgress && (
                        <Loader2 className="h-3 w-3 ml-2 animate-spin text-primary" />
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select
            value={currentCondition.operator}
            onValueChange={(value) => updateCurrentCondition("operator", value)}
          >
            <SelectTrigger className="w-[180px] rounded-md h-8 text-xs">
              <SelectValue
                placeholder={t("visual_query_builder.placeholder_operator")}
              />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="text"
            placeholder={t("visual_query_builder.placeholder_value")}
            value={currentCondition.value}
            onChange={(e) => updateCurrentCondition("value", e.target.value)}
            onKeyDown={handleKeyPress}
            className="w-[180px] rounded-sm h-8 !text-xs placeholder:text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleConditionButtonClick}
            disabled={
              !currentCondition.value ||
              !currentCondition.field ||
              !currentCondition.operator
            }
            className="shrink-0 rounded-md h-7 w-7 bg-gray-50 disabled:opacity-20"
            aria-label={t("visual_query_builder.add_button")}
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsAddingCondition(false);
            }}
            className="shrink-0 rounded-md h-7 w-7 bg-gray-50 disabled:opacity-20"
            aria-label={t("visual_query_builder.cancel_button")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {constructedQueryVisible && (
        <Card className="mt-2 rounded-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">
                {t("visual_query_builder.development_output_label")}
              </h2>
            </div>
            <pre
              className={`text-xs bg-muted p-2 rounded-sm overflow-x-auto ${mode && "text-wrap"}`}
            >
              {!sqlQuery ? t("visual_query_builder.no_conditions") : sqlQuery}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VisualQueryBuilder;
