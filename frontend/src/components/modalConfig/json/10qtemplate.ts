import { FieldType } from "@/types/types";

export const templateFields10Q = [
  {
    id: "1",
    name: "documentInfo",
    type: "group" as FieldType,
    isExpanded: true,
    description: "General information about the 10-Q filing",
    children: [
      {
        id: "1-1",
        name: "filingDate",
        type: "date" as FieldType,
        description: "Date the 10-Q was filed with the SEC",
        children: [],
      },
      {
        id: "1-2",
        name: "quarterEndDate",
        type: "date" as FieldType,
        description: "The end date of the fiscal quarter covered by the report",
        children: [],
      },
      {
        id: "1-3",
        name: "secFileNumber",
        type: "text" as FieldType,
        description: "SEC file number for the company",
        children: [],
      },
      {
        id: "1-4",
        name: "cik",
        type: "text" as FieldType,
        description: "Central Index Key (CIK) number of the company",
        children: [],
      },
    ],
  },
  {
    id: "2",
    name: "condensedFinancialStatements",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Key data from the unaudited condensed financial statements",
    children: [
      {
        id: "2-1",
        name: "incomeStatement",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Condensed Statements of Operations",
        children: [
          {
            id: "2-1-1",
            name: "totalRevenueCurrentQuarter",
            type: "number" as FieldType,
            description: "Total revenue for the current quarter in USD",
            children: [],
          },
          {
            id: "2-1-2",
            name: "totalRevenuePriorYearQuarter",
            type: "number" as FieldType,
            description:
              "Total revenue for the same quarter in the prior year in USD",
            children: [],
          },
          {
            id: "2-1-3",
            name: "netIncomeCurrentQuarter",
            type: "number" as FieldType,
            description: "Net income or loss for the current quarter in USD",
            children: [],
          },
          {
            id: "2-1-4",
            name: "netIncomePriorYearQuarter",
            type: "number" as FieldType,
            description:
              "Net income or loss for the same quarter in the prior year in USD",
            children: [],
          },
        ],
      },
      {
        id: "2-2",
        name: "balanceSheet",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Condensed Balance Sheets",
        children: [
          {
            id: "2-2-1",
            name: "totalAssets",
            type: "number" as FieldType,
            description: "Total assets at the end of the quarter in USD",
            children: [],
          },
          {
            id: "2-2-2",
            name: "totalLiabilities",
            type: "number" as FieldType,
            description: "Total liabilities at the end of the quarter in USD",
            children: [],
          },
          {
            id: "2-2-3",
            name: "cashAndEquivalents",
            type: "number" as FieldType,
            description:
              "Cash and cash equivalents at the end of the quarter in USD",
            children: [],
          },
        ],
      },
      {
        id: "2-3",
        name: "cashFlowStatement",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Condensed Statements of Cash Flows",
        children: [
          {
            id: "2-3-1",
            name: "netCashFromOperating",
            type: "number" as FieldType,
            description:
              "Net cash from operating activities for the period in USD",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "managementDiscussion",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Management's Discussion and Analysis (MD&A) for the quarter",
    children: [
      {
        id: "3-1",
        name: "quarterlyResultsAnalysis",
        type: "text" as FieldType,
        description:
          "Management's analysis of the financial results for the quarter",
        children: [],
      },
    ],
  },
  {
    id: "4",
    name: "riskFactors",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Updates on key risks since the last annual report",
    children: [
      {
        id: "4-1",
        name: "materialChangesToRiskFactors",
        type: "text" as FieldType,
        description:
          "Description of any new or materially changed risk factors",
        children: [],
      },
    ],
  },
];
