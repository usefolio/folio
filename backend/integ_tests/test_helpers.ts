import axios from "axios";

export const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000";
export const PREFECT_API_URL = process.env.PREFECT_API_URL || "";
export const PREFECT_API_KEY = process.env.PREFECT_API_KEY || "";

export type CoreIntegrationEnv = {
    token: string;
    userId: string;
    convexApiKey: string;
    convexUrl: string;
};

export type ConvexProjectBootstrapParams = {
    convexUrl: string;
    convexApiKey: string;
    userId: string;
    projectName: string;
    synced?: boolean;
};

export function requireEnv(key: string, message?: string): string {
    const value = process.env[key] || "";
    if (!value) {
        throw new Error(message ?? `${key} not set`);
    }
    return value;
}

export function loadCoreIntegrationEnv(): CoreIntegrationEnv {
    return {
        token: requireEnv("TEST_USER_TOKEN", "TEST_USER_TOKEN not set"),
        userId: requireEnv("TEST_USER_ID", "TEST_USER_ID not set"),
        convexApiKey: requireEnv(
            "CONVEX_HTTP_CLIENT_API_KEY",
            "CONVEX_HTTP_CLIENT_API_KEY not set"
        ),
        convexUrl: requireEnv("CONVEX_URL", "CONVEX_URL not set"),
    };
}

export async function createConvexProjectWithGrouping(
    params: ConvexProjectBootstrapParams
): Promise<{ projectId: string; projectGroupingId: string }> {
    const synced = params.synced ?? true;
    const entropy = Math.floor(Math.random() * 1_000_000);
    const groupingName = `${params.projectName}-grouping-${Date.now()}-${entropy}`;

    const groupingResponse = await axios.post(
        `${params.convexUrl}/createProjectGrouping`,
        {
            name: groupingName,
            owner: params.userId,
            synced,
            apiKey: params.convexApiKey,
        }
    );

    const projectGroupingId = groupingResponse?.data?.project_grouping_id;
    if (!projectGroupingId || typeof projectGroupingId !== "string") {
        throw new Error(
            `Convex createProjectGrouping returned invalid project_grouping_id: ${JSON.stringify(groupingResponse.data)}`
        );
    }

    const projectResponse = await axios.post(`${params.convexUrl}/createProject`, {
        text: params.projectName,
        project_grouping: projectGroupingId,
        owner: params.userId,
        synced,
        apiKey: params.convexApiKey,
    });

    const projectId = projectResponse?.data?.project_id;
    if (!projectId || typeof projectId !== "string") {
        throw new Error(
            `Convex createProject returned invalid project_id: ${JSON.stringify(projectResponse.data)}`
        );
    }

    return { projectId, projectGroupingId };
}

export function bearerAuthHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type WaitForWorkflowOptions = {
    timeoutMs?: number;
    pollIntervalMs?: number;
};

type WorkflowRunState = {
    stateType: string;
    stateName: string;
    stateMessage: string;
    raw: any;
};

const TERMINAL_SUCCESS_STATES = new Set(["COMPLETED"]);
const TERMINAL_FAILURE_STATES = new Set([
    "FAILED",
    "CRASHED",
    "CANCELLED",
    "CANCELLING",
]);
const PAUSED_STATE = "PAUSED";

function withNoTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function prefectHeaders(): Record<string, string> {
    if (!PREFECT_API_KEY) return {};
    return { Authorization: `Bearer ${PREFECT_API_KEY}` };
}

function candidatePrefectUrls(baseUrl: string, workflowId: string): string[] {
    const normalizedBase = withNoTrailingSlash(baseUrl);
    const direct = `${normalizedBase}/flow_runs/${workflowId}`;
    const withApi = `${normalizedBase}/api/flow_runs/${workflowId}`;

    // Keep order stable and deduplicate when base already ends with /api.
    return Array.from(new Set([direct, withApi]));
}

