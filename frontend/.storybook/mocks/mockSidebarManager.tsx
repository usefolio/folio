import React, { createContext, useContext } from "react";

export interface SidebarContextType {
  openSidebar: (content: unknown) => void;
  closeSidebar: () => void;
}

// Always-available noop implementation
const defaultValue: SidebarContextType = {
  openSidebar: () => {},
  closeSidebar: () => {},
};

const SidebarMockContext = createContext<SidebarContextType>(defaultValue);

//Lightweight provider

export const SidebarProvider: React.FC<
  React.PropsWithChildren<{ loading?: boolean }>
> = ({ children }) => (
  <SidebarMockContext.Provider value={defaultValue}>
    {children}
  </SidebarMockContext.Provider>
);
export const useSidebar = () => useContext(SidebarMockContext);
