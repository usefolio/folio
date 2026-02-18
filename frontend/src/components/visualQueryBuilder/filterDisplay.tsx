import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FilterDisplayProps } from "@/interfaces/interfaces";
import { FilterToken } from "@/types/types";
import {
  BADGE_BASE_CLASS,
  BADGE_LABEL_CLASS,
  CONDITION_BADGE_CLASS,
  CONDITION_OPERATOR_CLASS,
  CONNECTOR_BADGE_CLASS,
  CONNECTOR_LABEL_CLASS,
  PAREN_BADGE_CLASS,
  PAREN_LABEL_CLASS,
} from "./badgeStyles";

const FilterDisplay: React.FC<FilterDisplayProps> = ({
  filterString,
  filterConditions,
  mode,
}) => {
  const { t } = useTranslation();
  const tokens = useMemo(() => {
    if (!filterString || filterString.trim() === "") {
      return [];
    }
    return parseFilterString(filterString);
  }, [filterString]);
  // If no filter or empty filter, don't render anything
  if (!filterString || filterString.trim() === "") {
    return null;
  }

  // Case for default sheet
  if (filterString === "1=1") {
    return (
      <div className={`mt-0 ${mode ? "ml-0" : "ml-4"}`}>
        <div className="flex flex-wrap gap-2 items-center">
          {!mode && <span className="text-xs">{filterConditions}</span>}
          <div className={`${BADGE_BASE_CLASS} bg-gray-200`}>
            <span className={`${BADGE_LABEL_CLASS} text-gray-600`}>
              {t("visual_query_builder.no_filters").toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  // Parse the filter string into tokens

  if (tokens.length === 0) {
    return null;
  }

  return (
    <div className={`mt-0 ${mode ? "ml-0" : "ml-4"}`}>
      <div className="flex flex-wrap gap-2 items-center">
        {!mode && <span className="text-xs">{filterConditions}</span>}
        {tokens.map((token, index) => {
          if (token.type === "condition" && token.parts) {
            return (
              <div key={index} className={CONDITION_BADGE_CLASS}>
                <span className="text-gray-900">{token.parts.field} </span>
                <span className={CONDITION_OPERATOR_CLASS}>
                  {token.parts.operator.toUpperCase()}
                </span>{" "}
                <span className="max-w-[100px] tuncrate text-gray-900">
                  "{token.parts.value}"
                </span>
              </div>
            );
          } else if (token.type === "operator") {
            return (
              <div key={index} className={CONNECTOR_BADGE_CLASS}>
                <span className={CONNECTOR_LABEL_CLASS}>{token.value}</span>
              </div>
            );
          } else if (token.type === "parenthesis") {
            return (
              <div key={index} className={PAREN_BADGE_CLASS}>
                <span className={PAREN_LABEL_CLASS}>{token.value}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

// Function to parse the filter string into tokens
export const parseFilterString = (filterString: string): FilterToken[] => {
  if (!filterString) return [];

  // Operator translation map
  const operatorMap: Record<string, string> = {
    "=": "EQUALS",
    "!=": "DOES NOT EQUAL",
    "<>": "DOES NOT EQUAL",
    ">": "IS GREATER THAN",
    "<": "IS LESS THAN",
    ">=": "IS GREATER THAN OR EQUAL TO",
    "<=": "IS LESS THAN OR EQUAL TO",
    LIKE: "CONTAINS",
    "NOT LIKE": "DOES NOT CONTAIN",
  };

  // Translate operator to readable form
  const translateOperator = (op: string): string => {
    return operatorMap[op] || op;
  };

  // Extract condition tokens
  const extractConditions = () => {
    const conditionTokens: FilterToken[] = [];

    // Look for quoted field conditions - "Field Name" OPERATOR 'value'
    const quotedFieldRegex =
      /"([^"]+)"\s+(=|!=|<>|>|<|>=|<=|LIKE|NOT LIKE)\s+'([^']+)'/g;
    let quotedMatch;
    let processedRanges: { start: number; end: number }[] = [];

    while ((quotedMatch = quotedFieldRegex.exec(filterString)) !== null) {
      const field = quotedMatch[1];
      const rawOperator = quotedMatch[2];
      let value = quotedMatch[3];

      // Translate the operator
      const operator = translateOperator(rawOperator);

      // Remove % symbols for LIKE operators
      if (rawOperator === "LIKE" || rawOperator === "NOT LIKE") {
        value = value.replace(/^%|%$/g, "");
      }

      conditionTokens.push({
        type: "condition",
        value: quotedMatch[0],
        parts: {
          field,
          operator,
          value,
        },
      });

      // Keep track of processed ranges to avoid double-processing
      processedRanges.push({
        start: quotedMatch.index,
        end: quotedMatch.index + quotedMatch[0].length,
      });
    }

    // Look for standard field conditions - FieldName OPERATOR 'value'
    const standardFieldRegex =
      /([^\s"]+)\s+(=|!=|<>|>|<|>=|<=|LIKE|NOT LIKE)\s+'([^']+)'/g;
    let standardMatch;

    while ((standardMatch = standardFieldRegex.exec(filterString)) !== null) {
      // Check if this match overlaps with any quoted field match
      const matchStart = standardMatch.index;
      const matchEnd = matchStart + standardMatch[0].length;

      const overlaps = processedRanges.some(
        (range) =>
          (matchStart >= range.start && matchStart < range.end) ||
          (matchEnd > range.start && matchEnd <= range.end),
      );

      if (!overlaps) {
        const field = standardMatch[1];
        const rawOperator = standardMatch[2];
        let value = standardMatch[3];

        // Translate the operator
        const operator = translateOperator(rawOperator);

        // Remove % symbols for LIKE operators
        if (rawOperator === "LIKE" || rawOperator === "NOT LIKE") {
          value = value.replace(/^%|%$/g, "");
        }

        conditionTokens.push({
          type: "condition",
          value: standardMatch[0],
          parts: {
            field,
            operator,
            value,
          },
        });
      }
    }

    return conditionTokens;
  };

  // Extract operator tokens (AND, OR)
  const extractOperators = () => {
    const operatorTokens: FilterToken[] = [];
    const operatorRegex = /\b(AND|OR)\b/g;
    let operatorMatch;

    while ((operatorMatch = operatorRegex.exec(filterString)) !== null) {
      operatorTokens.push({
        type: "operator",
        value: operatorMatch[0],
      });
    }

    return operatorTokens;
  };

  // Extract parenthesis tokens
  const extractParentheses = () => {
    const parenthesisTokens: FilterToken[] = [];
    const parenthesisRegex = /(\(|\))/g;
    let parenthesisMatch;

    while ((parenthesisMatch = parenthesisRegex.exec(filterString)) !== null) {
      parenthesisTokens.push({
        type: "parenthesis",
        value: parenthesisMatch[0],
      });
    }

    return parenthesisTokens;
  };

  // Create a map of all tokens with their positions
  const createTokenPositionMap = () => {
    const conditions = extractConditions();
    const operators = extractOperators();
    const parentheses = extractParentheses();

    // Track used positions
    const usedIndexes = new Set<number>();

    const findUniqueIndex = (tokenValue: string) => {
      let startIndex = 0;
      while (startIndex < filterString.length) {
        const index = filterString.indexOf(tokenValue, startIndex);
        if (index === -1) break;

        if (!usedIndexes.has(index)) {
          usedIndexes.add(index);
          return index;
        }
        startIndex = index + 1;
      }
      return -1;
    };

    // Find all token positions in the string
    const positionMap: { token: FilterToken; index: number }[] = [];

    for (const token of [...conditions, ...operators, ...parentheses]) {
      const index = findUniqueIndex(token.value);
      if (index !== -1) {
        positionMap.push({ token, index });
      }
    }
    return positionMap.sort((a, b) => a.index - b.index);
  };

  // Generate the ordered token array
  const tokenPositions = createTokenPositionMap();
  return tokenPositions.map((item) => item.token);
};

export default FilterDisplay;
