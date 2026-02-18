import { useState, useEffect, useMemo } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import {
  Plus,
  Trash2,
  TestTube2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  BrainCircuit,
  Search,
  Database,
  Edit,
  FileText,
  ImageIcon,
  Zap,
  Globe,
  Network,
  X,
} from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useDataContext } from "@/context/DataContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Engine,
  EngineType,
  ContentType,
  OpenSearchEngine,
  SolrEngine,
  TypesenseEngine,
  MeilisearchEngine,
  QuickwitEngine,
  MilvusEngine,
  WeaviateEngine,
  QdrantEngine,
  VespaEngine,
  FormProps,
  EngineWithErrors,
  TestResult,
} from "@/types/searchEngines";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";

// Helper functions
const validateEngine = (
  engine: Partial<Engine>,
  t: TFunction<"translation", undefined>,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!engine.name)
    errors.name = t("search_configuration_page.validation.name_required");
  if (!engine.contentTypes || engine.contentTypes.length === 0) {
    errors.contentTypes = t(
      "search_configuration_page.validation.content_type_required",
    );
  }
  return errors;
};

const EngineLogo = ({ type }: { type: EngineType }) => {
  const baseClass = "w-4 h-4";
  switch (type) {
    case "opensearch":
      return <Search className={`${baseClass} text-green-600`} />;
    case "solr":
      return <Database className={`${baseClass} text-orange-600`} />;
    case "typesense":
      return <Zap className={`${baseClass} text-purple-600`} />;
    case "meilisearch":
      return <Search className={`${baseClass} text-pink-600`} />;
    case "quickwit":
      return <Zap className={`${baseClass} text-yellow-600`} />;
    case "milvus":
      return <Network className={`${baseClass} text-blue-600`} />;
    case "weaviate":
      return <Globe className={`${baseClass} text-teal-600`} />;
    case "qdrant":
      return <Network className={`${baseClass} text-indigo-600`} />;
    case "vespa":
      return <BrainCircuit className={`${baseClass} text-blue-600`} />;
    default:
      return null;
  }
};

const ContentTypeIcon = ({ type }: { type: ContentType }) => {
  const baseClass = "w-3 h-3";
  switch (type) {
    case "text":
      return <FileText className={`${baseClass} text-gray-600`} />;
    case "pdf":
      return <FileText className={`${baseClass} text-red-600`} />;
    case "image":
      return <ImageIcon className={`${baseClass} text-blue-600`} />;
    default:
      return null;
  }
};

const createDefaultEngine = (type: EngineType): Engine => {
  const base = {
    id: `new-${Date.now()}`,
    engineType: type,
    name: "",
    contentTypes: [] as ContentType[],
  };
  switch (type) {
    case "opensearch":
      return {
        ...base,
        engineType: "opensearch",
        hosts: [""],
        authMode: "basic",
        basicAuth: { username: "", password: "" },
        verifyCerts: true,
        timeout: 10,
      } as OpenSearchEngine;
    case "solr":
      return {
        ...base,
        engineType: "solr",
        baseUrl: "",
        collection: "",
        zkHosts: [],
        basicAuth: { username: "", password: "" },
      } as SolrEngine;
    case "typesense":
      return {
        ...base,
        engineType: "typesense",
        nodes: [{ host: "", port: 443, protocol: "https" }],
        apiKey: "",
        connectionTimeoutSeconds: 2,
      } as TypesenseEngine;
    case "meilisearch":
      return {
        ...base,
        engineType: "meilisearch",
        url: "",
        apiKey: "",
        timeout: 8,
      } as MeilisearchEngine;
    case "quickwit":
      return {
        ...base,
        engineType: "quickwit",
        baseUrl: "",
        indexId: "",
        bearerToken: "",
      } as QuickwitEngine;
    case "milvus":
      return {
        ...base,
        engineType: "milvus",
        address: "",
        user: "root",
        password: "",
        secure: true,
        alias: "default",
      } as MilvusEngine;
    case "weaviate":
      return {
        ...base,
        engineType: "weaviate",
        url: "",
        apiKey: "",
        oidc: { clientId: "", clientSecret: "" },
        timeout: { connect: 5, read: 60 },
      } as WeaviateEngine;
    case "qdrant":
      return {
        ...base,
        engineType: "qdrant",
        url: "",
        apiKey: "",
        collection: "",
        https: true,
      } as QdrantEngine;
    case "vespa":
      return {
        ...base,
        engineType: "vespa",
        baseUrl: "",
        yqlTemplate: "",
        bearerToken: "",
        defaultRenderer: "card",
      } as VespaEngine;
    default:
      throw new Error(`Unknown engine type: ${type}`);
  }
};

