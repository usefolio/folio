import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import MainLayout from "./mainLayout";
import { useDataContext } from "@/context/DataContext";
import { useUser } from "@clerk/clerk-react";
import { useModal } from "@/context/ModalContext";

// Mocking necessary hooks and components
vi.mock("@/context/DataContext", () => ({
  useDataContext: vi.fn(),
}));

vi.mock("@/context/ModalContext", () => ({
  useModal: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useUser: vi.fn(),
}));

// Mock child components to isolate the layout component
vi.mock("react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => {
    return {
      pathname: "/",
    };
  },
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual, // Import all actual exports like initReactI18next
    // Override just the useTranslation hook for our test purposes
    useTranslation: () => ({
      t: (key: string, options?: { userName?: string }) => {
        if (key === "global.welcome") {
          return `Welcome, ${options?.userName}`;
        }
        return key;
      },
    }),
  };
});

vi.mock("@/components/AppSidebar", () => ({
  // Use default export for functional components
  default: () => <div data-testid="app-sidebar" />,
}));

vi.mock("@/components/Header", () => ({
  default: () => <div data-testid="header" />,
}));

// Mock the SidebarProvider to just render its children
vi.mock("@/components/sidebar/SidebarManager", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock notifications to avoid errors in tests
vi.mock("@/components/notification/NotificationHandler", () => ({
  showErrorNotification: vi.fn(),
}));

describe("MainLayout welcome message tests", () => {
  const mockOpenModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock for useUser
    (useUser as Mock).mockReturnValue({
      user: { firstName: "Test" },
    });
    // Setup default mock for useModal
    (useModal as Mock).mockReturnValue({
      openModal: mockOpenModal,
    });
  });

  it("should display the welcome message when there are no projects", () => {
    // Arrange: No projects
    (useDataContext as Mock).mockReturnValue({
      projects: [],
      loading: false,
      loadingColumnsSet: new Set(),
      failedColumnsSet: new Set(),
    });

    // Act
    render(<MainLayout />);

    // Assert
    // Check for the welcome message
    expect(screen.getByText("Welcome, Test")).toBeInTheDocument();
    expect(screen.getByText("global.welcome_subtext")).toBeInTheDocument();

    // Check for the "New Project" button
    const newProjectButton = screen.getByRole("button", {
      name: "sidebar.new_project_button",
    });
    expect(newProjectButton).toBeInTheDocument();

    // Assert that the main interface is hidden
    expect(screen.queryByTestId("app-sidebar")).toBeInTheDocument();
  });

  it("should display the main layout and hide the welcome message when projects exist", () => {
    // Arrange: One project exists
    (useDataContext as Mock).mockReturnValue({
      projects: [{ id: "1", name: "My First Project" }],
      project: { id: "1", name: "My First Project" },
      loading: false,
      sheets: [],
      loadingColumnsSet: new Set(),
      failedColumnsSet: new Set(),
    });

    // Act
    render(<MainLayout />);

    // Assert
    // Check that the welcome message and subtext are not present
    expect(screen.queryByText("Welcome, Test")).not.toBeInTheDocument();
    expect(
      screen.queryByText("global.welcome_subtext"),
    ).not.toBeInTheDocument();

    // Assert that the main interface components are now visible
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });
});
