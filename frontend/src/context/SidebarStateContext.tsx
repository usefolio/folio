import React, { createContext, useState, useContext, ReactNode } from "react";
import { SidebarStateContextType } from "@/interfaces/interfaces";
// The number of projects to show initially and per "show more" click
const ITEMS_PER_PAGE = 5;

export const SidebarStateContext = createContext<
  SidebarStateContextType | undefined
>(undefined);

export const SidebarStateProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  return (
    <SidebarStateContext.Provider
      value={{ displayCount, setDisplayCount, ITEMS_PER_PAGE }}
    >
      {children}
    </SidebarStateContext.Provider>
  );
};

export const useSidebarState = () => {
  const context = useContext(SidebarStateContext);
  if (context === undefined) {
    throw new Error(
      "useSidebarState must be used within a SidebarStateProvider",
    );
  }
  return context;
};
