import { FieldType } from "@/types/types";

export const templateFields10K = [
  {
    id: "1",
    name: "documentInfo",
    type: "group" as FieldType,
    isExpanded: true,
    description: "General information about the 10-K filing",
    children: [
      {
        id: "1-1",
        name: "filingDate",
        type: "date" as FieldType,
        description: "Date the 10-K was filed with the SEC",
        children: [],
      },
      {
        id: "1-2",
        name: "fiscalYearEndDate",
        type: "date" as FieldType,
        description: "The end date of the fiscal year covered by the report",
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
    name: "companyInfo",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Basic information about the reporting company",
    children: [
      {
        id: "2-1",
        name: "companyName",
        type: "text" as FieldType,
        description: "Legal name of the company",
        children: [],
      },
      {
        id: "2-2",
        name: "tickerSymbol",
        type: "text" as FieldType,
        description: "Stock symbol for trading on exchanges",
        children: [],
      },
      {
        id: "2-3",
        name: "industry",
        type: "text" as FieldType,
        description: "Primary industry of the company",
        children: [],
      },
      {
        id: "2-4",
        name: "employeeCount",
        type: "number" as FieldType,
        description: "Total number of employees at the end of the fiscal year",
        children: [],
      },
    ],
  },
  {
    id: "3",
    name: "financialStatements",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Key data from the audited financial statements",
    children: [
      {
        id: "3-1",
        name: "incomeStatement",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Consolidated Statements of Operations",
        children: [
          {
            id: "3-1-1",
            name: "totalRevenue",
            type: "number" as FieldType,
            description: "Total revenue for the fiscal year in USD",
            children: [],
          },
          {
            id: "3-1-2",
            name: "costOfRevenue",
            type: "number" as FieldType,
            description: "Cost of goods sold or cost of services in USD",
            children: [],
          },
          {
            id: "3-1-3",
            name: "grossProfit",
            type: "number" as FieldType,
            description: "Gross profit (Revenue - Cost of Revenue) in USD",
            children: [],
          },
          {
            id: "3-1-4",
            name: "researchAndDevelopment",
            type: "number" as FieldType,
            description: "R&D expenses in USD",
            children: [],
          },
          {
            id: "3-1-5",
            name: "sellingGeneralAndAdmin",
            type: "number" as FieldType,
            description: "SG&A expenses in USD",
            children: [],
          },
          {
            id: "3-1-6",
            name: "operatingIncome",
            type: "number" as FieldType,
            description: "Operating income or loss in USD",
            children: [],
          },
          {
            id: "3-1-7",
            name: "netIncome",
            type: "number" as FieldType,
            description:
              "Net income or loss attributable to the company in USD",
            children: [],
          },
        ],
      },
      {
        id: "3-2",
        name: "balanceSheet",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Consolidated Balance Sheets",
        children: [
          {
            id: "3-2-1",
            name: "cashAndEquivalents",
            type: "number" as FieldType,
            description: "Cash and cash equivalents in USD",
            children: [],
          },
          {
            id: "3-2-2",
            name: "totalAssets",
            type: "number" as FieldType,
            description: "Total assets of the company in USD",
            children: [],
          },
          {
            id: "3-2-3",
            name: "totalLiabilities",
            type: "number" as FieldType,
            description: "Total liabilities of the company in USD",
            children: [],
          },
          {
            id: "3-2-4",
            name: "totalStockholdersEquity",
            type: "number" as FieldType,
            description: "Total stockholders' equity in USD",
            children: [],
          },
        ],
      },
      {
        id: "3-3",
        name: "cashFlowStatement",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Data from the Consolidated Statements of Cash Flows",
        children: [
          {
            id: "3-3-1",
            name: "netCashFromOperating",
            type: "number" as FieldType,
            description:
              "Net cash provided by or used in operating activities in USD",
            children: [],
          },
          {
            id: "3-3-2",
            name: "netCashFromInvesting",
            type: "number" as FieldType,
            description:
              "Net cash provided by or used in investing activities in USD",
            children: [],
          },
          {
            id: "3-3-3",
            name: "netCashFromFinancing",
            type: "number" as FieldType,
            description:
              "Net cash provided by or used in financing activities in USD",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "4",
    name: "managementDiscussion",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Management's Discussion and Analysis (MD&A)",
    children: [
      {
        id: "4-1",
        name: "liquidityAndCapitalResources",
        type: "text" as FieldType,
        description:
          "Summary of the company's liquidity position and capital resources",
        children: [],
      },
      {
        id: "4-2",
        name: "resultsOfOperations",
        type: "text" as FieldType,
        description:
          "Management's analysis of the financial results for the year",
        children: [],
      },
    ],
  },
  {
    id: "5",
    name: "riskFactors",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Key risks identified by the company",
    children: [
      {
        id: "5-1",
        name: "summaryOfKeyRisks",
        type: "text" as FieldType,
        description:
          "A summary of the most significant risks facing the company",
        children: [],
      },
    ],
  },
];
