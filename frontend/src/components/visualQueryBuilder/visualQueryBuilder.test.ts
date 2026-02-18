import { describe, it, expect } from "vitest";
import { Token } from "@/types/types";
import {
  renderSQLQuery,
  isValidSQLFilter,
  canShowOperators,
  canAddCloseParenthesis,
  canAddOpenParenthesis,
} from "../../utils/visualQueryBuilder";

// Unit tests for utility functions
describe("VisualQueryBuilder Utility Functions", () => {
  describe("utility - renderSQLQuery", () => {
    it("returns empty string for empty tokens", () => {
      expect(renderSQLQuery([])).toBe("");
    });

    it("formats simple conditions", () => {
      const tokens = [
        {
          field: "email",
          operator: "=",
          value: "test@example.com",
          isEditing: false,
        },
      ];
      expect(renderSQLQuery(tokens)).toBe("email = 'test@example.com'");
    });

    it("formats LIKE operators with % wildcards", () => {
      const tokens = [
        { field: "name", operator: "LIKE", value: "John", isEditing: false },
      ];
      expect(renderSQLQuery(tokens)).toBe("name LIKE '%John%'");
    });

    it("formats NOT LIKE operators with % wildcards", () => {
      const tokens = [
        {
          field: "name",
          operator: "NOT LIKE",
          value: "John",
          isEditing: false,
        },
      ];
      expect(renderSQLQuery(tokens)).toBe("name NOT LIKE '%John%'");
    });

    it("formats complex query with multiple conditions and operators", () => {
      const tokens = [
        "(",
        {
          field: "email",
          operator: "=",
          value: "test@example.com",
          isEditing: false,
        },
        "AND",
        { field: "name", operator: "LIKE", value: "John", isEditing: false },
        ")",
        "OR",
        {
          field: "status",
          operator: "!=",
          value: "inactive",
          isEditing: false,
        },
      ];
      expect(renderSQLQuery(tokens as Token[])).toBe(
        "( email = 'test@example.com' AND name LIKE '%John%' ) OR status != 'inactive'",
      );
    });
  });

  describe("utility - isValidSQLFilter", () => {
    it("returns false for empty tokens", () => {
      expect(isValidSQLFilter([], "No conditions set")).toBe(false);
    });

    it("returns false for unbalanced parentheses", () => {
      const tokensWithOpeningParen = [
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
      ];
      expect(isValidSQLFilter(tokensWithOpeningParen as Token[], "")).toBe(
        false,
      );

      const tokensWithClosingParen = [
        { field: "name", operator: "=", value: "John", isEditing: false },
        ")",
      ];
      expect(isValidSQLFilter(tokensWithClosingParen as Token[], "")).toBe(
        false,
      );
    });

    it("returns false if ending with logical operator", () => {
      const tokensEndingWithAnd = [
        { field: "name", operator: "=", value: "John", isEditing: false },
        "AND",
      ];
      expect(isValidSQLFilter(tokensEndingWithAnd as Token[], "")).toBe(false);
    });

    it("returns true for valid simple condition", () => {
      const validTokens = [
        { field: "name", operator: "=", value: "John", isEditing: false },
      ];
      expect(isValidSQLFilter(validTokens, "")).toBe(true);
    });

    it("returns true for valid complex condition", () => {
      const validComplexTokens = [
        "(",
        {
          field: "email",
          operator: "=",
          value: "test@example.com",
          isEditing: false,
        },
        "AND",
        { field: "name", operator: "LIKE", value: "John", isEditing: false },
        ")",
        "OR",
        {
          field: "status",
          operator: "!=",
          value: "inactive",
          isEditing: false,
        },
      ];
      expect(isValidSQLFilter(validComplexTokens as Token[], "")).toBe(true);
    });
  });

  describe("utility - canShowOperators", () => {
    it("returns false for empty tokens", () => {
      expect(canShowOperators([])).toBe(false);
    });

    it("returns true after a condition", () => {
      const tokens = [
        { field: "name", operator: "=", value: "John", isEditing: false },
      ];
      expect(canShowOperators(tokens)).toBe(true);
    });

    it("returns true after a closing parenthesis", () => {
      const tokens = [
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
        ")",
      ];
      expect(canShowOperators(tokens as Token[])).toBe(true);
    });

    it("returns false after a logical operator", () => {
      const tokensWithLogicalOp = [
        { field: "name", operator: "=", value: "John", isEditing: false },
        "AND",
      ];
      expect(canShowOperators(tokensWithLogicalOp as Token[])).toBe(false);
    });
  });

  describe("canAddCloseParenthesis", () => {
    it("returns false with no opening parentheses", () => {
      const tokens = [
        { field: "name", operator: "=", value: "John", isEditing: false },
      ];
      expect(canAddCloseParenthesis(tokens)).toBe(false);
    });

    it("returns true with unclosed parentheses", () => {
      const tokens = [
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
      ];
      expect(canAddCloseParenthesis(tokens as Token[])).toBe(true);
    });

    it("returns false when parentheses are balanced", () => {
      const tokens = [
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
        ")",
      ];
      expect(canAddCloseParenthesis(tokens as Token[])).toBe(false);
    });

    it("handles nested parentheses correctly", () => {
      const tokensWithNestedOpen = [
        "(",
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
        ")",
      ];
      expect(canAddCloseParenthesis(tokensWithNestedOpen as Token[])).toBe(
        true,
      );

      const tokensWithAllClosed = [
        "(",
        "(",
        { field: "name", operator: "=", value: "John", isEditing: false },
        ")",
        ")",
      ];
      expect(canAddCloseParenthesis(tokensWithAllClosed as Token[])).toBe(
        false,
      );
    });
  });

  describe("utility - isValidSQLFilter", () => {
    it("returns false for consecutive conditions with no logical operator", () => {
      const invalidTokens = [
        { field: "agent", operator: "LIKE", value: "John", isEditing: false },
        { field: "agent", operator: "LIKE", value: "Tim", isEditing: false },
      ];
      expect(isValidSQLFilter(invalidTokens as Token[], "")).toBe(false);
    });
  });

  describe("utility - canOpenParanthesis", () => {
    it("returns true at the very start of a query", () => {
      expect(canAddOpenParenthesis([])).toBe(true);
    });

    it("returns true right after a logical operator", () => {
      const tokens = [
        { field: "name", operator: "LIKE", value: "John", isEditing: false },
        "OR",
      ];
      expect(canAddOpenParenthesis(tokens as Token[])).toBe(true);
    });

    it("returns true immediately after another '('", () => {
      const tokens = ["("];
      expect(canAddOpenParenthesis(tokens as Token[])).toBe(true);
    });

    it("returns false right after a condition", () => {
      const tokens = [
        { field: "files", operator: "LIKE", value: "12", isEditing: false },
      ];
      expect(canAddOpenParenthesis(tokens as Token[])).toBe(false);
    });

    it("returns false right after a closing parenthesis", () => {
      const tokens = [
        "(",
        { field: "files", operator: "LIKE", value: "12", isEditing: false },
        ")",
      ];
      expect(canAddOpenParenthesis(tokens as Token[])).toBe(false);
    });
  });
});
