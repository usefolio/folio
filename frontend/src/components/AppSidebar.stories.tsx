import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AppSidebar from "./AppSidebar";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { action } from "storybook/actions";

// --- Mock Data ---
const mockProjects: Doc<"project">[] = [
  {
    _id: "proj1" as Id<"project">,
    _creationTime: Date.now(),
    name: "Q3 Financial Analysis",
    owner: "user_123",
  },
  {
    _id: "proj2" as Id<"project">,
    _creationTime: Date.now(),
    name: "Customer Feedback Initiative",
    owner: "user_123",
  },
  {
    _id: "proj3" as Id<"project">,
    _creationTime: Date.now(),
    name: "Website Redesign",
    owner: "user_123",
  },
];

const mockProjectGroupings: Doc<"project_grouping">[] = [
  {
    _id: "group1" as Id<"project_grouping">,
    _creationTime: Date.now(),
    name: "Synced Projects",
    type: "synced",
    owner: "user_123",
  },
];

// --- Interactive Wrapper Component ---
const InteractiveAppSidebar = (
  props: Omit<
    React.ComponentProps<typeof AppSidebar>,
    "project" | "setProject"
  >,
) => {
  const [activeProject, setActiveProject] = useState<Id<"project"> | undefined>(
    props.projects?.[0]?._id,
  );

  const handleSetProject = (projectId: Id<"project"> | null) => {
    action("setProject")(projectId); // Log to actions panel
    setActiveProject(projectId!); // Update local state
  };

  return (
    <AppSidebar
      {...props}
      project={activeProject}
      setProject={handleSetProject}
    />
  );
};

const meta = {
  title: "Layout/AppSidebar",
  component: AppSidebar, // The main component being documented
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-64 h-screen bg-gray-50 border-r">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppSidebar>;

export default meta;

// --- Stories ---

export const Interactive: StoryObj<typeof InteractiveAppSidebar> = {
  args: {
    projects: mockProjects as any,
    projectGrouping: [],
    projectsLoading: false,
    hasMoreProjects: true,
    setSheet: action("setSheet"),
    openNewProjectModal: action("openNewProjectModal"),
    loadMoreProjects: action("loadMoreProjects"),
  },
  render: (args) => <InteractiveAppSidebar {...args} />,
};

export const WithProjectGroup: StoryObj<typeof InteractiveAppSidebar> = {
  name: "Interactive With Synced Projects",
  args: {
    ...Interactive.args,
    projects: [
      ...mockProjects,
      {
        _id: "proj4" as Id<"project">,
        _creationTime: Date.now(),
        name: "01 Mar - 31 Mar",
        project_grouping: "group1" as Id<"project_grouping">,
        owner: "user_123",
        total_new_rows: 5,
      },
    ] as any,
    projectGrouping: mockProjectGroupings,
  },
  render: (args) => <InteractiveAppSidebar {...args} />,
};

export const Loading: StoryObj<typeof AppSidebar> = {
  name: "Loading",
  args: {
    projects: [],
    projectsLoading: true,
    project: mockProjects[0]._id,
    setProject: action("setProject"),
    projectGrouping: [],
    hasMoreProjects: true,
    setSheet: action("setSheet"),
    openNewProjectModal: action("openNewProjectModal"),
    loadMoreProjects: action("loadMoreProjects"),
  },
};

export const NoProjects: StoryObj<typeof AppSidebar> = {
  name: "No Projects",
  args: {
    ...Loading.args,
    projects: [],
    projectsLoading: false,
    hasMoreProjects: false,
  },
};
