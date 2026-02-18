import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import "@glideapps/glide-data-grid/dist/index.css";
import {
  ClerkProvider,
  ClerkLoaded,
  useAuth,
  SignedIn,
} from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes } from "react-router";
import i18n from "./i18n.ts";
import { I18nextProvider } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router";
import LoginPage from "./routes/LoginPage.tsx";
import App from "./App.tsx";
import ProtectedRoute from "./routes/ProtectedRoute.tsx";
import { RootSidebarProvider } from "./components/ui/sidebar.tsx";
import { optimizeEventSystem } from "./utils/eventOptimization.ts";
import AfterSignIn from "./components/ui/postLogin.tsx";
import WaitlistPage from "./routes/WaitlistPage.tsx";
import WorkflowPage from "./routes/WorkflowPage.tsx";
import MainLayout from "./routes/mainLayout.tsx";
import { SidebarStateProvider } from "./context/SidebarStateContext.tsx";
import { ModalProvider } from "./context/ModalContext.tsx";
import { JamsocketProvider } from "./context/JamsocketContext";
import BillingPage from "./routes/BillingPage.tsx";
import LandingResearch from "./routes/LandingResearch.tsx";
import ScheduledActions from "./routes/ScheduledActionsPage.tsx";
import AlertsPage from "./routes/AlertsPage.tsx";
import TutorialsRoute from "./routes/TutorialsRoute.tsx";
import LogsPage from "./routes/LogsPage.tsx";
import SearchConfigurationPage from "./routes/SearchConfigurationPage.tsx";
import ApiDataSourcesListPage from "./routes/ApiDataSourcesListPage.tsx";
import ApiDataSourcesEditorPage from "./routes/ApiDataSourcesEditorPage.tsx";
import SignUpPage from "./routes/SignUpPage.tsx";
// Convex
const CONVEX_KEY = import.meta.env.VITE_CONVEX_URL;
if (!CONVEX_KEY) {
  throw new Error("Missing Convex key");
}
const convex = new ConvexReactClient(CONVEX_KEY as string);

// Clerk
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) {
  throw new Error("Missing Clerk key");
}
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const AnimatedRoutes: React.FC = () => {
  useEffect(() => {
    optimizeEventSystem();
  }, []);
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        // Prevent loss of state, key changes caused rerender of contexts
        // key={location.pathname}
        // TODO Find a way to still trigger the animation without the key prop
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        className="flex-grow overflow-hidden bg-gray-50"
      >
        <Routes location={location}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/waitlist" element={<WaitlistPage />} />
          {/* Protected layout with nested routes */}
          <Route element={<ProtectedRoute convex={convex} />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<App />} />
              <Route path="/workflow" element={<WorkflowPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/landing-research" element={<LandingResearch />} />
              <Route path="/scheduled-actions" element={<ScheduledActions />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/tutorials" element={<TutorialsRoute />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route
                path="/search-configuration"
                element={<SearchConfigurationPage />}
              />
              <Route
                path="/api-data-sources"
                element={<ApiDataSourcesListPage />}
              />
              <Route
                path="/api-data-sources/new"
                element={<ApiDataSourcesEditorPage />}
              />
              <Route
                path="/api-data-sources/:sourceId/edit"
                element={<ApiDataSourcesEditorPage />}
              />
            </Route>
          </Route>
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter basename="/">
        <ClerkProvider
          publishableKey={CLERK_KEY}
          afterSignOutUrl="/"
          signInUrl="/login"
          signUpUrl="/signup"
          waitlistUrl="/waitlist"
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <ClerkLoaded>
              {/* JamsocketProvider needs to be inside ClerkProvider to use useAuth */}
              <JamsocketProvider>
                <SignedIn>
                  <AfterSignIn />
                </SignedIn>
                <RootSidebarProvider>
                  <SidebarStateProvider>
                    <ModalProvider>
                      <AnimatedRoutes />
                    </ModalProvider>
                  </SidebarStateProvider>
                </RootSidebarProvider>
              </JamsocketProvider>
            </ClerkLoaded>
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </BrowserRouter>
    </I18nextProvider>
  </StrictMode>,
);
