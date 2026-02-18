// Enhanced CSV parsing function for project creation
import i18n from "../i18n.ts";
export const parseCsv = (
  csvContent: string,
  t: (key: string, options?: Record<string, string>) => string,
): { headers: string[]; rows: Array<Record<string, string>> } => {
  // Split CSV content into rows (support both Windows and Unix line endings)
  const rows = csvContent.split(/\r?\n/).map((row) => row.trim());

  // Extract headers (column names) from the first row
  const headers = rows[0]?.split(",").map((header) => header.trim()) || [];

  // Check if there are headers
  // Ihrow an error because that's if there are missing or empty headers.
  if (headers.length === 0 || headers.some((header) => header === "")) {
    throw new Error(t("utils.csv.missing_or_empty_headers_error"));
  }

  // Extract rows and map them into objects
  const parsedRows = rows
    .slice(1)
    .reduce((acc: Array<Record<string, string>>, row) => {
      // Split row values
      const values = row.split(",");

      // Ensure row matches the header structure (fill missing values with empty strings)
      const rowObject = headers.reduce(
        (rowAcc, header, idx) => {
          rowAcc[header] = values[idx]?.trim() || ""; // Trim values for cleanliness
          return rowAcc;
        },
        {} as Record<string, string>,
      );

      // Add row object to the accumulator
      acc.push(rowObject);
      return acc;
    }, []);

  // Return headers and parsed rows separately
  return {
    headers,
    rows: parsedRows,
  };
};
// Validate CSV files or csv files exported from excel
export const validateCsv = (file: File): boolean => {
  const validMimeTypes = ["text/csv", "application/vnd.ms-excel"];
  return validMimeTypes.includes(file.type);
};
// Convert to csv
export const convertToCsv = (
  data: { url: string; title: string; publishedDate: string; text: string }[],
) => {
  // 1. Validate input data
  if (!Array.isArray(data)) {
    // Use a specific, translatable error key
    throw new Error(i18n.t("utils.csv.invalid_data_not_array_error"));
  }

  // Handle empty data array gracefully by returning just the headers
  if (data.length === 0) {
    return "url,title,publishedDate,text";
  }

  try {
    const headers = ["url", "title", "publishedDate", "text"];
    const rows = data.map((item) => {
      // 2. Ensure item is a valid object before processing
      if (typeof item !== "object" || item === null) {
        // Skip invalid entries or throw a more specific error
        console.warn("Skipping invalid item in CSV conversion:", item);
        return ""; // Return an empty row that can be filtered out
      }
      return [item.url, item.title, item.publishedDate, item.text]
        .map((value) => `"${(value || "").replace(/"/g, '""')}"`)
        .join(",");
    });

    // Filter out any empty rows that resulted from invalid items
    const filteredRows = rows.filter((row) => row !== "");

    return [headers.join(","), ...filteredRows].join("\n");
  } catch (error) {
    {
      // 3. Catch any unexpected errors during the mapping process
      console.error("Failed to convert data to CSV:", error);
      // Throw a generic, translatable error to the user
      throw new Error(i18n.t("utils.csv.conversion_failed_error"));
    }
  }
};
