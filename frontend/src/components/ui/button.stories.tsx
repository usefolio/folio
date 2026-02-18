import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Plus,
  Play,
  CheckIcon,
  Clock,
  Filter,
  GitBranch,
  Table2,
  Database,
  History,
  MessageSquare,
  MoreVertical,
  Minus,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Beaker,
  RotateCcw,
  Sparkles,
  ChevronDown,
  X,
  Download,
  Check,
  Trash2,
  Save,
  Upload,
  Pause,
  Volume2,
  VolumeX,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "./button";

const meta = {
  title: "Components/UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon", "compact", "xs", "iconSm", "iconXs"],
    },
    shape: {
      control: "select",
      options: ["rounded", "square", "pill"],
    },
    children: {
      control: "text",
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-row gap-2 items-center flex-wrap">
      {/* General */}
      <Button
        variant="default"
        size="compact"
        shape="square"
        className="px-4 hover:bg-orange-600"
      >
        Default
      </Button>
      <Button variant="destructive" size="compact" shape="square">
        Destructive
      </Button>
      <Button variant="outline" size="compact" shape="square">
        Outline
      </Button>
      <Button variant="secondary" size="compact" shape="square">
        Secondary
      </Button>
      <Button variant="ghost" size="compact" shape="square">
        Ghost
      </Button>
      <Button variant="link" size="compact" shape="square">
        Link
      </Button>
      <Button
        variant="default"
        disabled
        className="h-8 px-4 rounded-md hover:bg-orange-600"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Create Enrichment
        </div>
      </Button>
      <Button
        variant="default"
        disabled
        className="h-8 rounded-md hover:bg-orange-600"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      </Button>
      <Button
        variant="ghost"
        disabled
        className="h-8 rounded-md text-primary"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
      <Button
        variant="outline"
        disabled
        className="h-8 rounded-md text-primary"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
      <Button variant="default" size="icon" className="h-8 w-8 rounded-md">
        <Plus className="h-4 w-4" />
      </Button>
      {/* App Sidebar */}
      <Button
        variant="ghost"
        className="ml-2 py-1 flex items-center justify-center rounded-md disabled:opacity-20"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create New Project
      </Button>
      <Button
        disabled
        className="text-gray-500 bg-transparent text-xs font-semibold rounded-md opacity-50 h-7"
      >
        <Beaker className="h-3.5 w-3.5 mr-1.5" />
        <span>Playground</span>
      </Button>
      {/* Visual Query Builder */}
      <Button
        variant="default"
        size="icon"
        aria-label="Add new view"
        className="h-7 w-7 rounded-md my-1.5 ml-2 mr-1 bg-primary disabled:opacity-20 disabled:bg-gray-50 disabled:text-foreground hover:bg-orange-600 hover:text-background"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-xs rounded-md h-7 w-7 disabled:opacity-20"
      >
        <X className="h-4 w-4" />
      </Button>
      <Button
        variant="default"
        size="icon"
        disabled
        className={`h-7 w-7 rounded-md disabled:bg-[inherit] disabled:opacity-20 disabled:text-foreground hover:bg-orange-600 hover:text-background text-background`}
      >
        {" "}
        <div className="flex items-center gap-2">
          <CheckIcon className="h-4 w-4" />
        </div>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-[26px] rounded-md px-2 text-xs bg-[#FEE2E2] hover:bg-[#FECACA]"
      >
        AND
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-[26px] rounded-md px-2 text-xs bg-[#FEE2E2] hover:bg-[#FECACA]"
      >
        OR
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-[26px] rounded-md px-2 text-xs bg-[#E0F2FE] hover:bg-[#BAE6FD]"
      >
        {String("(")}
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-[26px] rounded-md px-2 text-xs bg-[#E0F2FE] hover:bg-[#BAE6FD]"
      >
        {String(")")}
      </Button>
      {/* Header */}
      <Button
        data-sidebar="trigger"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
      >
        <PanelLeft />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>
      <Button variant="outline" size="sm" className={`h-8 rounded-md`}>
        <GitBranch className="h-4 w-4" />
        <span className="text-xs">Workflow</span>
      </Button>
      <Button variant="outline" size="sm" className={`h-8 rounded-md`}>
        <Table2 className="h-4 w-4" />
        <span className="text-xs">Grid View</span>
      </Button>
      <Button variant="outline" className="h-8 w-8 rounded-md" size="sm">
        <Filter className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
        <Database className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
        <History className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
        <MessageSquare className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
        <MoreVertical className="h-4 w-4" />
      </Button>
      {/* Grid Right Element */}
      <Button
        variant="ghost"
        size="icon"
        className="w-6 h-6 mx-3 mt-1 mb-1 rounded-md"
      >
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" className="w-6 h-6 ml-1 rounded-md">
        <Minus className="w-3 h-3" />
      </Button>
      {/* Sheet Menu */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {/* Audio Player Popup */}
      <Button size="icon" variant="outline" className="rounded-md h-7 w-7">
        <Play className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
      </Button>
      <Button size="icon" variant="outline" className="rounded-md h-7 w-7">
        <Pause className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
      </Button>
      <Button size="icon" variant="outline" className="rounded-md h-7 w-7">
        <Volume2 className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
      </Button>
      <Button size="icon" variant="outline" className="rounded-md h-7 w-7">
        <VolumeX className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
      </Button>
      {/* Close Button Popup */}
      <Button
        size="sm"
        variant="ghost"
        className="h-5 mt-2 text-xs rounded-md"
      >
        <span>Close</span>
      </Button>
      {/* Column Modal Config */}
      <Button
        variant="outline"
        className="h-8 px-3 rounded-md"
        size="sm"
        disabled
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Schedule
        </div>
      </Button>
      <Button
        variant="default"
        className="h-8 px-4 rounded-md hover:bg-orange-600"
      >
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 mr-2" />
          Create Enrichment
        </div>
      </Button>
      <Button
        variant="default"
        size="icon"
        className="h-[25px] w-[25px] rounded-md leading-[20px] px-3 py-[3.5px]"
      >
        <Plus size="14px" className="w-4 h-4" />
      </Button>
      {/* Create New Project Modal Config */}
      <Button className="h-8 px-4 rounded-md bg-primary hover:bg-orange-600 text-primary-foreground">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 mr-2" />
          Create
        </div>
      </Button>
      <Button variant="outline" className="h-8 px-4 rounded-md">
        <RotateCcw className="h-4 w-4 mr-2" />
        <span>Clear</span>
      </Button>
      <Button
        variant="default"
        className="h-8 px-4 rounded-md hover:bg-orange-600"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        <span>Search</span>
      </Button>
      <Button
        variant="ghost"
        className="rounded-md text-xs font-normal px-3 h-5"
      >
        <span className="flex items-center">
          Show Files <ChevronDown className="ml-2" />
        </span>
      </Button>
      {/* Export Modal Config */}
      <Button
        variant="outline"
        className="h-8 px-3 text-xs font-medium rounded-md"
      >
        Select All
      </Button>
      <Button
        variant="outline"
        className="h-8 px-3 text-xs font-medium rounded-md"
      >
        Deselect All
      </Button>
      <Button
        variant="default"
        className="h-8 px-4 rounded-md hover:bg-orange-600"
      >
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 mr-2" />
          Export
        </div>
      </Button>
      {/* Settings Modal Config */}
      <Button
        variant="outline"
        className="rounded-md h-[26px] px-3 py-1.5 text-xs ml-2"
        size="sm"
      >
        <Check className="h-3 w-3 mr-1" />
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-md h-5 px-3 py-2 text-xs"
      >
        View Models
        <ChevronDown className="ml-1 h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        className="rounded-md h-[26px] px-3 py-1.5 text-xs"
        size="sm"
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        Restore Default
      </Button>
      {/* Data Chat */}
      <Button variant="ghost" size="sm" className="text-xs rounded-md">
        <Trash2 className="h-4 w-4 mr-1" />
        Clear History
      </Button>
      <Button size="icon" className="rounded-md mr-1 h-8 w-8">
        <Send className="h-5 w-5" />
      </Button>
      {/* Workflow Page */}
      <Button
        variant="default"
        className="h-8 py-1 flex items-center justify-center rounded-md hover:bg-orange-600"
      >
        <Plus className="h-4 w-4 mr-2" />
        New View
      </Button>

      <Button variant="outline" className="h-8 flex items-center rounded-md">
        <Trash2 className="h-4 w-4 mr-2" />
        Clear Canvas
      </Button>
      <Button variant="outline" className="flex items-center rounded-md h-8">
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>
      <Button variant="outline" className="flex items-center rounded-md h-8">
        <Save className="h-4 w-4 mr-2" />
        Export
      </Button>
      <Button variant="outline" className="flex items-center rounded-md h-8">
        <Save className="h-4 w-4 mr-2" />
        Export Views
      </Button>
      <Button
        size="sm"
        variant="default"
        className="h-8 py-1 flex items-center justify-center rounded-md hover:bg-orange-600 mr-2"
      >
        <Play className="h-4 w-4 rounded-md" />
        Run
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 py-1 flex items-center justify-center rounded-md"
      >
        <Play className="h-4 w-4 rounded-md" />
        Run Views
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md p-0">
        <Plus className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-md p-0 text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  ),
};
// --- Base Variants ---
export const Default: Story = {
  args: {
    variant: "default",
    children: "Primary Button",
    className: "h-8 px-4 rounded-md hover:bg-orange-600",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete",
    className: "h-8 rounded-md",
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline",
    className: "h-8 rounded-md",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
    className: "h-8 rounded-md",
  },
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost",
    className: "h-8 rounded-md",
  },
};

export const Link: Story = {
  args: {
    variant: "link",
    children: "Link",
    className: "h-8 rounded-md",
  },
};

export const Icon: Story = {
  args: {
    variant: "outline",
    size: "icon",
    className: "h-8 w-8 rounded-md",
    children: <Plus className="h-4 w-4" />,
  },
};
export const General_Loading_With_Text: Story = {
  args: {
    variant: "default",
    className: "h-8 px-4 rounded-md hover:bg-orange-600",
    disabled: true,
    children: (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Create Enrichment
      </div>
    ),
  },
};
export const General_Loading_Icon_Only: Story = {
  args: {
    variant: "default",
    size: "icon",
    disabled: true,
    className: "h-8 rounded-md hover:bg-orange-600",
    children: (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    ),
  },
};
export const General_Loading_Icon_Only_Ghost: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    disabled: true,
    className: "h-8 rounded-md text-primary",
    children: (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    ),
  },
};
export const General_Loading_Icon_Only_Outline: Story = {
  args: {
    variant: "outline",
    size: "icon",
    disabled: true,
    className: "h-8 rounded-md text-primary",
    children: (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    ),
  },
};
// --- App Sidebar ---
export const AppSidebar_CreateNewProject: Story = {
  args: {
    variant: "ghost",
    className:
      "ml-2 py-1 flex items-center justify-center rounded-md disabled:opacity-20",
    children: (
      <>
        <Plus className="h-4 w-4 mr-2" />
        Create New Project
      </>
    ),
  },
};

export const AppSidebar_Playground: Story = {
  args: {
    disabled: true,
    className:
      "text-gray-500 bg-transparent text-xs font-semibold rounded-md opacity-50 h-7",
    children: (
      <>
        <Beaker className="h-3.5 w-3.5 mr-1.5" />
        <span>Playground</span>
      </>
    ),
  },
};

// --- Visual Query Builder ---
export const VisualQueryBuilder_AddNewView: Story = {
  args: {
    variant: "default",
    size: "icon",
    "aria-label": "Add new view",
    className:
      "h-7 w-7 rounded-md my-1.5 ml-2 mr-1 bg-primary disabled:opacity-20 disabled:bg-gray-50 disabled:text-foreground hover:bg-orange-600 hover:text-background",
    children: <Plus className="h-4 w-4" />,
  },
};

export const VisualQueryBuilder_Close: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "text-xs rounded-md h-7 w-7 disabled:opacity-20",
    children: <X className="h-4 w-4" />,
  },
};

