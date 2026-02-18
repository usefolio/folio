import { describe, expect, it } from "vitest";
import { sanitizeProjectName, suggestProjectName } from "./projectNameUtils";

describe("sanitizeProjectName", () => {
  it("removes slashes", () => {
    expect(sanitizeProjectName("Hello/World")).toBe("HelloWorld");
  });

  it("replaces spaces with underscores when requested", () => {
    expect(sanitizeProjectName("Hello World", true)).toBe("Hello_World");
  });

  it("suggestProjectName echoes the query for now", async () => {
    await expect(
      suggestProjectName("Hello World", "news", "search"),
    ).resolves.toBe("Hello World");
  });

  it("suggestProjectName falls back when query is empty", async () => {
    await expect(
      suggestProjectName("", "news", "search"),
    ).resolves.toBe("exa_results");
  });
});