async function fetchWorkflowRun(workflowId: string): Promise<any | null> {
    const prefectApiUrl = requireEnv(
        "PREFECT_API_URL",
        "PREFECT_API_URL is required to wait on workflow runs"
    );

    for (const url of candidatePrefectUrls(prefectApiUrl, workflowId)) {
        const resp = await axios.get(url, {
            headers: prefectHeaders(),
            validateStatus: () => true,
        });
        if (resp.status === 200) {
            return resp.data;
        }
        if (resp.status === 404) {
            continue;
        }
        throw new Error(
            `Unexpected status from Prefect (${resp.status}) for ${url}: ${JSON.stringify(resp.data)}`
        );
    }
    return null;
}

async function resumeWorkflowRun(workflowId: string): Promise<void> {
    const prefectApiUrl = requireEnv(
        "PREFECT_API_URL",
        "PREFECT_API_URL is required to resume workflow runs"
    );

    for (const url of candidatePrefectUrls(prefectApiUrl, workflowId)) {
        const resumeUrl = `${url}/resume`;
        const resp = await axios.post(
            resumeUrl,
            {},
            {
                headers: prefectHeaders(),
                validateStatus: () => true,
            }
        );

        if (resp.status === 200 || resp.status === 201 || resp.status === 202) {
            return;
        }

        if (resp.status === 404) {
            continue;
        }

        throw new Error(
            `Unexpected status while resuming workflow ${workflowId} (${resp.status}) for ${resumeUrl}: ${JSON.stringify(resp.data)}`
        );
    }

    throw new Error(`Unable to resume workflow ${workflowId}: run not found`);
}

function parseWorkflowRunState(flowRun: any): WorkflowRunState {
    const stateType = String(
        flowRun?.state?.type ?? flowRun?.state_type ?? flowRun?.stateType ?? ""
    ).toUpperCase();
    const stateName = String(
        flowRun?.state?.name ?? flowRun?.state_name ?? flowRun?.stateName ?? ""
    ).toUpperCase();
    const stateMessage = String(
        flowRun?.state?.message ?? flowRun?.state_message ?? ""
    );
    return { stateType, stateName, stateMessage, raw: flowRun };
}

export async function waitForWorkflowRunTerminalState(
    workflowId: string,
    options: WaitForWorkflowOptions = {}
): Promise<WorkflowRunState> {
    const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    const pollIntervalMs = options.pollIntervalMs ?? 5000;
    const start = Date.now();

    let lastObservedState: WorkflowRunState | null = null;

    while (Date.now() - start < timeoutMs) {
        const flowRun = await fetchWorkflowRun(workflowId);
        if (!flowRun) {
            await sleep(pollIntervalMs);
            continue;
        }

        const state = parseWorkflowRunState(flowRun);
        lastObservedState = state;
        const normalized = state.stateType || state.stateName;

        if (TERMINAL_SUCCESS_STATES.has(normalized)) {
            return state;
        }

        if (normalized === PAUSED_STATE) {
            await resumeWorkflowRun(workflowId);
            await sleep(pollIntervalMs);
            continue;
        }

        if (TERMINAL_FAILURE_STATES.has(normalized)) {
            throw new Error(
                `Workflow ${workflowId} ended in ${normalized}. Message: ${state.stateMessage}`
            );
        }

        await sleep(pollIntervalMs);
    }

    throw new Error(
        `Timed out waiting for workflow ${workflowId}. Last observed state: ${JSON.stringify(lastObservedState)}`
    );
}

export type StepDependency = { step: number; prev: number };
export type StepState = Record<string, boolean>;

export function sequentialStepDependencies(lastStep: number): StepDependency[] {
    const dependencies: StepDependency[] = [];
    for (let step = 2; step <= lastStep; step += 1) {
        dependencies.push({ step, prev: step - 1 });
    }
    return dependencies;
}

export function enforceStepDependencies(
    testName: string,
    state: StepState,
    dependencies: StepDependency[]
): void {
    for (const dep of dependencies) {
        if (
            testName.includes(`Step ${dep.step}`) &&
            !state[`step${dep.prev}Completed`]
        ) {
            throw new Error(
                `Skipping Step ${dep.step} because Step ${dep.prev} did not complete`
            );
        }
    }
}
