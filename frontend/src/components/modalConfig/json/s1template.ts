import { FieldType } from "@/types/types";
export const s1templateFields = [
  {
    id: "1",
    name: "documentInfo",
    type: "group" as FieldType,
    isExpanded: true,
    description: "General information about the S-1 filing document",
    children: [
      {
        id: "1-1",
        name: "documentType",
        type: "text" as FieldType,
        description: "Type of SEC filing document (e.g., S-1, S-1/A)",
        children: [],
      },
      {
        id: "1-2",
        name: "filingDate",
        type: "date" as FieldType,
        description: "Date when the document was filed with the SEC",
        children: [],
      },
      {
        id: "1-3",
        name: "secFileNumber",
        type: "text" as FieldType,
        description: "SEC file number assigned to the registration statement",
        children: [],
      },
    ],
  },
  {
    id: "2",
    name: "companyInfo",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Basic information about the company filing for IPO",
    children: [
      {
        id: "2-1",
        name: "companyName",
        type: "text" as FieldType,
        description: "Legal name of the company as it appears in the filing",
        children: [],
      },
      {
        id: "2-2",
        name: "proposedTickerSymbol",
        type: "text" as FieldType,
        description: "Proposed stock symbol for trading on exchanges",
        children: [],
      },
      {
        id: "2-3",
        name: "industry",
        type: "text" as FieldType,
        description: "Primary industry classification of the company",
        children: [],
      },
      {
        id: "2-4",
        name: "incorporationDate",
        type: "date" as FieldType,
        description: "Date when the company was legally incorporated",
        children: [],
      },
      {
        id: "2-5",
        name: "fiscalYearEnd",
        type: "text" as FieldType,
        description: "Month and day of the company's fiscal year end",
        children: [],
      },
      {
        id: "2-6",
        name: "employeeCount",
        type: "number" as FieldType,
        description: "Total number of employees at the company",
        children: [],
      },
      {
        id: "2-7",
        name: "headquarters",
        type: "text" as FieldType,
        description: "Location of company headquarters (city, state, country)",
        children: [],
      },
      {
        id: "2-8",
        name: "website",
        type: "text" as FieldType,
        description: "Company's official website URL",
        children: [],
      },
    ],
  },
  {
    id: "3",
    name: "offeringDetails",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Details about the initial public offering terms",
    children: [
      {
        id: "3-1",
        name: "sharesOffered",
        type: "number" as FieldType,
        description: "Total number of shares being offered in the IPO",
        children: [],
      },
      {
        id: "3-2",
        name: "priceRangeMin",
        type: "number" as FieldType,
        description: "Minimum price per share in the proposed offering range",
        children: [],
      },
      {
        id: "3-3",
        name: "priceRangeMax",
        type: "number" as FieldType,
        description: "Maximum price per share in the proposed offering range",
        children: [],
      },
      {
        id: "3-4",
        name: "totalOfferingAmount",
        type: "number" as FieldType,
        description:
          "Total dollar amount expected to be raised in the offering",
        children: [],
      },
      {
        id: "3-5",
        name: "underwriters",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Investment banks underwriting the IPO",
        children: [
          {
            id: "3-5-1",
            name: "leadUnderwriters",
            type: "text" as FieldType,
            description: "Primary investment banks managing the offering",
            children: [],
          },
          {
            id: "3-5-2",
            name: "coManagers",
            type: "text" as FieldType,
            description:
              "Secondary investment banks participating in the offering",
            children: [],
          },
        ],
      },
      {
        id: "3-6",
        name: "lockupPeriodDays",
        type: "number" as FieldType,
        description:
          "Number of days insiders are restricted from selling shares after IPO",
        children: [],
      },
    ],
  },
  {
    id: "4",
    name: "financialHighlights",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Key financial information from the company's financial statements",
    children: [
      {
        id: "4-1",
        name: "annualRevenue",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Annual revenue figures over multiple years",
        children: [
          {
            id: "4-1-1",
            name: "mostRecentYear",
            type: "number" as FieldType,
            description: "Revenue for the most recent fiscal year in USD",
            children: [],
          },
          {
            id: "4-1-2",
            name: "yearBeforeLast",
            type: "number" as FieldType,
            description: "Revenue for the previous fiscal year in USD",
            children: [],
          },
          {
            id: "4-1-3",
            name: "twoYearsBeforeLast",
            type: "number" as FieldType,
            description: "Revenue from two fiscal years ago in USD",
            children: [],
          },
        ],
      },
      {
        id: "4-2",
        name: "netIncome",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Net income (profit/loss) figures over multiple years",
        children: [
          {
            id: "4-2-1",
            name: "mostRecentYear",
            type: "number" as FieldType,
            description: "Net income for the most recent fiscal year in USD",
            children: [],
          },
          {
            id: "4-2-2",
            name: "yearBeforeLast",
            type: "number" as FieldType,
            description: "Net income for the previous fiscal year in USD",
            children: [],
          },
          {
            id: "4-2-3",
            name: "twoYearsBeforeLast",
            type: "number" as FieldType,
            description: "Net income from two fiscal years ago in USD",
            children: [],
          },
        ],
      },
      {
        id: "4-3",
        name: "totalAssets",
        type: "number" as FieldType,
        description: "Total assets from the most recent balance sheet in USD",
        children: [],
      },
      {
        id: "4-4",
        name: "totalLiabilities",
        type: "number" as FieldType,
        description:
          "Total liabilities from the most recent balance sheet in USD",
        children: [],
      },
      {
        id: "4-5",
        name: "cashAndEquivalents",
        type: "number" as FieldType,
        description:
          "Cash and cash equivalents from the most recent balance sheet in USD",
        children: [],
      },
      {
        id: "4-6",
        name: "totalDebt",
        type: "number" as FieldType,
        description: "Total short-term and long-term debt obligations in USD",
        children: [],
      },
    ],
  },
  {
    id: "5",
    name: "keyMetrics",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Important performance and operational metrics for the business",
    children: [
      {
        id: "5-1",
        name: "grossMargin",
        type: "number" as FieldType,
        description: "Gross profit as a percentage of revenue",
        children: [],
      },
      {
        id: "5-2",
        name: "operatingMargin",
        type: "number" as FieldType,
        description: "Operating income as a percentage of revenue",
        children: [],
      },
      {
        id: "5-3",
        name: "revenueGrowthRate",
        type: "number" as FieldType,
        description: "Year-over-year percentage growth in revenue",
        children: [],
      },
      {
        id: "5-4",
        name: "customerAcquisitionCost",
        type: "number" as FieldType,
        description: "Average cost to acquire a new customer in USD",
        children: [],
      },
      {
        id: "5-5",
        name: "lifetimeValue",
        type: "number" as FieldType,
        description:
          "Average revenue generated by a customer over their lifetime in USD",
        children: [],
      },
      {
        id: "5-6",
        name: "activeUsers",
        type: "number" as FieldType,
        description: "Total number of active users or customers",
        children: [],
      },
      {
        id: "5-7",
        name: "monthlyActiveUsers",
        type: "number" as FieldType,
        description: "Number of users who were active in the past month",
        children: [],
      },
      {
        id: "5-8",
        name: "annualRecurringRevenue",
        type: "number" as FieldType,
        description:
          "Predictable and recurring revenue generated annually in USD",
        children: [],
      },
    ],
  },
  {
    id: "6",
    name: "riskFactors",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Significant risks that could affect the company's business and financial performance",
    children: [
      {
        id: "6-1",
        name: "competitiveRisks",
        type: "text" as FieldType,
        description:
          "Risks related to competition, market position, and industry dynamics",
        children: [],
      },
      {
        id: "6-2",
        name: "regulatoryRisks",
        type: "text" as FieldType,
        description:
          "Risks related to current or future regulations and compliance requirements",
        children: [],
      },
      {
        id: "6-3",
        name: "technologyRisks",
        type: "text" as FieldType,
        description:
          "Risks related to technology changes, obsolescence, or cybersecurity",
        children: [],
      },
      {
        id: "6-4",
        name: "financialRisks",
        type: "text" as FieldType,
        description:
          "Risks related to financial stability, liquidity, or capital structure",
        children: [],
      },
      {
        id: "6-5",
        name: "operationalRisks",
        type: "text" as FieldType,
        description:
          "Risks related to business operations, supply chain, or infrastructure",
        children: [],
      },
    ],
  },
  {
    id: "7",
    name: "useOfProceeds",
    type: "group" as FieldType,
    isExpanded: true,
    description: "How the company plans to use the funds raised from the IPO",
    children: [
      {
        id: "7-1",
        name: "researchAndDevelopment",
        type: "number" as FieldType,
        description: "Amount allocated for R&D activities in USD",
        children: [],
      },
      {
        id: "7-2",
        name: "salesAndMarketing",
        type: "number" as FieldType,
        description:
          "Amount allocated for sales and marketing initiatives in USD",
        children: [],
      },
      {
        id: "7-3",
        name: "generalCorporatePurposes",
        type: "number" as FieldType,
        description: "Amount allocated for general business operations in USD",
        children: [],
      },
      {
        id: "7-4",
        name: "debtRepayment",
        type: "number" as FieldType,
        description: "Amount allocated to repay existing debt in USD",
        children: [],
      },
      {
        id: "7-5",
        name: "acquisitions",
        type: "number" as FieldType,
        description:
          "Amount allocated for potential business acquisitions in USD",
        children: [],
      },
    ],
  },
  {
    id: "8",
    name: "capitalStructure",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Details about the company's equity structure before and after the IPO",
    children: [
      {
        id: "8-1",
        name: "sharesOutstandingPreOffering",
        type: "number" as FieldType,
        description: "Total number of shares outstanding before the IPO",
        children: [],
      },
      {
        id: "8-2",
        name: "sharesOutstandingPostOffering",
        type: "number" as FieldType,
        description:
          "Expected total number of shares outstanding after the IPO",
        children: [],
      },
      {
        id: "8-3",
        name: "sharesOfferedByCompany",
        type: "number" as FieldType,
        description:
          "Number of newly issued shares being offered by the company",
        children: [],
      },
      {
        id: "8-4",
        name: "sharesOfferedBySellingStockholders",
        type: "number" as FieldType,
        description:
          "Number of existing shares being sold by current stockholders",
        children: [],
      },
      {
        id: "8-5",
        name: "overallotmentOption",
        type: "number" as FieldType,
        description:
          "Additional shares available to underwriters in case of high demand (greenshoe)",
        children: [],
      },
    ],
  },
  {
    id: "9",
    name: "managementTeam",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Information about key executives and leadership team",
    children: [
      {
        id: "9-1",
        name: "ceo",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Chief Executive Officer information",
        children: [
          {
            id: "9-1-1",
            name: "name",
            type: "text" as FieldType,
            description: "Full name of the CEO",
            children: [],
          },
          {
            id: "9-1-2",
            name: "age",
            type: "number" as FieldType,
            description: "Age of the CEO in years",
            children: [],
          },
          {
            id: "9-1-3",
            name: "compensationLastYear",
            type: "number" as FieldType,
            description:
              "Total compensation for the CEO in the last fiscal year in USD",
            children: [],
          },
        ],
      },
      {
        id: "9-2",
        name: "cfo",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Chief Financial Officer information",
        children: [
          {
            id: "9-2-1",
            name: "name",
            type: "text" as FieldType,
            description: "Full name of the CFO",
            children: [],
          },
          {
            id: "9-2-2",
            name: "age",
            type: "number" as FieldType,
            description: "Age of the CFO in years",
            children: [],
          },
          {
            id: "9-2-3",
            name: "compensationLastYear",
            type: "number" as FieldType,
            description:
              "Total compensation for the CFO in the last fiscal year in USD",
            children: [],
          },
        ],
      },
      {
        id: "9-3",
        name: "cto",
        type: "group" as FieldType,
        isExpanded: true,
        description: "Chief Technology Officer information",
        children: [
          {
            id: "9-3-1",
            name: "name",
            type: "text" as FieldType,
            description: "Full name of the CTO",
            children: [],
          },
          {
            id: "9-3-2",
            name: "age",
            type: "number" as FieldType,
            description: "Age of the CTO in years",
            children: [],
          },
          {
            id: "9-3-3",
            name: "compensationLastYear",
            type: "number" as FieldType,
            description:
              "Total compensation for the CTO in the last fiscal year in USD",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "10",
    name: "businessDescription",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Comprehensive overview of the company's business and operations",
    children: [
      {
        id: "10-1",
        name: "businessOverview",
        type: "text" as FieldType,
        description:
          "High-level summary of what the company does and its mission",
        children: [],
      },
      {
        id: "10-2",
        name: "productsAndServices",
        type: "text" as FieldType,
        description:
          "Description of the company's main products, services, or solutions",
        children: [],
      },
      {
        id: "10-3",
        name: "businessModel",
        type: "text" as FieldType,
        description:
          "How the company generates revenue and operates its business",
        children: [],
      },
      {
        id: "10-4",
        name: "growthStrategy",
        type: "text" as FieldType,
        description: "The company's plans for future expansion and growth",
        children: [],
      },
      {
        id: "10-5",
        name: "competitiveAdvantages",
        type: "text" as FieldType,
        description: "Unique strengths and advantages compared to competitors",
        children: [],
      },
    ],
  },
  {
    id: "11",
    name: "marketOpportunity",
    type: "group" as FieldType,
    isExpanded: true,
    description: "Information about the market size and growth potential",
    children: [
      {
        id: "11-1",
        name: "targetMarketSize",
        type: "number" as FieldType,
        description: "Estimated total addressable market size in USD",
        children: [],
      },
      {
        id: "11-2",
        name: "marketGrowthRate",
        type: "number" as FieldType,
        description:
          "Projected annual growth rate of the target market as a percentage",
        children: [],
      },
      {
        id: "11-3",
        name: "marketTrends",
        type: "text" as FieldType,
        description:
          "Key trends and developments affecting the industry or market",
        children: [],
      },
    ],
  },
  {
    id: "12",
    name: "intellectualProperty",
    type: "group" as FieldType,
    isExpanded: true,
    description:
      "Information about the company's patents, trademarks, and other IP assets",
    children: [
      {
        id: "12-1",
        name: "patentCount",
        type: "number" as FieldType,
        description: "Total number of patents owned or pending by the company",
        children: [],
      },
      {
        id: "12-2",
        name: "trademarkCount",
        type: "number" as FieldType,
        description:
          "Total number of registered trademarks owned by the company",
        children: [],
      },
      {
        id: "12-3",
        name: "keyPatents",
        type: "text" as FieldType,
        description:
          "Description of significant or core patents that provide competitive advantage",
        children: [],
      },
    ],
  },
];