export const VisualQueryBuilder_SubmitCheck: Story = {
  args: {
    variant: "default",
    size: "icon",
    disabled: true,
    className:
      "h-7 w-7 rounded-md disabled:bg-[inherit] disabled:opacity-20 disabled:text-foreground hover:bg-orange-600 hover:text-background text-background",
    children: (
      <div className="flex items-center gap-2">
        <CheckIcon className="h-4 w-4" />
      </div>
    ),
  },
};

export const VisualQueryBuilder_And: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className:
      "h-[26px] rounded-md px-2 text-xs bg-[#FEE2E2] hover:bg-[#FECACA]",
    children: "AND",
  },
};

export const VisualQueryBuilder_Or: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className:
      "h-[26px] rounded-md px-2 text-xs bg-[#FEE2E2] hover:bg-[#FECACA]",
    children: "OR",
  },
};

export const VisualQueryBuilder_LeftParenthesis: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className:
      "h-[26px] rounded-md px-2 text-xs bg-[#E0F2FE] hover:bg-[#BAE6FD]",
    children: "(",
  },
};

export const VisualQueryBuilder_RightParenthesis: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className:
      "h-[26px] rounded-md px-2 text-xs bg-[#E0F2FE] hover:bg-[#BAE6FD]",
    children: ")",
  },
};

