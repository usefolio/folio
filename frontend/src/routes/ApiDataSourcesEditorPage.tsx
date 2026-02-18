import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Play,
  CheckCircle,
  Loader2,
  Save,
  Plus,
  ChevronDown,
  ChevronRight,
  Info,
  Bot,
} from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useParams, useNavigate } from "react-router";
import { useDataContext } from "@/context/DataContext";
import {
  APIDataSource,
  TestResult,
  APIParameter,
} from "@/types/apiDataSources";
import { USE_REAL_TEST_FOR_API_SOURCE } from "@/constants";
import { useTranslation } from "react-i18next";

const DEFAULT_TRANSFORM = `// response: raw JSON from the API
// return an array of plain JavaScript objects2
export default function transform(response) {
  return response.hits.map(hit => ({
    id:       hit.objectID,
    title:    hit.title ?? hit.story_text ?? hit.comment_text,
    author:   hit.author,
    url:      hit.url,
    points:   hit.points,
    created:  hit.created_at
  }));
}`;

const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const ApiDataSourcesEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { sourceId } = useParams<{ sourceId: Id<"api_data_sources"> }>();
  const { t } = useTranslation();
  const isCreating = !sourceId;
  const { workspace } = useDataContext();

  const existingSource = useQuery(
    api.api_data_sources.getById,
    sourceId ? { id: sourceId } : "skip",
  );
  const createSource = useMutation(api.api_data_sources.create);
  const updateSource = useMutation(api.api_data_sources.update);
  const runTest = useAction(api.api_data_sources.runTest);

  const [currentSource, setCurrentSource] = useState<APIDataSource | null>(
    null,
  );
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });
  const [bodyJsonErrors, setBodyJsonErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [testQuery, setTestQuery] = useState<string>("");
  const [exampleResponse, setExampleResponse] =
    useState<string>(`{\n  "hits": []\n}`);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [transformCodeExpanded, setTransformCodeExpanded] = useState(false);
  const generateExample = useAction(
    api.api_data_sources.generateExampleResponse,
  );
  const bodyJsonTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isCreating) {
      // Initialize a new, blank source object
      setCurrentSource({
        id: `api-${Date.now()}`,
        workspace_id: workspace?._id as Id<"workspace">,
        name: "",
        url: "",
        urlParameters: [{ id: "param-1", key: "", value: "" }],
        headers: [],
        bodyJson: "",
        searchType: "regular",
        rateLimit: { requests: 1000, period: "hour" },
        transformCode: DEFAULT_TRANSFORM,
        transformColumns: "id, title, author, url, points, created",
        isValid: false,
        status: "testing",
        createdAt: new Date(),
      });
      // Reset the example response to default for a new source
      setExampleResponse(`{\n  "hits": []\n}`);
    } else if (existingSource) {
      // Load the fetched source into state
      const editableSource: APIDataSource = {
        ...existingSource,
        id: existingSource._id,
        isValid: false,
        createdAt: new Date(existingSource._creationTime),
        lastTested: existingSource.lastTested
          ? new Date(existingSource.lastTested)
          : undefined,
      };
      setCurrentSource(editableSource);
      // Load the saved example response, or fall back to default
      setExampleResponse(
        existingSource.exampleResponse || `{\n  "hits": []\n}`,
      );
    }
  }, [sourceId, existingSource, isCreating, workspace?._id]);

  useEffect(() => {
    if (currentSource?.bodyJson) {
      if (bodyJsonTimeoutRef.current) clearTimeout(bodyJsonTimeoutRef.current);
      bodyJsonTimeoutRef.current = setTimeout(() => {
        try {
          if (currentSource.bodyJson.trim()) JSON.parse(currentSource.bodyJson);
          setBodyJsonErrors([]);
        } catch (error) {
          setBodyJsonErrors([
            error instanceof Error ? error.message : "Invalid JSON",
          ]);
        }
      }, 600);
    } else {
      setBodyJsonErrors([]);
    }
  }, [currentSource?.bodyJson]);

  const updateCurrentSource = (update: Partial<APIDataSource>) => {
    setCurrentSource((prev) => (prev ? { ...prev, ...update } : null));
  };

  const handleAddHeader = () => {
    if (!currentSource) return;
    const newHeader: APIParameter = {
      id: `header-${Date.now()}`,
      key: "",
      value: "",
    };
    updateCurrentSource({ headers: [...currentSource.headers, newHeader] });
  };

  const handleAddUrlParameter = () => {
    if (!currentSource) return;
    const newParam: APIParameter = {
      id: `param-${Date.now()}`,
      key: "",
      value: "",
    };
    updateCurrentSource({
      urlParameters: [...currentSource.urlParameters, newParam],
    });
  };

  const handleDeleteHeader = (id: string) => {
    if (!currentSource) return;
    updateCurrentSource({
      headers: currentSource.headers.filter((h: APIParameter) => h.id !== id),
    });
  };

  const handleDeleteUrlParameter = (id: string) => {
    if (!currentSource) return;
    updateCurrentSource({
      urlParameters: currentSource.urlParameters.filter(
        (p: APIParameter) => p.id !== id,
      ),
    });
  };

  const handleHeaderChange = (
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    if (!currentSource) return;
    const newHeaders = currentSource.headers.map((header: APIParameter) =>
      header.id === id ? { ...header, [field]: value } : header,
    );
    updateCurrentSource({ headers: newHeaders });
  };

  const handleUrlParameterChange = (
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    if (!currentSource) return;
    const newParams = currentSource.urlParameters.map((param: APIParameter) =>
      param.id === id ? { ...param, [field]: value } : param,
    );
    updateCurrentSource({ urlParameters: newParams });
  };

  const canRunTest = () => {
    if (!currentSource) return false;
    if (bodyJsonErrors.length > 0) return false;
    if (!currentSource.name.trim()) return false;
    if (!currentSource.url.trim() || !validateUrl(currentSource.url))
      return false;
    return true;
  };

  const handleRunTest = async () => {
    if (!currentSource || !canRunTest()) return;
    setTestResult({ status: "loading" });

    try {
      const configForAction = {
        ...currentSource,
        createdAt: currentSource.createdAt.getTime(),
        lastTested: currentSource.lastTested?.getTime(),
      };

      const result = await runTest({ config: configForAction, testQuery });

      if (result.status === "error") {
        setTestResult(result);
        return;
      }

      if (USE_REAL_TEST_FOR_API_SOURCE) {
        // --- REAL TRANSFORM LOGIC ---
        // This runs the user's custom transform function
        let transformedData;
        const validationErrors: string[] = [];
        try {
          const functionBody = currentSource.transformCode.replace(
            "export default function transform(response)",
            "",
          );
          const transformFn = new Function("response", functionBody);
          transformedData = transformFn(result.rawData);

          // 4. Validate the output of the transform function
          if (!Array.isArray(transformedData)) {
            validationErrors.push("Transform function must return an array.");
          } else if (transformedData.length > 0) {
            const firstKeys = new Set(Object.keys(transformedData[0]));
            transformedData.forEach((item, index) => {
              if (typeof item !== "object" || item === null) {
                validationErrors.push(`Row ${index + 1} is not an object.`);
                return;
              }
              const itemKeys = new Set(Object.keys(item));
              if (
                itemKeys.size !== firstKeys.size ||
                ![...itemKeys].every((key) => firstKeys.has(key))
              ) {
                validationErrors.push(
                  `Row ${index + 1} has keys inconsistent with the first row.`,
                );
              }
            });
          }
        } catch (transformError) {
          setTestResult({
            ...result,
            status: "error",
            error: `Transform function failed: ${(transformError as Error).message}`,
          });
          return;
        }

        // 5. Set the final result for the UI
        setTestResult({
          ...result,
          data: transformedData,
          validationErrors,
        });

        if (validationErrors.length === 0) {
          updateCurrentSource({ isValid: true, lastTested: new Date() });
        }
      } else {
        setTestResult({
          ...result,
          data: [],
          validationErrors: [],
          status: "loading",
        });
        // --- DUMMY LOGIC ---
        // This block disregards the transform function and uses the mock data directly.
        // It assumes the dummy data from Convex is already in the final, tabular shape.

        // The `rawData` from the "smart" mock is an object like `{ hits: [...] }` or `{ items: [...] }`.
        // We just need to grab the array from inside it.
        const mockDataArray = result.rawData.hits || result.rawData.items || [];
        setTimeout(() => {
          setTestResult({
            ...result,
            data: mockDataArray, // Use the mock data array directly
            validationErrors: [],
          });
          updateCurrentSource({ isValid: true, lastTested: new Date() });
        }, 5000);

        // Mark as valid for testing purposes
      }
    } catch (e) {
      setTestResult({ status: "error", error: (e as Error).message });
    }
  };

  const handleCancel = () => {
    navigate("/api-data-sources");
  };

  const handleSave = async () => {
    if (
      !currentSource?.isValid ||
      !currentSource.name.trim() ||
      !workspace?._id
    )
      return;
    setIsSaving(true);
    try {
      const { id, createdAt, lastTested, ...sourceForDb } = {
        ...currentSource,
        status: "active" as const,
        lastTested: currentSource.lastTested?.getTime(),
        exampleResponse: exampleResponse,
      };

      if (typeof id === "string" && id.startsWith("api-")) {
        await createSource({
          workspaceId: workspace?._id,
          source: sourceForDb,
        });
      } else {
        await updateSource({
          id: id as Id<"api_data_sources">,
          source: sourceForDb,
        });
      }
      navigate("/api-data-sources");
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentSource) {
    return (
      <div className="p-6">
        <Loader2 className="animate-spin" />{" "}
        {t("api_data_sources_editor_page.loading")}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-background border border-border w-full max-w-4xl mx-auto flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold">
            {isCreating
              ? t("api_data_sources_editor_page.title_new")
              : t("api_data_sources_editor_page.title_edit")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("api_data_sources_editor_page.subtitle")}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("api_data_sources_editor_page.labels.name")}
              </label>
              <Input
                placeholder="e.g., Hacker News Trending Stories"
                value={currentSource.name}
                onChange={(e) => updateCurrentSource({ name: e.target.value })}
                className="h-8 border border-border rounded-md"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">
                  {t("api_data_sources_editor_page.labels.search_type")}
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div className="space-y-1 p-1 text-xs">
                        <p>
                          <span className="font-medium">
                            {t(
                              "api_data_sources_editor_page.tooltips.regular_search",
                            )}
                          </span>{" "}
                          {t(
                            "api_data_sources_editor_page.tooltips.regular_search_desc",
                          )}
                        </p>
                        <p>
                          <span className="font-medium">
                            {t(
                              "api_data_sources_editor_page.tooltips.ai_search",
                            )}
                          </span>{" "}
                          {t(
                            "api_data_sources_editor_page.tooltips.ai_search_desc",
                          )}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <RadioGroup
                value={currentSource.searchType}
                onValueChange={(value) =>
                  updateCurrentSource({
                    searchType: value as "regular" | "ai",
                  })
                }
                className="flex gap-4 h-8 items-center"
              >
                <div className="flex items-center space-x-2 space-y-2">
                  <RadioGroupItem
                    className="mt-2"
                    value="regular"
                    id="search-type-regular"
                  />
                  <Label
                    htmlFor="search-type-regular"
                    className="cursor-pointer font-normal"
                  >
                    {t("api_data_sources_editor_page.regular")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-y-2">
                  <RadioGroupItem
                    className="mt-2"
                    value="ai"
                    id="search-type-ai"
                  />
                  <Label
                    htmlFor="search-type-ai"
                    className="cursor-pointer font-normal"
                  >
                    {t("api_data_sources_editor_page.ai")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="border border-border p-3">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <span className="bg-muted-foreground text-white w-5 h-5 flex items-center justify-center text-xs">
                1
              </span>
              {t("api_data_sources_editor_page.endpoint_configuration")}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="text-sm font-normal mb-1 block">
                  {t("api_data_sources_editor_page.labels.api_url")}
                </label>
                <Input
                  placeholder={t(
                    "api_data_sources_editor_page.placeholders.api_url",
                  )}
                  value={currentSource.url}
                  onChange={(e) => updateCurrentSource({ url: e.target.value })}
                  className={`h-8 border-border rounded-md ${currentSource.url && !validateUrl(currentSource.url) ? "border-destructive" : ""}`}
                />
              </div>
              <div>
                <label className="text-sm font-normal mb-1 block">
                  {t("api_data_sources_editor_page.labels.rate_limit")}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={t(
                      "api_data_sources_editor_page.placeholders.rate_limit",
                    )}
                    value={currentSource.rateLimit.requests}
                    onChange={(e) =>
                      updateCurrentSource({
                        rateLimit: {
                          ...currentSource.rateLimit,
                          requests: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 border border-border rounded-md w-24"
                  />
                  <Select
                    value={currentSource.rateLimit.period}
                    onValueChange={(value: "minute" | "hour" | "day") =>
                      updateCurrentSource({
                        rateLimit: {
                          ...currentSource.rateLimit,
                          period: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="w-28 h-8 border border-border rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-md">
                      <SelectItem className="rounded-md" value="minute">
                        {t("api_data_sources_editor_page.misc.per_min")}
                      </SelectItem>
                      <SelectItem className="rounded-md" value="hour">
                        {t("api_data_sources_editor_page.misc.per_hour")}
                      </SelectItem>
                      <SelectItem className="rounded-md" value="day">
                        {t("api_data_sources_editor_page.misc.per_day")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 p-3">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <span className="bg-muted-foreground text-white w-5 h-5 flex items-center justify-center text-xs">
                2
              </span>
              {t("api_data_sources_editor_page.misc.parameters")}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-normal">
                  {t("api_data_sources_editor_page.labels.url_parameters")}
                </h4>
                {currentSource.urlParameters.map((param: APIParameter) => (
                  <div key={param.id} className="flex items-center gap-2">
                    <Input
                      placeholder={t(
                        "api_data_sources_editor_page.placeholders.param_name",
                      )}
                      value={param.key}
                      onChange={(e) =>
                        handleUrlParameterChange(
                          param.id,
                          "key",
                          e.target.value,
                        )
                      }
                      className="flex-1 h-8 border border-border rounded-md"
                    />
                    <Input
                      placeholder={t(
                        "api_data_sources_editor_page.placeholders.param_value",
                      )}
                      value={param.value}
                      onChange={(e) =>
                        handleUrlParameterChange(
                          param.id,
                          "value",
                          e.target.value,
                        )
                      }
                      className="flex-1 h-8 border border-border rounded-md"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteUrlParameter(param.id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive rounded-md"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddUrlParameter}
                  className="h-8 px-3 border-border border rounded-md bg-transparent font-normal"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t("api_data_sources_editor_page.buttons.add_url_param")}
                </Button>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-normal">
                  {t("api_data_sources_editor_page.labels.headers")}
                </h4>
                {currentSource.headers.map((header: APIParameter) => (
                  <div key={header.id} className="flex items-center gap-2">
                    <Input
                      placeholder={t(
                        "api_data_sources_editor_page.placeholders.header_name",
                      )}
                      value={header.key}
                      onChange={(e) =>
                        handleHeaderChange(header.id, "key", e.target.value)
                      }
                      className="flex-1 h-8 border border-border rounded-md"
                    />
                    <Input
                      placeholder={t(
                        "api_data_sources_editor_page.placeholders.header_value",
                      )}
                      value={header.value}
                      onChange={(e) =>
                        handleHeaderChange(header.id, "value", e.target.value)
                      }
                      className="flex-1 h-8 border border-border rounded-md"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteHeader(header.id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive rounded-md"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddHeader}
                  className="h-8 px-3 border border-border rounded-md bg-transparent font-normal"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t("api_data_sources_editor_page.buttons.add_header")}
                </Button>
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <h4 className="text-sm font-normal">
                {t("api_data_sources_editor_page.labels.request_body")}
              </h4>
              <Textarea
                placeholder={t(
                  "api_data_sources_editor_page.placeholders.body",
                )}
                value={currentSource.bodyJson}
                onChange={(e) =>
                  updateCurrentSource({ bodyJson: e.target.value })
                }
                className={`font-mono text-xs h-32 border border-border rounded-md resize-none ${bodyJsonErrors.length > 0 ? "border-destructive" : ""}`}
              />
              {bodyJsonErrors.length > 0 && (
                <div className="bg-red-50 border-destructive p-2 text-xs text-destructive">
                  {bodyJsonErrors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border border-border p-3">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <span className="bg-muted-foreground text-white w-5 h-5 flex items-center justify-center text-xs">
                3
              </span>
              {t("api_data_sources_editor_page.transform")}
            </h3>
            <div className="space-y-2">
              <label className="text-sm font-normal">
                {t("api_data_sources_editor_page.labels.output_columns")}
              </label>
              <Input
                placeholder={t(
                  "api_data_sources_editor_page.placeholders.columns",
                )}
                value={currentSource.transformColumns || ""}
                onChange={(e) =>
                  updateCurrentSource({ transformColumns: e.target.value })
                }
                className="h-8 border-border border rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                {t("api_data_sources_editor_page.misc.columns_helper")}
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-normal">
                    {t("api_data_sources_editor_page.labels.example_response")}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (
                        !currentSource?.url ||
                        !currentSource.transformColumns
                      ) {
                        console.error(
                          "URL and Columns must be defined to generate an example.",
                        );
                        return;
                      }
                      setIsGeneratingExample(true);
                      try {
                        // Pass the full context to the action
                        const result = await generateExample({
                          name: currentSource.name,
                          url: currentSource.url,
                          columns: currentSource.transformColumns,
                          urlParameters: currentSource.urlParameters,
                          headers: currentSource.headers,
                          bodyJson: currentSource.bodyJson,
                        });
                        setExampleResponse(result.exampleResponse);
                      } catch (error) {
                        console.error("Failed to generate AI response:", error);
                        setExampleResponse(
                          `{ "error": "Failed to generate example response." }`,
                        );
                      } finally {
                        setIsGeneratingExample(false);
                      }
                    }}
                    disabled={
                      isGeneratingExample ||
                      !currentSource?.url ||
                      !currentSource?.transformColumns
                    }
                    className="h-8 px-2 border border-border rounded-md bg-transparent"
                  >
                    {isGeneratingExample ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        {t(
                          "api_data_sources_editor_page.buttons.generating_ai",
                        )}
                      </>
                    ) : (
                      <>
                        <Bot className="h-4 w-4" />{" "}
                        {t("api_data_sources_editor_page.buttons.generate_ai")}
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={exampleResponse}
                  onChange={(e) => setExampleResponse(e.target.value)}
                  className="font-mono text-xs h-64 border-border border rounded-md resize-none scrollbar-thin"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-normal">
                    {t(
                      "api_data_sources_editor_page.labels.transform_function",
                    )}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setTransformCodeExpanded(!transformCodeExpanded)
                    }
                    className="h-8 px-2 text-muted-foreground hover:text-foreground rounded-md"
                  >
                    {transformCodeExpanded ? (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        {t("api_data_sources_editor_page.buttons.collapse")}
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-1" />
                        {t("api_data_sources_editor_page.buttons.expand")}
                      </>
                    )}
                  </Button>
                </div>
                {transformCodeExpanded ? (
                  <Textarea
                    value={currentSource.transformCode}
                    onChange={(e) =>
                      updateCurrentSource({ transformCode: e.target.value })
                    }
                    className="font-mono text-xs h-64 border border-border rounded-md resize-none"
                  />
                ) : (
                  <div className="text-xs bg-blue-50 border border-blue-200 text-blue-600 p-2 rounded-md">
                    {t("api_data_sources_editor_page.misc.transform_generated")}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-border p-3">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <span className="bg-muted-foreground text-white w-5 h-5 flex items-center justify-center text-xs">
                4
              </span>
              {t("api_data_sources_editor_page.test_preview.title")}
            </h3>
            <div className="flex items-center gap-3">
              <Input
                placeholder={t(
                  "api_data_sources_editor_page.placeholders.test_query",
                )}
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRunTest();
                  }
                }}
                className="flex-1 h-8 border border-border rounded-md"
              />
              <Button
                variant="default"
                onClick={handleRunTest}
                disabled={!canRunTest() || testResult.status === "loading"}
                className="h-8 px-4 rounded-md disabled:opacity-50 hover:bg-orange-600"
              >
                {testResult.status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("api_data_sources_editor_page.buttons.testing")}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t("api_data_sources_editor_page.buttons.run_test")}
                  </>
                )}
              </Button>
            </div>
            {testResult.status !== "idle" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div>
                  <h4 className="text-sm font-normal mb-2">
                    {t(
                      "api_data_sources_editor_page.test_preview.request_details",
                    )}
                  </h4>
                  <div
                    className={`p-3 text-wrap border text-xs font-mono rounded-md ${testResult.status === "error" ? "border-destructive bg-red-50 text-destructive" : "border-border bg-gray-50"}`}
                  >
                    {testResult.status === "loading" && (
                      <p>
                        {t("api_data_sources_editor_page.test_preview.loading")}
                      </p>
                    )}
                    {testResult.status === "error" && <p>{testResult.error}</p>}
                    {testResult.status === "success" && (
                      <>
                        <p className="text-wrap break-words">
                          {t("api_data_sources_editor_page.test_preview.url")}
                          {testResult.url}
                        </p>
                        <p>
                          {t(
                            "api_data_sources_editor_page.test_preview.status",
                          )}{" "}
                          {testResult.statusCode}
                        </p>
                        <p>
                          {t(
                            "api_data_sources_editor_page.test_preview.latency",
                          )}
                          {testResult.latency}ms
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-normal mb-2">
                    {t(
                      "api_data_sources_editor_page.test_preview.data_preview",
                    )}
                  </h4>
                  {testResult.status === "success" && (
                    <div className="border border-border max-h-48 overflow-auto rounded-md scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            {testResult.data &&
                              testResult.data.length > 0 &&
                              Object.keys(testResult.data[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-2 py-1 text-left font-medium"
                                >
                                  {key}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {testResult.data?.slice(0, 20).map((row, index) => (
                            <tr key={index} className="border-b border-border">
                              {Object.values(row).map((value, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="px-2 py-1 truncate max-w-24"
                                >
                                  {String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {currentSource.isValid ? (
              <span className="text-green-500 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {t("api_data_sources_editor_page.test_preview.footer_ready")}
              </span>
            ) : (
              <span>
                {t("api_data_sources_editor_page.test_preview.footer_enable")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="h-8 px-4 border border-border rounded-md bg-transparent"
            >
              {t("global.cancel")}
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={
                !currentSource.isValid || !currentSource.name.trim() || isSaving
              }
              className="h-8 hover:bg-orange-600 rounded-md disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("api_data_sources_editor_page.buttons.saving")}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t("api_data_sources_editor_page.buttons.save")}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ApiDataSourcesEditorPage;
