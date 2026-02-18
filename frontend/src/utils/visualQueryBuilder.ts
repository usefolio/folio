import { Token } from "@/types/types";
import { Operator } from "@/interfaces/interfaces";

//Renders an SQL query string from the token array

export const renderSQLQuery = (tokens: Token[]) => {
  if (tokens.length === 0) return "";

  return tokens
    .map((token) => {
      if (typeof token === "string") {
        return token;
      } else if ("field" in token) {
        const { field, operator, value } = token;

        // Format field with double quotes if it contains spaces
        const formattedField = field.includes(" ") ? `"${field}"` : field;

        if (operator === "LIKE" || operator === "NOT LIKE") {
          return `${formattedField} ${operator} '%${value}%'`;
        } else {
          return `${formattedField} ${operator} '${value}'`;
        }
      }
      return "";
    })
    .join(" ");
};

// Validates if the current SQL filter

export const isValidSQLFilter = (
  tokens: Token[],
  defaultNoConditionsText: string,
) => {
  // 1. no-conditions / empty
  const query = renderSQLQuery(tokens);
  if (query === defaultNoConditionsText || query === "") return false;

  // 2. balanced parentheses
  let parenthesesCount = 0;
  for (const token of tokens) {
    if (token === "(") parenthesesCount++;
    if (token === ")") parenthesesCount--;
    if (parenthesesCount < 0) return false;
  }
  if (parenthesesCount !== 0) return false;

  // 3. invalid token sequences  ─────────────────────────────────────────
  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    const prev = tokens[i - 1];

    // (a) query must not start with AND/OR
    if (
      i === 0 &&
      typeof curr === "string" &&
      (curr === "AND" || curr === "OR")
    ) {
      return false;
    }

    // (b) two consecutive conditions → invalid
    if (i > 0 && typeof prev !== "string" && typeof curr !== "string") {
      return false;
    }

    // (c) two consecutive logical operators → invalid
    if (
      i > 0 &&
      typeof prev === "string" &&
      typeof curr === "string" &&
      (prev === "AND" || prev === "OR") &&
      (curr === "AND" || curr === "OR")
    ) {
      return false;
    }
  }

  // 4. must not end with AND/OR
  const lastToken = tokens[tokens.length - 1];
  if (
    typeof lastToken === "string" &&
    (lastToken === "AND" || lastToken === "OR")
  ) {
    return false;
  }

  return true;
};

// Determines if logical operators can be shown based on the current token state

export const canShowOperators = (tokens: Token[]) => {
  if (tokens.length === 0) return false;

  const lastToken = tokens[tokens.length - 1];
  return !(
    typeof lastToken === "string" &&
    (lastToken === "AND" || lastToken === "OR")
  );
};

// Determines if a closing parenthesis can be added based on the current token state

export const canAddCloseParenthesis = (tokens: Token[]) => {
  let openCount = 0;
  for (const token of tokens) {
    if (token === "(") openCount++;
    if (token === ")") openCount--;
  }
  return openCount > 0;
};

// Gets the label for an operator from its value

export const getOperatorLabel = (value: string, operators: Operator[]) => {
  return operators.find((op) => op.value === value)?.label || value;
};

export const canAddOpenParenthesis = (tokens: Token[]) => {
  if (tokens.length === 0) return true; // at the very start is OK
  const last = tokens[tokens.length - 1];

  // legal after a logical operator or another "("
  return (
    (typeof last === "string" && (last === "AND" || last === "OR")) ||
    last === "("
  );
};