// --- Header ---

export const Header_ToggleSidebar: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "h-7 w-7 rounded-md",
    children: (
      <>
        <PanelLeft />
        <span className="sr-only">Toggle Sidebar</span>
      </>
    ),
  },
};

export const Header_Workflow: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className: "h-8 rounded-md",
    children: (
      <>
        <GitBranch className="h-4 w-4" />
        <span className="text-xs">Workflow</span>
      </>
    ),
  },
};

export const Header_GridView: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className: "h-8 rounded-md",
    children: (
      <>
        <Table2 className="h-4 w-4" />
        <span className="text-xs">Grid View</span>
      </>
    ),
  },
};

export const Header_Filter: Story = {
  args: {
    variant: "outline",
    size: "sm",
    className: "h-8 w-8 rounded-md",
    children: <Filter className="w-4 h-4" />,
  },
};

export const Header_DatabaseIcon: Story = {
  args: {
    variant: "outline",
    size: "icon",
    className: "h-8 w-8 rounded-md",
    children: <Database className="h-4 w-4" />,
  },
};

export const Header_HistoryIcon: Story = {
  args: {
    variant: "outline",
    size: "icon",
    className: "h-8 w-8 rounded-md",
    children: <History className="h-4 w-4" />,
  },
};

export const Header_MessageIcon: Story = {
  args: {
    variant: "outline",
    size: "icon",
    className: "h-8 w-8 rounded-md",
    children: <MessageSquare className="h-4 w-4" />,
  },
};

