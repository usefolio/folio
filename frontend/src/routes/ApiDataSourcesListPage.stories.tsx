import type { Meta, StoryObj } from "@storybook/react-vite";
import ApiDataSourcesListPage from "./ApiDataSourcesListPage";
import { Doc, Id } from "../../convex/_generated/dataModel";

const mockApiSources: Doc<"api_data_sources">[] = [
  {
    _id: "source1" as Id<"api_data_sources">,
    _creationTime: Date.now() - 86400000 * 3,
    workspace_id: "ws1" as Id<"workspace">,
    name: "Hacker News Trending",
    url: "https://hn.algolia.com/api/v1/search",
    status: "active",
    isValid: true,
    rateLimit: { requests: 10000, period: "hour" },
    urlParameters: [],
    headers: [],
    bodyJson: "",
    searchType: "regular",
    transformCode: "",
  },
  {
    _id: "source2" as Id<"api_data_sources">,
    _creationTime: Date.now() - 86400000 * 7,
    workspace_id: "ws1" as Id<"workspace">,
    name: "Elasticsearch Articles",
    url: "https://elasticsearch.example.com/articles/_search",
    status: "active",
    isValid: true,
    rateLimit: { requests: 5000, period: "hour" },
    urlParameters: [],
    headers: [],
    bodyJson: "{}",
    searchType: "ai",
    transformCode: "",
  },
];

const meta = {
  title: "Pages/Api Data Sources Page",
  component: ApiDataSourcesListPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    convex: {
      "api_data_sources.list": mockApiSources,
    },
  },
} satisfies Meta<typeof ApiDataSourcesListPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    queryPath: "api_data_sources.list",
  },
};

export const EmptyState: Story = {
  parameters: {
    queryPath: "api_data_sources.list",
    convex: {
      "api_data_sources.list": [],
    },
  },
};
