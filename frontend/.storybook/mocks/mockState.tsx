let currentParameters: Record<string, any> = {};

export function setStorybookParameters(parameters: Record<string, any>) {
  currentParameters = parameters;
}

export function getStorybookParameters() {
  return currentParameters;
}

let currentStoryContext: any = {};

export function setStorybookContext(context: any) {
  currentStoryContext = context;
}

export function getStorybookContext() {
  return currentStoryContext;
}
