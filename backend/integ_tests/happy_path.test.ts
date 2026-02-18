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

// Define upload types enum
enum UploadType {
    Media = 'media',
    Dataset = 'dataset'
}

// File configurations to test
const fileConfigs = [
    { filePath: 'test.csv', inputColumn: "name", upload_type: UploadType.Dataset, contentType: null },
    { filePath: 'test.parquet', inputColumn: "name", upload_type: UploadType.Dataset, contentType: null },
    {
        files: [
            { filePath: 'test.mp3', contentType: 'audio/mpeg' },
            { filePath: 'test2.mp3', contentType: 'audio/mpeg' }
        ],
        inputColumn: "content",
        upload_type: UploadType.Media,
        fileType: 'audio'
    },
    {
        files: [
            { filePath: 'test.pdf', contentType: 'application/pdf' },
            { filePath: 'test2.pdf', contentType: 'application/pdf' }
        ],
        inputColumn: "content",
        upload_type: UploadType.Media,
        fileType: 'pdf'
    }
];

// Process each file configuration
fileConfigs.forEach((config) => {
    // Handle both single file and multiple file configurations
    if ('filePath' in config) {
        // Single file case (Dataset)
        const { filePath, inputColumn, upload_type } = config;
        runTest(filePath as string, inputColumn, upload_type, null);
    } else if ('files' in config) {
        // Multiple files case (Media)
        const { files, inputColumn, upload_type, fileType } = config;
        runMultiFileTest(files, inputColumn, upload_type, fileType);
    }
});

// Run test for single file uploads (Dataset type)
function runTest(filePath: string, inputColumn: string, upload_type: UploadType, contentType: string | null) {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath).substring(1);

    describe(`Integration Test with ${fileName} (${upload_type})`, () => {
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

        let testState = {
            step1Completed: false,
            step2Completed: false,
            step3Completed: false,
            step4Completed: false,
            step5Completed: false
        };

        // This runs before each test
        beforeEach(() => {
            const testName = expect.getState().currentTestName || '';
            enforceStepDependencies(testName, testState, sequentialStepDependencies(6));
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
            console.log(`Step 3 grouping id for ${fileName}:`, projectGroupingId);

            console.log(`Step 3 complete for ${fileName}: Created Convex Project:`, convexProjectId);
            testState.step3Completed = true;
        });

        it(`Step 4 - Upload ${upload_type} with GUID`, async () => {
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
            console.log('Status', estimateCostResponse.status);
            console.log('Body', estimateCostResponse.data);
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
        });
    });
}

