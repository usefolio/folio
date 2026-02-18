import type { Preview, Decorator } from "@storybook/react";
import React from "react";
import "../src/index.css";
import { MockAppProviders } from "./mocks/mockAppProviders";
import i18n from "../src/i18n";
import type {
  DataContextProps,
  ModalContextType,
  WorkflowContextType,
  SidebarStateContextType,
} from "../src/interfaces/interfaces";
import { setStorybookParameters, setStorybookContext } from "./mocks/mockState";

interface SBContextOverrides {
  dataContext?: Partial<DataContextProps>;
  modalContext?: Partial<ModalContextType>;
  sidebarStateContext?: Partial<SidebarStateContextType>;
  workflowContext?: Partial<WorkflowContextType>;
  fullscreen?: boolean;
}

const withMockProviders: Decorator = (StoryFn, context) => {
  setStorybookParameters(context.parameters);
  setStorybookContext(context);
  const locale = (context.globals as any)?.locale;
  if (locale && i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }

  const {
    dataContext = {},
    modalContext = {},
    workflowContext = {},
    fullscreen = false, // Read the fullscreen parameter
  } = (context.parameters as SBContextOverrides) ?? {};

  const storyEl = React.createElement(StoryFn, context.args);

  return React.createElement(MockAppProviders, {
    data: dataContext,
    modal: modalContext,
    workflow: workflowContext,
    fullscreen: fullscreen,
    children: storyEl,
  });
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  decorators: [withMockProviders],
};

export default preview;