export const Header_MoreIcon: Story = {
  args: {
    variant: "outline",
    size: "icon",
    className: "h-8 w-8 rounded-md",
    children: <MoreVertical className="h-4 w-4" />,
  },
};

// --- Grid Right Element ---
export const Grid_Plus: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "w-6 h-6 mx-3 mt-1 mb-1 rounded-md",
    children: <Plus className="w-4 h-4" />,
  },
};

export const Grid_Minus: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "w-6 h-6 ml-1 rounded-md",
    children: <Minus className="w-3 h-3" />,
  },
};

// --- Sheet Menu ---
export const Sheet_NavigateLeft: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className:
      "h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20",
    children: <ChevronLeft className="h-4 w-4" />,
  },
};

export const Sheet_NavigateRight: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className:
      "h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20",
    children: <ChevronRight className="h-4 w-4" />,
  },
};

// --- Audio Player ---
export const Audio_Play: Story = {
  args: {
    size: "icon",
    variant: "outline",
    className: "rounded-md h-7 w-7",
    children: (
      <Play className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
    ),
  },
};

export const Audio_Pause: Story = {
  args: {
    size: "icon",
    variant: "outline",
    className: "rounded-md h-7 w-7",
    children: (
      <Pause className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
    ),
  },
};

export const Audio_Volume: Story = {
  args: {
    size: "icon",
    variant: "outline",
    className: "rounded-md h-7 w-7",
    children: (
      <Volume2 className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
    ),
  },
};

export const Audio_Mute: Story = {
  args: {
    size: "icon",
    variant: "outline",
    className: "rounded-md h-7 w-7",
    children: (
      <VolumeX className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
    ),
  },
};

// --- Popups and Modals ---

export const Popup_Close: Story = {
  args: {
    size: "sm",
    variant: "ghost",
    className: "h-5 mt-2 text-xs rounded-md",
    children: <span>Close</span>,
  },
};

export const Modal_ScheduleDisabled: Story = {
  args: {
    variant: "outline",
    className: "h-8 px-3 rounded-md",
    size: "sm",
    disabled: true,
    children: (
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Schedule
      </div>
    ),
  },
};

export const Modal_CreateEnrichment: Story = {
  args: {
    variant: "default",
    className: "h-8 px-4 rounded-md hover:bg-orange-600",
    children: (
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 mr-2" />
        Create Enrichment
      </div>
    ),
  },
};

export const Modal_AddTag: Story = {
  args: {
    variant: "default",
    size: "icon",
    className: "h-[25px] w-[25px] rounded-md leading-[20px] px-3 py-[3.5px]",
    children: <Plus size="14px" className="w-4 h-4" />,
  },
};

export const Modal_Create: Story = {
  args: {
    className:
      "h-8 px-4 rounded-md bg-primary hover:bg-orange-600 text-primary-foreground",
    children: (
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 mr-2" />
        Create
      </div>
    ),
  },
};

export const Modal_Clear: Story = {
  args: {
    variant: "outline",
    className: "h-8 px-4 rounded-md",
    children: (
      <>
        <RotateCcw className="h-4 w-4 mr-2" />
        <span>Clear</span>
      </>
    ),
  },
};

export const Modal_Search: Story = {
  args: {
    variant: "default",
    className: "h-8 px-4 rounded-md hover:bg-orange-600",
    children: (
      <>
        <Sparkles className="h-4 w-4 mr-2" />
        <span>Search</span>
      </>
    ),
  },
};