// Run test for multiple file uploads (Media type)
function runMultiFileTest(files: Array<{ filePath: string, contentType: string }>,
    inputColumn: string,
    upload_type: UploadType,
    fileType: string) {

    describe(`Integration Test with multiple ${fileType} files (${upload_type})`, () => {
        // Environment variables
        let token: string;
        let userId: string;
        let convexApiKey: string;
        let convexUrl: string;

        // Shared data across steps
        let fileGuids: string[] = [];
        let presignedUrls: { [filepath: string]: string } = {};
        let convexProjectId: string | null = null;
        let processRequestBody: any;

        const baseURL = API_BASE_URL;

        // Load ENV variables before any tests
        beforeAll(() => {
            const env = loadCoreIntegrationEnv();
            token = env.token;
            userId = env.userId;
            convexApiKey = env.convexApiKey;
            convexUrl = env.convexUrl;

            // Process request body setup - for media files too
            processRequestBody = {
                "convex_column_id": "test",
                "column_name": "issues",
                "prompt": {
                    "model": "gpt-4o-mini",
                    "system_prompt": "You are a quality assesor.",
                    "user_prompt_template": `Analyze the following ${inputColumn} and provide insights.`,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "Analysis",
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "extraction_keyword": {
                                        "type": "array",
                                        "items": {
                                            "type": "string",
                                            "enum": [
                                                "High Quality",
                                                "Medium Quality",
                                                "Low Quality",
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
                "prompt_input_columns": inputColumn ? [inputColumn] : [],
                "workflow_id": "0",
                "callback_url": convexUrl
            };
        });

        let testState = {
            step1Completed: false,
            step2Completed: false,
            step3Completed: false,
            step4Completed: false,
            step5Completed: false
        };

        // This runs before each test
        beforeEach(() => {
            const testName = expect.getState().currentTestName || '';
            enforceStepDependencies(testName, testState, sequentialStepDependencies(6));
        });

        // Step 1: Request presigned URLs with proper headers
        it('Step 1 - Request upload URLs for all files', async () => {
            // Clear any existing data
            fileGuids = [];
            presignedUrls = {};

            // Request presigned URLs for each file
            for (const file of files) {
                const fileName = path.basename(file.filePath);

                const uploadUrlRequestBody = {
                    fileName: fileName,
                    ...(file.contentType ? { content_type: file.contentType } : {})
                };

                const headers = bearerAuthHeaders(token);

                const uploadUrlResponse = await axios.post(
                    `${baseURL}/asset_storage/upload_url`,
                    uploadUrlRequestBody,
                    { headers }
                );

                expect(uploadUrlResponse.status).toBe(200);
                expect(uploadUrlResponse.data).toHaveProperty('url');
                expect(uploadUrlResponse.data).toHaveProperty('guid');

                // Store the presigned URL and GUID
                presignedUrls[file.filePath] = uploadUrlResponse.data.url;
                fileGuids.push(uploadUrlResponse.data.guid);

                console.log(`Step 1: Got presigned URL for ${fileName}, GUID: ${uploadUrlResponse.data.guid}`);
            }

            // Verify we have the right number of URLs and GUIDs
            expect(Object.keys(presignedUrls).length).toBe(files.length);
            expect(fileGuids.length).toBe(files.length);

            console.log(`Step 1 complete: Got ${fileGuids.length} GUIDs`);
            testState.step1Completed = true;
        });

        // Step 2: Upload files with proper headers for S3 presigned URLs
        it('Step 2 - Upload all files using presigned URLs', async () => {
            // Upload each file
            for (const file of files) {
                const presignedUrl = presignedUrls[file.filePath];
                if (!presignedUrl) {
                    throw new Error(`No presignedUrl found for ${file.filePath}!`);
                }

                // Read file data
                const testFilePath = path.join(__dirname, file.filePath);
                const fileData = fs.readFileSync(testFilePath);

                // Set headers for S3 upload - for presigned URLs, do NOT include Authorization 
                // but DO include Content-Type if available
                const headers: HeadersInit = {};

                if (file.contentType) {
                    headers['Content-Type'] = file.contentType;
                }

                // Upload file
                const response = await fetch(presignedUrl, {
                    method: 'PUT',
                    body: fileData,
                    headers,
                });

                expect([200, 201, 204]).toContain(response.status);
                console.log(`Step 2: Uploaded ${file.filePath}`);
            }

            console.log(`Step 2 complete: Uploaded ${files.length} files`);

            testState.step2Completed = true;
        });

        it('Step 3 - Create a project in Convex', async () => {
            const { projectId, projectGroupingId } = await createConvexProjectWithGrouping({
                convexUrl,
                convexApiKey,
                userId,
                projectName: `test_${fileType}_project`,
                synced: true,
            });
            convexProjectId = projectId;
            console.log(`Step 3 grouping id for ${fileType}:`, projectGroupingId);

            console.log(`Step 3 complete: Created Convex Project: ${convexProjectId}`);
            testState.step3Completed = true;
        });

        it(`Step 4 - Upload multiple files with GUIDs`, async () => {
            if (fileGuids.length === 0) {
                throw new Error('No GUIDs found from Step 1!');
            }
            if (!convexProjectId) {
                throw new Error('No project_id found from Step 3!');
            }

            // Media upload format with multiple file_ids
            const requestBody = {
                convex_project_id: convexProjectId,
                callback_url: convexUrl,
                file_ids: fileGuids,
                file_type: fileType
            };

            console.log(`Request body for Step 4:`, requestBody)

            const response = await axios.post(
                `${baseURL}/upload_dataset/with_ids`,
                requestBody,
                {
                    headers: bearerAuthHeaders(token),
                }
            );

            expect(response.status).toBe(200);
            console.log('Status', response.status);
            console.log('Body', response.data);

            await sleep(10000); // Wait for 5 seconds before proceeding
            testState.step4Completed = true;

        });

        // Add Step 5 - Estimate cost
        it('Step 5 - Call /process/estimate_cost to get token cost', async () => {
            if (!convexProjectId) {
                throw new Error('No project_id found from Step 3!');
            }

            const estimateCostResponse = await axios.post(
                `${baseURL}/process/estimate_cost`,
                { ...processRequestBody, convex_project_id: convexProjectId },
                {
                    headers: bearerAuthHeaders(token),
                }
            );

            expect(estimateCostResponse.status).toBe(200);
            expect(estimateCostResponse.data).toHaveProperty('total_tokens');
            expect(estimateCostResponse.data).toHaveProperty('total_price');

            console.log('Status', estimateCostResponse.status);
            console.log('Body', estimateCostResponse.data);
            testState.step5Completed = true;
        }, 60000);

        // Add Step 6 - Process the data
        it('Step 6 - Call /process to process the data', async () => {
            if (!convexProjectId) {
                throw new Error('No project_id found from Step 3!');
            }

            const processResponse = await axios.post(
                `${baseURL}/process`,
                { ...processRequestBody, convex_project_id: convexProjectId },
                {
                    headers: bearerAuthHeaders(token),
                }
            );

            expect(processResponse.status).toBe(200);
            expect(processResponse.data).toHaveProperty('job_id');

            console.log('Status', processResponse.status);
            console.log('Body', processResponse.data);
        }, 60000);
    });
}
