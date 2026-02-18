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
} from './test_helpers';

enum UploadType {
    Media = 'media',
    Dataset = 'dataset'
}

const fileName = "test.csv";
const filePath = fileName;
const uploadType = UploadType.Dataset;
const inputColumn = "name";
const contentType = null;
const fileExtension = path.extname(filePath).substring(1);

describe(`Integration Test with ${fileName} (${uploadType})`, () => {
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
    let convexViewId: string | null = null;

    const baseURL = API_BASE_URL;

    let testState = {
        step1Completed: false,
        step2Completed: false,
        step3Completed: false,
        step4Completed: false,
        step5Completed: false,
        step6Completed: false,
        step7Completed: false,
        step8Completed: false,
    };

    // This runs before each test
    beforeEach(() => {
        const testName = expect.getState().currentTestName || '';
        enforceStepDependencies(testName, testState, sequentialStepDependencies(9));
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
            "convex_column_id": "test",
            "column_name": "issues",
            "prompt": {
                "model": "gpt-4o-mini",
                "system_prompt": "You are a name specialist.",
                "user_prompt_template": `You are a name specialist. You are given a list of names and you need to classify them into one of the following categories: Rare, Common, Exccentric, Other. Classify the following names into the correct category: {{${inputColumn}}}`,
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
                                            "Exccentric",
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

        console.log(`Step 1 complete for ${fileName}: GUID:`, guid);
        testState.step1Completed = true;
    });

    it(`Step 2 - Upload file (${fileName})`, async () => {
        if (!presignedUrl) throw new Error('No presignedUrl found from Step 1!');

        // Read file data
        const testFilePath = path.join(__dirname, filePath);
        const fileData = fs.readFileSync(testFilePath);

        // Prepare headers
        const headers: HeadersInit = contentType ? { 'Content-Type': contentType } : {};

        // Upload file
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileData,
            headers,
        });

        expect([200, 201, 204]).toContain(response.status);
        console.log(`Step 2 complete for ${fileName}: File uploaded`);
        testState.step2Completed = true;
    });

    it('Step 3 - Create a project in Convex', async () => {
        const { projectId, projectGroupingId } = await createConvexProjectWithGrouping({
            convexUrl,
            convexApiKey,
            userId,
            projectName: `test_${fileExtension}_project`,
            synced: true,
        });
        convexProjectId = projectId;
        console.log(`Step 3 grouping id:`, projectGroupingId);

        console.log(`Step 3 complete for ${fileName}: Created Convex Project:`, convexProjectId);
        testState.step3Completed = true;
    });

    it(`Step 4 - Upload ${uploadType} with GUID`, async () => {
        if (!guid) throw new Error('No GUID found from Step 1!');
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        // Dataset upload format
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
        console.log('Status', response.status);
        console.log('Body', response.data);
        testState.step4Completed = true;
    });

    it('Step 5 - Estimate cost', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const estimateCostResponse = await axios.post(
            `${baseURL}/process/estimate_cost`,
            { ...processRequestBody, convex_project_id: convexProjectId },
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(estimateCostResponse.status).toBe(200);
        console.log(`Step 5 complete for ${fileName}: Cost estimate:`, estimateCostResponse.data);
        testState.step5Completed = true;
    });

    it('Step 6 - Process data', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');

        const processResponse = await axios.post(
            `${baseURL}/process`,
            { ...processRequestBody, convex_project_id: convexProjectId },
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(processResponse.status).toBe(200);
        console.log('Status', processResponse.status);
        console.log('Body', processResponse.data);
        testState.step6Completed = true;
    });

    it('Step 7 - Create a view in Convex', async () => {
        const createViewBody = {
            text: `test_${fileExtension}_view`,
            project_id: convexProjectId,
            filter: "1=1",
            apiKey: convexApiKey,
        };

        const createViewResponse = await axios.post(
            `${convexUrl}/createSheet`,
            createViewBody
        );

        expect(createViewResponse.status).toBe(200);
        convexViewId = createViewResponse.data.sheet_id;

        console.log('Status', createViewResponse.status);
        console.log('Body', createViewResponse.data);
        testState.step7Completed = true;
    });

    it('Step 8 - Create View in Backend', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');
        if (!convexViewId) throw new Error('No view_id found from Step 6!');

        const createViewRequestBody = {
            "convex_project_id": convexProjectId,
            "convex_sheet_id": convexViewId,
            "sql_filter": "1=1",
            "callback_url": convexUrl
        }

        const processResponse = await axios.post(
            `${baseURL}/create_view`,
            createViewRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(processResponse.status).toBe(200);
        console.log('Status', processResponse.status);
        console.log('Body', processResponse.data);
        testState.step8Completed = true;
    });

    it('Step 9 - Export xls from Backend', async () => {
        if (!convexProjectId) throw new Error('No project_id found from Step 3!');
        if (!convexViewId) throw new Error('No view_id found from Step 6!');

        const createExportBody = {
            "convex_project_id": convexProjectId,
            "sheet_objects": [
                {
                    column_names: ["id", "name", "age"],
                    condition: "1=1",
                    name: `test_${fileExtension}_view`,
                },
            ],
        }

        const exportResponse = await axios.post(
            `${baseURL}/export`,
            createExportBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(exportResponse.status).toBe(200);
        console.log('Status', exportResponse.status);
        console.log('Body', exportResponse.data);
    });


});
