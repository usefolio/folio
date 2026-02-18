export const DISALLOWED_PROJECT_NAME_CHARS = /\//g;

export const sanitizeProjectName = (
  name: string,
  replaceSpacesWithUnderscores = false,
): string => {
  let sanitized = name.trim().replace(DISALLOWED_PROJECT_NAME_CHARS, "");
  sanitized = replaceSpacesWithUnderscores
    ? sanitized.replace(/\s+/g, "_")
    : sanitized;
  return sanitized;
};

/**
 * Stub that will eventually call an AI service to suggest a concise project
 * name based on the query, search type, and action type. For now it simply
 * echoes the query so callers can continue sanitizing the result.
 */
export const suggestProjectName = async (
  query: string,
  _searchType: string,
  _actionType: "search" | "findSimilar",
): Promise<string> => {
  // TODO: Replace with AI-enabled summarization API call.
  return query || "exa_results";
};
