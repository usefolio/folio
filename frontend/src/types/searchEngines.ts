import { TFunction } from "i18next";

export type EngineType =
  | "opensearch"
  | "solr"
  | "typesense"
  | "meilisearch"
  | "quickwit"
  | "milvus"
  | "weaviate"
  | "qdrant"
  | "vespa";
export type ContentType = "text" | "pdf" | "image";

export type BaseEngine = {
  id: string;
  engineType: EngineType;
  name: string;
  contentTypes: ContentType[];
  isDeleted?: boolean;
};

export type OpenSearchEngine = BaseEngine & {
  engineType: "opensearch";
  hosts: string[];
  authMode: "basic" | "api_key";
  basicAuth?: { username: string; password: string };
  apiKeyAuth?: { id: string; key: string };
  verifyCerts: boolean;
  caCerts?: string;
  timeout: number;
};

export type SolrEngine = BaseEngine & {
  engineType: "solr";
  baseUrl: string;
  collection: string;
  zkHosts: string[];
  basicAuth?: { username: string; password: string };
};

export type TypesenseEngine = BaseEngine & {
  engineType: "typesense";
  nodes: Array<{ host: string; port: number; protocol: "http" | "https" }>;
  apiKey: string;
  connectionTimeoutSeconds: number;
};

export type MeilisearchEngine = BaseEngine & {
  engineType: "meilisearch";
  url: string;
  apiKey: string;
  timeout: number;
};

export type QuickwitEngine = BaseEngine & {
  engineType: "quickwit";
  baseUrl: string;
  indexId: string;
  bearerToken: string;
};

export type MilvusEngine = BaseEngine & {
  engineType: "milvus";
  address: string;
  user: string;
  password: string;
  secure: boolean;
  alias: string;
};

export type WeaviateEngine = BaseEngine & {
  engineType: "weaviate";
  url: string;
  apiKey?: string;
  oidc?: { clientId: string; clientSecret: string };
  timeout: { connect: number; read: number };
};

export type QdrantEngine = BaseEngine & {
  engineType: "qdrant";
  url: string;
  apiKey: string;
  collection: string;
  https: boolean;
};

export type VespaEngine = BaseEngine & {
  engineType: "vespa";
  baseUrl: string;
  yqlTemplate: string;
  bearerToken: string;
  defaultRenderer: "card" | "table-row" | "json-blob";
};

export type Engine =
  | OpenSearchEngine
  | SolrEngine
  | TypesenseEngine
  | MeilisearchEngine
  | QuickwitEngine
  | MilvusEngine
  | WeaviateEngine
  | QdrantEngine
  | VespaEngine;

export type EngineWithErrors = Engine & {
  errors: Record<string, string>;
};

export type TestResult = {
  status: "loading" | "success" | "error";
  responseTime?: number;
  latencyWarning?: boolean;
  error?: string;
};

export type FormProps<T extends Engine> = {
  engine: T;
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
  t: TFunction<"translation", undefined>;
};