// Engine specific form components

const Field = ({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) => (
  <div>
    <label className="text-sm font-medium text-muted-foreground mb-1 block">
      {label}
    </label>
    {children}
    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
  </div>
);

const FormInput = (
  props: React.ComponentProps<typeof Input> & { error?: boolean },
) => (
  <Input
    {...props}
    className={`h-8 backdrop:border border-border rounded-md ${props.error ? "border-destructive" : ""}`}
  />
);
const FormTextarea = (
  props: React.ComponentProps<typeof Textarea> & { error?: boolean },
) => (
  <Textarea
    {...props}
    className={`border border-border rounded-md ${props.error ? "border-destructive" : ""}`}
  />
);

const OpenSearchForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<OpenSearchEngine>) => (
  <div className="space-y-3">
    <Field label="Hosts" error={errors.hosts}>
      <div className="space-y-2">
        {engine.hosts.map((host, index) => (
          <div key={index} className="flex gap-2 items-center">
            <FormInput
              placeholder="https://search-cluster.example.com:9200"
              value={host}
              error={!!errors.hosts}
              onChange={(e) => {
                const newHosts = [...engine.hosts];
                newHosts[index] = e.target.value;
                onChange("hosts", newHosts);
              }}
            />
            {engine.hosts.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md"
                onClick={() =>
                  onChange(
                    "hosts",
                    engine.hosts.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange("hosts", [...engine.hosts, ""])}
          className="h-8 border border-border rounded-md"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("search_configuration_page.edit_mode.add_host_button")}
        </Button>
      </div>
    </Field>
    <Field label="Authentication">
      <Select
        value={engine.authMode}
        onValueChange={(value) => onChange("authMode", value)}
      >
        <SelectTrigger className="h-8 border border-border rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-md">
          <SelectItem className="rounded-md" value="basic">
            {t("search_configuration_page.edit_mode.basic_auth")}
          </SelectItem>
          <SelectItem className="rounded-md" value="api_key">
            {t("search_configuration_page.edit_mode.api_key")}
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    {engine.authMode === "basic" && (
      <Field
        label={t(
          "search_configuration_page.edit_mode.basic_auth_credentials_label",
        )}
        error={errors.basicAuth}
      >
        <div className="grid grid-cols-2 gap-2">
          <FormInput
            placeholder={t(
              "search_configuration_page.edit_mode.username_placeholder",
            )}
            value={engine.basicAuth?.username || ""}
            error={!!errors.basicAuth}
            onChange={(e) =>
              onChange("basicAuth", {
                ...engine.basicAuth,
                username: e.target.value,
              })
            }
          />
          <FormInput
            type="password"
            placeholder={t(
              "search_configuration_page.edit_mode.password_placeholder",
            )}
            value={engine.basicAuth?.password || ""}
            error={!!errors.basicAuth}
            onChange={(e) =>
              onChange("basicAuth", {
                ...engine.basicAuth,
                password: e.target.value,
              })
            }
          />
        </div>
      </Field>
    )}
    {engine.authMode === "api_key" && (
      <Field
        label={t(
          "search_configuration_page.edit_mode.api_key_credentials_label",
        )}
        error={errors.apiKeyAuth}
      >
        <div className="grid grid-cols-2 gap-2">
          <FormInput
            placeholder={t(
              "search_configuration_page.edit_mode.api_key_id_placeholder",
            )}
            value={engine.apiKeyAuth?.id || ""}
            error={!!errors.apiKeyAuth}
            onChange={(e) =>
              onChange("apiKeyAuth", {
                ...engine.apiKeyAuth,
                id: e.target.value,
              })
            }
          />
          <FormInput
            type="password"
            placeholder={t(
              "search_configuration_page.edit_mode.api_key_placeholder",
            )}
            value={engine.apiKeyAuth?.key || ""}
            error={!!errors.apiKeyAuth}
            onChange={(e) =>
              onChange("apiKeyAuth", {
                ...engine.apiKeyAuth,
                key: e.target.value,
              })
            }
          />
        </div>
      </Field>
    )}
    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={engine.verifyCerts}
          onCheckedChange={(checked) => onChange("verifyCerts", checked)}
        />
        <span className="text-sm">
          {t("search_configuration_page.edit_mode.verify_certificates_label")}
        </span>
      </div>
      <FormInput
        placeholder={t(
          "search_configuration_page.edit_mode.timeout_placeholder",
        )}
        type="number"
        value={engine.timeout}
        onChange={(e) =>
          onChange("timeout", Number.parseInt(e.target.value) || 10)
        }
      />
    </div>
  </div>
);
const SolrForm = ({ engine, onChange, errors, t }: FormProps<SolrEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.base_url_label")}
      error={errors.baseUrl}
    >
      <FormInput
        value={engine.baseUrl}
        error={!!errors.baseUrl}
        onChange={(e) => onChange("baseUrl", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.collection_label")}
      error={errors.collection}
    >
      <FormInput
        value={engine.collection}
        error={!!errors.collection}
        onChange={(e) => onChange("collection", e.target.value)}
      />
    </Field>
  </div>
);
const TypesenseForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<TypesenseEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.api_key_label")}
      error={errors.apiKey}
    >
      <FormInput
        type="password"
        value={engine.apiKey}
        error={!!errors.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
    </Field>
  </div>
);
const MeilisearchForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<MeilisearchEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.url_label")}
      error={errors.url}
    >
      <FormInput
        value={engine.url}
        error={!!errors.url}
        onChange={(e) => onChange("url", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.api_key_label")}
      error={errors.apiKey}
    >
      <FormInput
        type="password"
        value={engine.apiKey}
        error={!!errors.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
    </Field>
  </div>
);
const QuickwitForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<QuickwitEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.base_url_label")}
      error={errors.baseUrl}
    >
      <FormInput
        value={engine.baseUrl}
        error={!!errors.baseUrl}
        onChange={(e) => onChange("baseUrl", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.index_id_label")}
      error={errors.indexId}
    >
      <FormInput
        value={engine.indexId}
        error={!!errors.indexId}
        onChange={(e) => onChange("indexId", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.bearer_token_label")}
      error={errors.bearerToken}
    >
      <FormInput
        type="password"
        value={engine.bearerToken}
        error={!!errors.bearerToken}
        onChange={(e) => onChange("bearerToken", e.target.value)}
      />
    </Field>
  </div>
);
const MilvusForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<MilvusEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.address_label")}
      error={errors.address}
    >
      <FormInput
        value={engine.address}
        error={!!errors.address}
        onChange={(e) => onChange("address", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.user_label")}
      error={errors.user}
    >
      <FormInput
        value={engine.user}
        error={!!errors.user}
        onChange={(e) => onChange("user", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.password_label")}
      error={errors.password}
    >
      <FormInput
        type="password"
        value={engine.password}
        error={!!errors.password}
        onChange={(e) => onChange("password", e.target.value)}
      />
    </Field>
  </div>
);
const WeaviateForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<WeaviateEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.url_label")}
      error={errors.url}
    >
      <FormInput
        value={engine.url}
        error={!!errors.url}
        onChange={(e) => onChange("url", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.api_key_recommended_label")}
      error={errors.apiKey}
    >
      <FormInput
        type="password"
        value={engine.apiKey}
        error={!!errors.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
    </Field>
  </div>
);
const QdrantForm = ({
  engine,
  onChange,
  errors,
  t,
}: FormProps<QdrantEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.url_label")}
      error={errors.url}
    >
      <FormInput
        value={engine.url}
        error={!!errors.url}
        onChange={(e) => onChange("url", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.api_key_label")}
      error={errors.apiKey}
    >
      <FormInput
        type="password"
        value={engine.apiKey}
        error={!!errors.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.collection_label")}
      error={errors.collection}
    >
      <FormInput
        value={engine.collection}
        error={!!errors.collection}
        onChange={(e) => onChange("collection", e.target.value)}
      />
    </Field>
  </div>
);
const VespaForm = ({ engine, onChange, errors, t }: FormProps<VespaEngine>) => (
  <div className="space-y-3">
    <Field
      label={t("search_configuration_page.edit_mode.base_url_label")}
      error={errors.baseUrl}
    >
      <FormInput
        value={engine.baseUrl}
        error={!!errors.baseUrl}
        onChange={(e) => onChange("baseUrl", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.bearer_token_label")}
      error={errors.bearerToken}
    >
      <FormInput
        type="password"
        value={engine.bearerToken}
        error={!!errors.bearerToken}
        onChange={(e) => onChange("bearerToken", e.target.value)}
      />
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.default_renderer_label")}
    >
      <Select
        value={engine.defaultRenderer}
        onValueChange={(value) => onChange("defaultRenderer", value)}
      >
        <SelectTrigger className="h-8 text-xs border border-border rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-md">
          <SelectItem className="rounded-md" value="card">
            {t("search_configuration_page.edit_mode.renderer_card")}
          </SelectItem>
          <SelectItem className="rounded-md" value="table-row">
            {t("search_configuration_page.edit_mode.renderer_table")}
          </SelectItem>
          <SelectItem className="rounded-md" value="json-blob">
            {t("search_configuration_page.edit_mode.renderer_json")}
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <Field
      label={t("search_configuration_page.edit_mode.yql_template_label")}
      error={errors.yqlTemplate}
    >
      <FormTextarea
        value={engine.yqlTemplate}
        error={!!errors.yqlTemplate}
        onChange={(e) => onChange("yqlTemplate", e.target.value)}
      />
    </Field>
  </div>
);

const renderEngineSpecificForm = (
  engine: Engine,
  onChange: (field: string, value: unknown) => void,
  errors: Record<string, string>,
  t: TFunction<"translation", undefined>,
) => {
  switch (engine.engineType) {
    case "opensearch":
      return (
        <OpenSearchForm
          engine={engine}
          onChange={onChange}
          errors={errors}
          t={t}
        />
      );
    case "solr":
      return (
        <SolrForm engine={engine} onChange={onChange} errors={errors} t={t} />
      );
    case "typesense":
      return (
        <TypesenseForm
          engine={engine}
          onChange={onChange}
          errors={errors}
          t={t}
        />
      );
    case "meilisearch":
      return (
        <MeilisearchForm
          engine={engine}
          onChange={onChange}
          errors={errors}
          t={t}
        />
      );
    case "quickwit":
      return (
        <QuickwitForm
          engine={engine}
          onChange={onChange}
          errors={errors}
          t={t}
        />
      );
    case "milvus":
      return (
        <MilvusForm engine={engine} onChange={onChange} errors={errors} t={t} />
      );
    case "weaviate":
      return (
        <WeaviateForm
          engine={engine}
          onChange={onChange}
          errors={errors}
          t={t}
        />
      );
    case "qdrant":
      return (
        <QdrantForm engine={engine} onChange={onChange} errors={errors} t={t} />
      );
    case "vespa":
      return (
        <VespaForm engine={engine} onChange={onChange} errors={errors} t={t} />
      );
    default:
      return (
        <div className="text-sm text-muted-foreground p-3">
          {t("search_configuration_page.select_engine_type")}
        </div>
      );
  }
};

export default function SearchConfigurationPage() {
  const { workspace } = useDataContext();

  const initialData = useQuery(
    api.search_engines.get,
    workspace?._id ? { workspaceId: workspace._id } : "skip",
  );
  const saveConfiguration = useMutation(api.search_engines.saveConfiguration);
  const testConnectionAction = useAction(api.search_engines.testConnection);
  const { t } = useTranslation();
  const [engines, setEngines] = useState<EngineWithErrors[]>([]);
  const [initialState, setInitialState] = useState<Engine[]>([]);
  const [deletedIds, setDeletedIds] = useState<Id<"search_engines">[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingEngine, setEditingEngine] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    engine: EngineWithErrors;
  } | null>(null);
  const [testingEngine, setTestingEngine] = useState<EngineWithErrors | null>(
    null,
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (initialData) {
      const loadedEngines = initialData.map((e) => {
        const config = e.config || {};
        const fullEngine = {
          id: e._id,
          name: e.name,
          engineType: e.engineType,
          contentTypes: e.contentTypes as ContentType[],
          ...config,
        };
        return {
          ...fullEngine,
          errors: validateEngine(fullEngine, t),
        } as EngineWithErrors;
      });
      setEngines(loadedEngines);
      const cleanState = loadedEngines.map(
        ({ errors, ...e }: EngineWithErrors) => e,
      );
      setInitialState(JSON.parse(JSON.stringify(cleanState)));
    }
  }, [initialData]);

  const isDirty = useMemo(() => {
    if (!initialData) return false;
    const currentEngines = engines
      .filter((e) => !e.isDeleted)
      .map(({ errors, isDeleted, ...e }: EngineWithErrors) => e);
    return (
      JSON.stringify(currentEngines) !== JSON.stringify(initialState) ||
      deletedIds.length > 0
    );
  }, [engines, initialState, deletedIds, initialData]);

  const hasErrors = useMemo(
    () => engines.some((e) => !e.isDeleted && Object.keys(e.errors).length > 0),
    [engines],
  );

  const handleEngineChange = (id: string, field: string, value: unknown) => {
    setEngines((prev) => {
      const newEngines = prev.map((e: EngineWithErrors) =>
        e.id === id ? { ...e, [field]: value } : e,
      );
      return newEngines.map((e: EngineWithErrors) =>
        e.id === id ? { ...e, errors: validateEngine(e, t) } : e,
      );
    });
  };

  const handleContentTypeToggle = (id: string, contentType: ContentType) => {
    setEngines((prev) => {
      const newEngines = prev.map((e) => {
        if (e.id === id) {
          const currentTypes = e.contentTypes || [];
          const newTypes = currentTypes.includes(contentType)
            ? currentTypes.filter((t) => t !== contentType)
            : [...currentTypes, contentType];
          return { ...e, contentTypes: newTypes };
        }
        return e;
      });
      return newEngines.map((e) =>
        e.id === id ? { ...e, errors: validateEngine(e, t) } : e,
      );
    });
  };

  const handleAddEngine = (engineType: EngineType) => {
    const hasIncompleteEngines = engines.some(
      (e) =>
        !e.isDeleted &&
        (editingEngine === e.id || Object.keys(e.errors).length > 0),
    );
    if (hasIncompleteEngines) return;
    const newEngine = createDefaultEngine(engineType);
    setEngines((prev) => [
      ...prev,
      { ...newEngine, errors: validateEngine(newEngine, t) },
    ]);
    setEditingEngine(newEngine.id);
  };

  const handleDeleteEngine = (id: string) => {
    const engine = engines.find((e) => e.id === id);
    if (!engine) return;
    setConfirmDelete({ id, engine });
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    if (!confirmDelete.id.startsWith("new-")) {
      setDeletedIds((prev) => [
        ...prev,
        confirmDelete.id as Id<"search_engines">,
      ]);
    }
    setEngines((prev) =>
      prev.map((e) =>
        e.id === confirmDelete.id ? { ...e, isDeleted: true } : e,
      ),
    );
    setConfirmDelete(null);
  };

  const handleSave = async () => {
    if (hasErrors || !workspace?._id) return;
    setIsSaving(true);
    setSaveError(null);
    const enginesToSave = engines
      .filter((e) => !e.isDeleted)
      .map(({ errors, isDeleted, ...e }: EngineWithErrors) => {
        const { id, engineType, name, contentTypes, ...config } = e;
        return {
          id,
          engineType,
          name,
          contentTypes: contentTypes as ContentType[],
          config,
        };
      });
    try {
      await saveConfiguration({
        workspaceId: workspace?._id,
        engines: enginesToSave,
        deletedIds,
      });
      setDeletedIds([]);
    } catch (error) {
      setSaveError((error as Error).message || t("globals.unknown_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (engine: EngineWithErrors) => {
    setTestingEngine(engine);
    setTestResult({ status: "loading" });
    try {
      const { errors, isDeleted, ...engineConfig } = engine;
      const result = await testConnectionAction({ engineConfig });
      setTestResult(result as TestResult);
    } catch (e) {
      setTestResult({ status: "error", error: (e as Error).message });
    }
  };

  return (
    <div className="h-full bg-gray-50 p-6 scrollbar-thin">
      <div className="max-w-6xl mx-auto">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("search_configuration_page.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-forground">
              {t("search_configuration_page.subtitle")}
            </p>

            <div className="mt-4 space-y-3">
              {engines.map(
                (engine) =>
                  !engine.isDeleted && (
                    <div key={engine.id} className="p-3 border border-border">
                      {editingEngine === engine.id ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-2 items-start">
                            <div className="w-40">
                              <div className="h-8 px-3 py-2 border border-border rounded-md bg-gray-50 flex items-center gap-2 text-xs">
                                <EngineLogo type={engine.engineType} />
                                {engine.engineType.charAt(0).toUpperCase() +
                                  engine.engineType.slice(1)}
                              </div>
                            </div>
                            <div className="flex-1">
                              <FormInput
                                placeholder="Engine Name"
                                value={engine.name}
                                onChange={(e) =>
                                  handleEngineChange(
                                    engine.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (engine.id.startsWith("new-")) {
                                    setEngines((prev) =>
                                      prev.filter((e) => e.id !== engine.id),
                                    );
                                  } else {
                                    const originalEngine = initialState.find(
                                      (e) => e.id === engine.id,
                                    );
                                    if (originalEngine) {
                                      setEngines((prev) =>
                                        prev.map((e) =>
                                          e.id === engine.id
                                            ? ({
                                                ...originalEngine,
                                                errors: validateEngine(
                                                  originalEngine,
                                                  t,
                                                ),
                                              } as EngineWithErrors)
                                            : e,
                                        ),
                                      );
                                    }
                                  }
                                  setEditingEngine(null);
                                }}
                                className="h-8 px-4 border border-border rounded-md"
                              >
                                {t("global.cancel")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingEngine(null)}
                                disabled={Object.keys(engine.errors).length > 0}
                                className="h-8 px-4 border border-border rounded-md disabled:opacity-50"
                              >
                                {t(
                                  "search_configuration_page.edit_mode.done_button",
                                )}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-2">
                              {t(
                                "search_configuration_page.edit_mode.content_types_label",
                              )}
                            </div>
                            <div className="flex gap-3">
                              {(["text", "pdf", "image"] as ContentType[]).map(
                                (contentType) => (
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`${engine.id}-${contentType}`}
                                      checked={
                                        engine.contentTypes?.includes(
                                          contentType,
                                        ) || false
                                      }
                                      onCheckedChange={() =>
                                        handleContentTypeToggle(
                                          engine.id,
                                          contentType,
                                        )
                                      }
                                      className="h-4 w-4 rounded-md"
                                    />
                                    <Label
                                      key={contentType}
                                      htmlFor={`${engine.id}-${contentType}`}
                                      className="cursor-pointer flex flex-row gap-1 items-center"
                                    >
                                      <ContentTypeIcon type={contentType} />
                                      <span className="text-sm capitalize">
                                        {contentType}
                                      </span>
                                    </Label>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                          {renderEngineSpecificForm(
                            engine,
                            (field, value) =>
                              handleEngineChange(engine.id, field, value),
                            engine.errors,
                            t,
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <EngineLogo type={engine.engineType} />
                              <span className="font-medium">{engine.name}</span>
                            </div>
                            <div className="text-sm text-gray-600 capitalize">
                              {engine.engineType}
                            </div>
                            <div className="flex items-center gap-1">
                              {engine.contentTypes?.map((type) => (
                                <div
                                  key={type}
                                  className="flex items-center gap-1 bg-gray-100 px-2 py-1 text-xs"
                                >
                                  <ContentTypeIcon type={type} />
                                  <span className="capitalize">{type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 bg-transparent border border-border rounded-md"
                              onClick={() => handleTestConnection(engine)}
                              disabled={Object.keys(engine.errors).length > 0}
                            >
                              <TestTube2 className="h-3 w-3 mr-1" />
                              {t(
                                "search_configuration_page.view_mode.test_button",
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 bg-transparent border border-border rounded-md"
                              onClick={() => setEditingEngine(engine.id)}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              {t(
                                "search_configuration_page.view_mode.edit_button",
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 px-2 rounded-md hover:bg-red-600"
                              onClick={() => handleDeleteEngine(engine.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {t(
                                "search_configuration_page.view_mode.delete_button",
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ),
              )}
              <div className="border-2 border-dashed border-gray-300 p-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-3">
                    {t("search_configuration_page.add_new_engine")}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(
                      [
                        "opensearch",
                        "solr",
                        "typesense",
                        "meilisearch",
                        "quickwit",
                        "milvus",
                        "weaviate",
                        "qdrant",
                        "vespa",
                      ] as EngineType[]
                    ).map((type) => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddEngine(type)}
                        disabled={editingEngine !== null}
                        className="h-8 px-4 border border-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <EngineLogo type={type} />
                        <span className="ml-1 capitalize">{type}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-5 border-t flex items-center justify-end gap-4">
            {saveError && (
              <div className="text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>{saveError}</span>
              </div>
            )}
            <Button
              variant="default"
              onClick={handleSave}
              disabled={!isDirty || hasErrors || isSaving}
              className="rounded-md h-8"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSaving
                ? t("search_configuration_page.saving_button")
                : t("search_configuration_page.save_button")}
            </Button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 w-full max-w-md">
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h3 className="text-md font-medium">
                {t("search_configuration_page.delete_modal.title")}
              </h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  {t(
                    "search_configuration_page.delete_modal.confirmation_message",
                  )}
                </p>
                <div className="bg-gray-50 border border-gray-200 p-3 space-y-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground">
                      {t("search_configuration_page.delete_modal.engine_label")}
                    </span>
                    <span className="ml-2 font-medium">
                      {confirmDelete.engine.name}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">
                      {t("search_configuration_page.delete_modal.type_label")}
                    </span>
                    <span className="ml-2 capitalize">
                      {confirmDelete.engine.engineType}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-destructive bg-red-50 border border-red-200 p-2">
                  {t("search_configuration_page.delete_modal.warning_message")}
                </div>
              </div>
            </div>
            <div className="px-4 py-2 border-t border-gray-200 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
                className="h-8 border border-border bg-transparent rounded-md"
              >
                {t("global.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDeleteAction}
                className="h-8 rounded-md"
              >
                {t("search_configuration_page.view_mode.delete_button")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {testingEngine && testResult && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-border w-full max-w-lg">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-md font-medium">
                  {t("search_configuration_page.test_modal.title", {
                    engineName: testingEngine.name,
                  })}
                </h3>
                <p className="text-sm text-gray-600 capitalize">
                  {testingEngine.engineType}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTestingEngine(null)}
                className="w-8 h-8 rounded-md"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              {testResult.status === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  <span className="ml-2 text-sm text-gray-600">
                    {t("search_configuration_page.test_modal.testing_message")}
                  </span>
                </div>
              )}
              {testResult.status === "error" && (
                <div className="text-red-500 bg-red-50 p-3 border border-red-200">
                  <h3 className="font-semibold flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4" />{" "}
                    {t("search_configuration_page.test_modal.failed_message")}
                  </h3>
                  <p className="text-sm mt-2">{testResult.error}</p>
                </div>
              )}
              {testResult.status === "success" && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-2 text-sm">
                      {t("search_configuration_page.test_modal.success_title")}
                    </h4>
                    <div className="text-sm space-y-2">
                      <div className="flex items-center gap-2 text-green-500">
                        <CheckCircle className="h-4 w-4" />
                        <span>
                          {t(
                            "search_configuration_page.test_modal.success_message",
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span>
                          {t(
                            "search_configuration_page.test_modal.response_time",
                            {
                              responseTime: testResult.responseTime,
                            },
                          )}
                        </span>
                      </div>
                      {testResult.latencyWarning && (
                        <div className="flex items-center gap-2 text-yellow-600 p-2 bg-yellow-50 border border-yellow-200">
                          <AlertTriangle className="h-4 w-4" />
                          <span>
                            {t(
                              "search_configuration_page.test_modal.latency_warning",
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-200 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTestingEngine(null)}
                className="h-8 border border-border bg-transparent rounded-md"
              >
                {t("global.close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
