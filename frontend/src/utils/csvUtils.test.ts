import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCsv, validateCsv, convertToCsv } from "../utils/CsvUtils";
import i18n from "../i18n";

vi.mock("../i18n.ts", () => ({
  default: {
    t: vi.fn((key) => key), // The mock returns the key itself
  },
}));

const tMock = vi.fn((key) => key);

describe("CSV Utility Functions", () => {
  describe("parseCsv utility function", () => {
    it("Should parse a valid CSV file with headers and rows", () => {
      // Sample CSV input
      const csvContent = `name,age,city
                          John,30,New York
                          Jane,25,San Francisco`;

      const result = parseCsv(csvContent, tMock);

      // Headers and rows should match the input
      expect(result).toEqual({
        headers: ["name", "age", "city"],
        rows: [
          { name: "John", age: "30", city: "New York" },
          { name: "Jane", age: "25", city: "San Francisco" },
        ],
      });
    });

    it("Should be able to parse a CSV with extra spaces and empty values", () => {
      // CSV with wierd spaces and a missing value
      const csvContent = `name , age , city 
                          John, 30 , New York 
                          Jane, , San Francisco`;

      const result = parseCsv(csvContent, tMock);

      // Spaces should be trimmed, empty values should be handled properly
      expect(result).toEqual({
        headers: ["name", "age", "city"],
        rows: [
          { name: "John", age: "30", city: "New York" },
          { name: "Jane", age: "", city: "San Francisco" },
        ],
      });
    });

    it("Should return an error if the headers are missing", () => {
      // CSV with empty headers
      const csvContent = `,,,,
                          John,30,New York`;

      // Error should be thrown due to missing headers
      expect(() => parseCsv(csvContent, tMock)).toThrowError(
        "utils.csv.missing_or_empty_headers_error",
      );
    });

    it("Should return an empty rows array for a CSV with headers only", () => {
      // CSV with only headers, no rows
      const csvContent = "name,age,city";

      const result = parseCsv(csvContent, tMock);

      // Headers should be parsed, but there should be no rows
      expect(result).toEqual({
        headers: ["name", "age", "city"],
        rows: [],
      });
    });

    it("should handle CSV with different row lengths", () => {
      // CSV where one row has fewer values than the headers
      const csvContent = `name,age,city
                          John,30
                          Jane,25,San Francisco`;

      const result = parseCsv(csvContent, tMock);

      // Missing values should be replaced with empty strings
      expect(result).toEqual({
        headers: ["name", "age", "city"],
        rows: [
          { name: "John", age: "30", city: "" },
          { name: "Jane", age: "25", city: "San Francisco" },
        ],
      });
    });

    it("should handle different line endings (Windows and Unix)", () => {
      // CSV with Windows-style line endings (\r\n)
      const csvContent = `name,age,city\r\nJohn,30,New York\r\nJane,25,San Francisco`;

      const result = parseCsv(csvContent, tMock);

      // Line endings shouldn't affect parsing
      expect(result).toEqual({
        headers: ["name", "age", "city"],
        rows: [
          { name: "John", age: "30", city: "New York" },
          { name: "Jane", age: "25", city: "San Francisco" },
        ],
      });
    });
  });

  describe("validateCsv utility function", () => {
    it("should return true for valid CSV file types", () => {
      // Creating mock CSV and Excel files
      const validCsvFile = new File(["name,age,city"], "test.csv", {
        type: "text/csv",
      });

      const validExcelFile = new File(["name,age,city"], "test.xls", {
        type: "application/vnd.ms-excel",
      });

      // Both file types should be valid
      expect(validateCsv(validCsvFile)).toBe(true);
      expect(validateCsv(validExcelFile)).toBe(true);
    });

    it("should return false for invalid file types", () => {
      // Unsupported file
      const invalidFile = new File(["name,age,city"], "test.txt", {
        type: "text/plain",
      });

      // File is marked as invalid
      expect(validateCsv(invalidFile)).toBe(false);
    });

    it("should return false for empty file type", () => {
      // File with no specific type
      const emptyFile = new File(["name,age,city"], "test.csv", { type: "" });

      // File should invalid
      expect(validateCsv(emptyFile)).toBe(false);
    });
  });
});

describe("convertToCsv utility function", () => {
  // Declare the spy variable here, but define it in the hook
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Create a fresh spy before each test runs
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console.warn after each test
    vi.restoreAllMocks();
  });

  it("should convert an array of objects to a valid CSV string", () => {
    const data = [
      {
        url: "http://example.com",
        title: "Example",
        publishedDate: "2023-01-01",
        text: "Some text content.",
      },
      {
        url: "http://test.com",
        title: "Test",
        publishedDate: "2023-01-02",
        text: "More text content.",
      },
    ];

    const expectedCsv = `url,title,publishedDate,text
"http://example.com","Example","2023-01-01","Some text content."
"http://test.com","Test","2023-01-02","More text content."`;

    expect(convertToCsv(data)).toBe(expectedCsv);
  });

  it("should correctly escape double quotes within values", () => {
    const data = [
      {
        url: "http://quotes.com",
        title: 'A "Quoted" Title',
        publishedDate: "2023-01-03",
        text: 'Text with "multiple" quotes.',
      },
    ];

    const expectedCsv = `url,title,publishedDate,text
"http://quotes.com","A ""Quoted"" Title","2023-01-03","Text with ""multiple"" quotes."`;

    expect(convertToCsv(data)).toBe(expectedCsv);
  });

  it("should handle null or undefined values as empty strings", () => {
    const data = [
      {
        url: "http://empty.com",
        title: null, // null value
        publishedDate: undefined, // undefined value
        text: "Some text.",
      },
    ];

    const expectedCsv = `url,title,publishedDate,text
"http://empty.com","","","Some text."`;

    expect(convertToCsv(data as any)).toBe(expectedCsv);
  });

  it("should return only the headers for an empty data array", () => {
    expect(convertToCsv([])).toBe("url,title,publishedDate,text");
  });

  it("should throw an error if the input data is not an array", () => {
    const invalidData = { message: "I am not an array" };

    // @ts-expect-error - Intentionally passing invalid type for testing
    expect(() => convertToCsv(invalidData)).toThrow(
      "utils.csv.invalid_data_not_array_error",
    );

    expect(i18n.t).toHaveBeenCalledWith(
      "utils.csv.invalid_data_not_array_error",
    );
  });

  it("should skip invalid items (null, non-objects) in the data array and log a warning", () => {
    const dataWithInvalidItems = [
      {
        url: "http://valid1.com",
        title: "Valid 1",
        publishedDate: "2023-01-01",
        text: "First valid item.",
      },
      null, // Invalid item
      {
        url: "http://valid2.com",
        title: "Valid 2",
        publishedDate: "2023-01-02",
        text: "Second valid item.",
      },
      "i-am-a-string", // Invalid item
    ];

    const expectedCsv = `url,title,publishedDate,text
"http://valid1.com","Valid 1","2023-01-01","First valid item."
"http://valid2.com","Valid 2","2023-01-02","Second valid item."`;

    const result = convertToCsv(dataWithInvalidItems as any);

    expect(result).toBe(expectedCsv);
    // This will now correctly check the fresh spy for this test
    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Skipping invalid item in CSV conversion:",
      null,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Skipping invalid item in CSV conversion:",
      "i-am-a-string",
    );
  });
});