export const Modal_ShowFiles: Story = {
  args: {
    variant: "ghost",
    className: "rounded-md text-xs font-normal px-3 h-5",
    children: (
      <span className="flex items-center">
        Show Files <ChevronDown className="ml-2" />
      </span>
    ),
  },
};

// --- Export Modal ---
export const ExportModal_SelectAll: Story = {
  args: {
    variant: "outline",
    className: "h-8 px-3 text-xs font-medium rounded-md",
    children: "Select All",
  },
};

export const ExportModal_DeselectAll: Story = {
  args: {
    variant: "outline",
    className: "h-8 px-3 text-xs font-medium rounded-md",
    children: "Deselect All",
  },
};

export const ExportModal_Export: Story = {
  args: {
    variant: "default",
    className: "h-8 px-4 rounded-md hover:bg-orange-600",
    children: (
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 mr-2" />
        Export
      </div>
    ),
  },
};

// --- Settings Modal ---
export const Settings_Save: Story = {
  args: {
    variant: "outline",
    className: "rounded-md h-[26px] px-3 py-1.5 text-xs ml-2",
    size: "sm",
    children: (
      <>
        <Check className="h-3 w-3 mr-1" />
        Save
      </>
    ),
  },
};

export const Settings_ViewModels: Story = {
  args: {
    variant: "ghost",
    size: "sm",
    className: "rounded-md h-5 px-3 py-2 text-xs",
    children: (
      <>
        View Models
        <ChevronDown className="ml-1 h-4 w-4" />
      </>
    ),
  },
};

export const Settings_RestoreDefault: Story = {
  args: {
    variant: "outline",
    className: "rounded-md h-[26px] px-3 py-1.5 text-xs",
    size: "sm",
    children: (
      <>
        <RotateCcw className="h-3 w-3 mr-1" />
        Restore Default
      </>
    ),
  },
};

// --- Data Chat ---
export const Chat_ClearHistory: Story = {
  args: {
    variant: "ghost",
    size: "sm",
    className: "text-xs rounded-md",
    children: (
      <>
        <Trash2 className="h-4 w-4 mr-1" />
        Clear History
      </>
    ),
  },
};

export const Chat_Send: Story = {
  args: {
    size: "icon",
    className: "rounded-md mr-1 h-8 w-8",
    children: <Send className="h-5 w-5" />,
  },
};

// --- Workflow Page ---
export const Workflow_NewView: Story = {
  args: {
    variant: "default",
    className:
      "h-8 py-1 flex items-center justify-center rounded-md hover:bg-orange-600",
    children: (
      <>
        <Plus className="h-4 w-4 mr-2" />
        New View
      </>
    ),
  },
};

export const Workflow_ClearCanvas: Story = {
  args: {
    variant: "outline",
    className: "h-8 flex items-center rounded-md",
    children: (
      <>
        <Trash2 className="h-4 w-4 mr-2" />
        Clear Canvas
      </>
    ),
  },
};

export const Workflow_Import: Story = {
  args: {
    variant: "outline",
    className: "flex items-center rounded-md h-8",
    children: (
      <>
        <Upload className="h-4 w-4 mr-2" />
        Import
      </>
    ),
  },
};

export const Workflow_Export: Story = {
  args: {
    variant: "outline",
    className: "flex items-center rounded-md h-8",
    children: (
      <>
        <Save className="h-4 w-4 mr-2" />
        Export
      </>
    ),
  },
};

export const Workflow_ExportViews: Story = {
  args: {
    variant: "outline",
    className: "flex items-center rounded-md h-8",
    children: (
      <>
        <Save className="h-4 w-4 mr-2" />
        Export Views
      </>
    ),
  },
};

export const Workflow_Run: Story = {
  args: {
    size: "sm",
    variant: "default",
    className:
      "h-8 py-1 flex items-center justify-center rounded-md hover:bg-orange-600 mr-2",
    children: (
      <>
        <Play className="h-4 w-4 rounded-md" />
        Run
      </>
    ),
  },
};

export const Workflow_RunViews: Story = {
  args: {
    size: "sm",
    variant: "outline",
    className: "h-8 py-1 flex items-center justify-center rounded-md",
    children: (
      <>
        <Play className="h-4 w-4 rounded-md" />
        Run Views
      </>
    ),
  },
};

export const Workflow_AddNode: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "h-6 w-6 rounded-md p-0",
    children: <Plus className="w-4 h-4" />,
  },
};

export const Workflow_DeleteNode: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    className: "h-6 w-6 rounded-md p-0 text-destructive",
    children: <Trash2 className="w-4 h-4" />,
  },
};
