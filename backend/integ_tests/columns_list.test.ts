import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
    API_BASE_URL,
    bearerAuthHeaders,
    createConvexProjectWithGrouping,
    enforceStepDependencies,
    loadCoreIntegrationEnv,
    sequentialStepDependencies,
    sleep,
} from './test_helpers';

describe('Columns List Integration Test', () => {
    // Environment variables
    let token: string;
    let userId: string;
    let convexApiKey: string;
    let convexUrl: string;

    // Shared data across steps
    let presignedUrl: string | null = null;
    let guid: string | null = null;
    let convexProjectId: string | null = null;
    let processRequestBody: any;

    const baseURL = API_BASE_URL;
    const fileName = "test.csv";
    const filePath = fileName;
    const inputColumn = "name";
    const fileExtension = path.extname(filePath).substring(1);

    const testState: Record<string, boolean> = {
        step1Completed: false,
        step2Completed: false,
        step3Completed: false,
        step4Completed: false,
        step5Completed: false,
        step6Completed: false,
        step7Completed: false
    };

    // This runs before each test
    beforeEach(() => {
        const testName = expect.getState().currentTestName || '';
        enforceStepDependencies(testName, testState, sequentialStepDependencies(7));
    });

    // Load ENV variables before any tests
    beforeAll(() => {
        const env = loadCoreIntegrationEnv();
        token = env.token;
        userId = env.userId;
        convexApiKey = env.convexApiKey;
        convexUrl = env.convexUrl;

        // Process request body setup
        processRequestBody = {
            "convex_column_id": "test_column",
            "column_name": "test_column_names",
            "prompt": {
                "model": "gpt-4o-mini",
                "system_prompt": "You are a name specialist.",
                "user_prompt_template": `You are a name specialist. You are given a list of names and you need to classify them into one of the following categories: Rare, Common, Eccentric, Other. Classify the following names into the correct category: {{${inputColumn}}}`,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "Classification",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "extraction_keyword": {
                                    "type": "array",
                                    "items": {
                                        "type": "string",
                                        "enum": [
                                            "Rare",
                                            "Common",
                                            "Eccentric",
                                            "Other"
                                        ]
                                    }
                                }
                            },
                            "required": [
                                "extraction_keyword"
                            ]
                        }
                    }
                },
                "extraction_keyword": "extraction_keyword"
            },
            "sql_condition": "1=1",
            "output_name": "extraction_keyword",
            "prompt_input_columns": [inputColumn],
            "workflow_id": "0",
            "callback_url": convexUrl
        };
    });

    it('Step 1 - Request the upload URL', async () => {
        const uploadUrlRequestBody = {
            fileName: fileName,
        };

        const uploadUrlResponse = await axios.post(
            `${baseURL}/asset_storage/upload_url`,
            uploadUrlRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(uploadUrlResponse.status).toBe(200);
        presignedUrl = uploadUrlResponse.data.url;
        guid = uploadUrlResponse.data.guid;

        console.log(`Step 1 complete: GUID:`, guid);
        testState.step1Completed = true;
    });

    it(`Step 2 - Upload file (${fileName})`, async () => {
        if (!presignedUrl) throw new Error('No presignedUrl found from Step 1!');

        // Read file data
        const testFilePath = path.join(__dirname, filePath);
        const fileData = fs.readFileSync(testFilePath);

        // Upload file
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileData,
        });

        expect([200, 201, 204]).toContain(response.status);
        console.log(`Step 2 complete: File uploaded`);
        testState.step2Completed = true;
    });

    it('Step 3 - Create a project in Convex', async () => {
        const { projectId, projectGroupingId } = await createConvexProjectWithGrouping({
            convexUrl,
            convexApiKey,
            userId,
            projectName: 'test_columns_project',
            synced: true,
        });
        convexProjectId = projectId;
        console.log(`Step 3 grouping id:`, projectGroupingId);

        console.log(`Step 3 complete: Created Convex Project:`, convexProjectId);
        testState.step3Completed = true;
    });

    it(`Step 4 - Upload dataset with GUID`, async () => {
        if (!guid) throw new Error('No GUID found from Step 1!');
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const requestBody = {
            convex_project_id: convexProjectId,
            file_name: "test",
            callback_url: convexUrl,
            file_id: guid,
        };

        const response = await axios.post(
            `${baseURL}/upload_dataset/with_id`,
            requestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(response.status).toBe(200);
        console.log('Step 4 complete: Dataset uploaded');
        testState.step4Completed = true;
    });

    it('Step 5 - Test columns list before creating new column', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const columnsListRequestBody = {
            convex_project_id: convexProjectId,
        };

        const columnsListResponse = await axios.post(
            `${baseURL}/columns/list`,
            columnsListRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(columnsListResponse.status).toBe(200);
        expect(columnsListResponse.data).toHaveProperty('columns');
        expect(Array.isArray(columnsListResponse.data.columns)).toBe(true);

        const columnsBefore = columnsListResponse.data.columns;
        console.log('Step 5 complete: Columns before creating new column:', columnsBefore);

        // Verify that our test column is not yet present
        expect(columnsBefore).not.toContain(processRequestBody.column_name);

        // Verify that folio-specific columns are filtered out
        const folioInternalColumns = [
            '_folio_internal_id',
            '_folio_row_order', 
            'external_data_row_id'
        ];
        
        folioInternalColumns.forEach(internalColumn => {
            expect(columnsBefore).not.toContain(internalColumn);
        });

        testState.step5Completed = true;
    });

    it('Step 6 - Process data to create new column', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const processResponse = await axios.post(
            `${baseURL}/process`,
            { ...processRequestBody, convex_project_id: convexProjectId },
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(processResponse.status).toBe(200);
        console.log('Step 6 complete: New column created');
        testState.step6Completed = true;

        // Wait a bit for the column to be created
        await sleep(2000);
    });

    it('Step 7 - Test columns list after creating new column', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const columnsListRequestBody = {
            convex_project_id: convexProjectId,
        };

        const columnsListResponse = await axios.post(
            `${baseURL}/columns/list`,
            columnsListRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(columnsListResponse.status).toBe(200);
        expect(columnsListResponse.data).toHaveProperty('columns');
        expect(Array.isArray(columnsListResponse.data.columns)).toBe(true);

        const columnsAfter = columnsListResponse.data.columns;
        console.log('Step 7 complete: Columns after creating new column:', columnsAfter);

        // Verify that our test column is now present
        expect(columnsAfter).toContain(processRequestBody.column_name);

        // Verify that folio-specific columns are still filtered out
        const folioInternalColumns = [
            '_folio_internal_id',
            '_folio_row_order', 
            'external_data_row_id'
        ];
        
        folioInternalColumns.forEach(internalColumn => {
            expect(columnsAfter).not.toContain(internalColumn);
        });

        // Verify that tokenized columns are filtered out
        const tokenizedColumns = columnsAfter.filter((col: string) => col.startsWith('_folio_tokenized'));
        expect(tokenizedColumns.length).toBe(0);

        console.log(`Verified that new column '${processRequestBody.column_name}' is listed and internal columns are excluded`);
        testState.step7Completed = true;
    });
});
