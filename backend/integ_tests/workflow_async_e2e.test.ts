import axios from "axios";
import fs from "fs";
import path from "path";
import {
    API_BASE_URL,
    PREFECT_API_URL,
    bearerAuthHeaders,
    createConvexProjectWithGrouping,
    loadCoreIntegrationEnv,
    sleep,
    waitForWorkflowRunTerminalState,
} from "./test_helpers";

jest.setTimeout(20 * 60 * 1000);

const describeIfPrefectConfigured = PREFECT_API_URL ? describe : describe.skip;

function buildStructuredPrompt(inputColumn: string) {
    return {
        model: "gpt-4o-mini",
        system_prompt: "You classify values into short categories.",
        user_prompt_template: `Classify this value: {{${inputColumn}}}`,
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "Classification",
                schema: {
                    type: "object",
                    properties: {
                        extraction_keyword: {
                            type: "string",
                        },
                    },
                    required: ["extraction_keyword"],
                },
            },
        },
        extraction_keyword: "extraction_keyword",
    };
}

async function waitForColumns(
    baseURL: string,
    token: string,
    convexProjectId: string,
    expectedColumns: string[],
    timeoutMs: number = 3 * 60 * 1000,
    pollMs: number = 5000
): Promise<string[]> {
    const startedAt = Date.now();
    let latestColumns: string[] = [];

    while (Date.now() - startedAt < timeoutMs) {
        const response = await axios.post(
            `${baseURL}/columns/list`,
            { convex_project_id: convexProjectId },
            { headers: bearerAuthHeaders(token) }
        );

        latestColumns = response.data.columns || [];
        const hasAll = expectedColumns.every((col) => latestColumns.includes(col));
        if (hasAll) {
            return latestColumns;
        }

        await sleep(pollMs);
    }

    throw new Error(
        `Timed out waiting for columns ${expectedColumns.join(", ")}. Last seen: ${latestColumns.join(", ")}`
    );
}

describeIfPrefectConfigured("Workflow Async E2E", () => {
    let token: string;
    let userId: string;
    let convexApiKey: string;
    let convexUrl: string;

    beforeAll(() => {
        const env = loadCoreIntegrationEnv();
        token = env.token;
        userId = env.userId;
        convexApiKey = env.convexApiKey;
        convexUrl = env.convexUrl;
    });

    it("runs a literal workflow and waits for terminal completion", async () => {
        const runId = Date.now().toString();
        const baseURL = API_BASE_URL;

        // Step 1: Upload CSV
        const uploadUrlResponse = await axios.post(
            `${baseURL}/asset_storage/upload_url`,
            { fileName: `workflow_async_${runId}.csv` },
            { headers: bearerAuthHeaders(token) }
        );
        expect(uploadUrlResponse.status).toBe(200);
        const presignedUrl = uploadUrlResponse.data.url as string;
        const guid = uploadUrlResponse.data.guid as string;

        const csvPath = path.join(__dirname, "test.csv");
        const fileData = fs.readFileSync(csvPath);
        const uploadResponse = await fetch(presignedUrl, {
            method: "PUT",
            body: fileData,
        });
        expect([200, 201, 204]).toContain(uploadResponse.status);

        // Step 2: Create Convex project and ingest dataset
        const { projectId: convexProjectId, projectGroupingId } = await createConvexProjectWithGrouping({
            convexUrl,
            convexApiKey,
            userId,
            projectName: `workflow-async-${runId}`,
            synced: true,
        });
        console.log("Step 2 grouping id:", projectGroupingId);

        const uploadDatasetResponse = await axios.post(
            `${baseURL}/upload_dataset/with_id`,
            {
                convex_project_id: convexProjectId,
                file_name: "workflow_async_test",
                callback_url: convexUrl,
                file_id: guid,
            },
            { headers: bearerAuthHeaders(token) }
        );
        expect(uploadDatasetResponse.status).toBe(200);

        // Step 3: Create Convex resources referenced by workflow steps
        const baseSheetResponse = await axios.post(`${convexUrl}/createSheet`, {
            text: `wf-base-${runId}`,
            project_id: convexProjectId,
            filter: "1=1",
            apiKey: convexApiKey,
        });
        expect(baseSheetResponse.status).toBe(200);
        const baseSheetId = baseSheetResponse.data.sheet_id as string;

        const firstColumnName = `wf_industry_${runId}`;
        const secondColumnName = `wf_industry_detail_${runId}`;

        const firstColumnResponse = await axios.post(`${convexUrl}/createColumn`, {
            text: firstColumnName,
            project_id: convexProjectId,
            apiKey: convexApiKey,
        });
        expect(firstColumnResponse.status).toBe(200);
        const firstColumnId = firstColumnResponse.data.column_id as string;

        const secondColumnResponse = await axios.post(`${convexUrl}/createColumn`, {
            text: secondColumnName,
            project_id: convexProjectId,
            apiKey: convexApiKey,
        });
        expect(secondColumnResponse.status).toBe(200);
        const secondColumnId = secondColumnResponse.data.column_id as string;

        const ts = new Date().toISOString();
        const workflowRequests = [
            {
                timestamp: ts,
                path: "/create_view",
                request_data: {
                    convex_project_id: convexProjectId,
                    convex_sheet_id: baseSheetId,
                    sql_filter: "1=1",
                    callback_url: convexUrl,
                },
            },
            {
                timestamp: ts,
                path: "/process",
                request_data: {
                    convex_project_id: convexProjectId,
                    convex_column_id: firstColumnId,
                    column_name: firstColumnName,
                    prompt: buildStructuredPrompt("name"),
                    sql_condition: "1=1",
                    output_name: firstColumnName,
                    prompt_input_columns: ["name"],
                    workflow_id: null,
                    api_keys: {},
                    callback_url: convexUrl,
                },
            },
            {
                timestamp: ts,
                path: "/process",
                request_data: {
                    convex_project_id: convexProjectId,
                    convex_column_id: secondColumnId,
                    column_name: secondColumnName,
                    prompt: buildStructuredPrompt(firstColumnName),
                    sql_condition: `"${firstColumnName}" IS NOT NULL`,
                    output_name: secondColumnName,
                    prompt_input_columns: [firstColumnName],
                    workflow_id: null,
                    api_keys: {},
                    callback_url: convexUrl,
                },
            },
        ];

        // Step 4: Trigger workflow and wait for Prefect terminal state
        const runWorkflowResponse = await axios.post(
            `${baseURL}/run_workflow`,
            { requests: workflowRequests, workflow_type: "literal" },
            { headers: bearerAuthHeaders(token) }
        );

        expect(runWorkflowResponse.status).toBe(200);
        const workflowId = runWorkflowResponse.data.workflow_id as string;
        expect(workflowId).toBeTruthy();

        const workflowState = await waitForWorkflowRunTerminalState(workflowId, {
            timeoutMs: Number(process.env.WORKFLOW_E2E_TIMEOUT_MS || 15 * 60 * 1000),
            pollIntervalMs: Number(process.env.WORKFLOW_E2E_POLL_MS || 5000),
        });
        expect(workflowState.stateType || workflowState.stateName).toBe("COMPLETED");

        // Step 5: Verify materialized side effects in backend data model
        const columns = await waitForColumns(
            baseURL,
            token,
            convexProjectId,
            [firstColumnName, secondColumnName]
        );

        expect(columns).toContain(firstColumnName);
        expect(columns).toContain(secondColumnName);
    });
});
