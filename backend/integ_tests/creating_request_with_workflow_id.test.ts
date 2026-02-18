import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { CALL_CENTER_CLASSIFICATION_PROMPT } from './prompts';
import {
    API_BASE_URL,
    bearerAuthHeaders,
    createConvexProjectWithGrouping,
    loadCoreIntegrationEnv,
} from './test_helpers';

describe('Creating New Project & Creating Column', () => {
    // Environment variables
    let token: string;
    let userId: string;
    let convexApiKey: string;
    let convexUrl: string;

    // Shared data across steps
    let presignedUrl: string | null = null;
    let guid: string | null = null;
    let convexProjectId: string | null = null;

    const baseURL = API_BASE_URL; // Your FastAPI server address

    // --------------------------------------------------------------------------
    // Load ENV variables before any tests
    // --------------------------------------------------------------------------
    beforeAll(() => {
        const env = loadCoreIntegrationEnv();
        token = env.token;
        userId = env.userId;
        convexApiKey = env.convexApiKey;
        convexUrl = env.convexUrl;
    });

    // --------------------------------------------------------------------------
    // STEP 1: Request the presigned upload URL
    // --------------------------------------------------------------------------
    it('Step 1 - Request the upload URL from /asset_storage/upload_url', async () => {
        const uploadUrlRequestBody = {
            fileName: 'my_test_file.jpg',
        };

        const uploadUrlResponse = await axios.post(
            `${baseURL}/asset_storage/upload_url`,
            uploadUrlRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(uploadUrlResponse.status).toBe(200);
        expect(uploadUrlResponse.data).toHaveProperty('url');
        expect(uploadUrlResponse.data).toHaveProperty('guid');

        // Store the results for the next step
        presignedUrl = uploadUrlResponse.data.url;
        guid = uploadUrlResponse.data.guid;

        console.log('Step 1 complete: Presigned URL:', presignedUrl);
        console.log('Step 1 complete: GUID:', guid);
    });

    // --------------------------------------------------------------------------
    // STEP 2: Upload a file to the returned presigned URL
    // --------------------------------------------------------------------------
    it('Step 2 - Upload a file (test.parquet) using the presigned URL (via fetch)', async () => {
        if (!presignedUrl) {
            throw new Error('No presignedUrl found from Step 1!');
        }

        // Read file data
        const filePath = path.join(__dirname, 'test.parquet');
        const fileData = fs.readFileSync(filePath);

        // Get file size to set Content-Length (if needed)
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;

        // Perform the PUT request using fetch
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileData,
            headers: {
                // 'Accept-Encoding': 'gzip, deflate, zstd',
                // 'Accept': '*/*',
                // 'Connection': 'keep-alive',
                // 'Content-Length': fileSizeInBytes.toString(),
            },
        });

        // S3 (or your presigned endpoint) might return 200, 201, or 204 on success
        expect([200, 201, 204]).toContain(response.status);

        console.log('Step 2 complete: File successfully uploaded to:', presignedUrl);
    });

    // --------------------------------------------------------------------------
    // STEP 3: Create a project in Convex by calling POST ${CONVEX_URL}/createProject
    // --------------------------------------------------------------------------
    it('Step 3 - Create a project in Convex', async () => {
        const { projectId, projectGroupingId } = await createConvexProjectWithGrouping({
            convexUrl,
            convexApiKey,
            userId,
            projectName: 'some_name',
            synced: true,
        });
        convexProjectId = projectId;
        console.log('Step 3 grouping id:', projectGroupingId);

        console.log('Step 3 complete: Created Convex Project:', convexProjectId);
    });

    // --------------------------------------------------------------------------
    // STEP 4: Call /upload_dataset/with_id using the GUID & newly created project_id
    // --------------------------------------------------------------------------
    it('Step 4 - Call /upload_dataset/with_id with the GUID & Convex project ID', async () => {
        if (!guid) {
            throw new Error('No GUID found from Step 1!');
        }
        if (!convexProjectId) {
            throw new Error('No project_id found from Step 3!');
        }

        const withIdRequestBody = {
            convex_project_id: convexProjectId,
            file_name: 'test', // or your actual file name
            callback_url: convexUrl, // or whichever URL you need
            file_id: guid,
        };

        const withIdResponse = await axios.post(
            `${baseURL}/upload_dataset/with_id`,
            withIdRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(withIdResponse.status).toBe(200);
        expect(withIdResponse.data).toHaveProperty('columns');
        expect(withIdResponse.data).toHaveProperty('job_id');

        console.log('Status', withIdResponse.status);
        console.log('Body', withIdResponse.data);
    });

    // --------------------------------------------------------------------------
    // STEP 5: Call /process to create new columnn with multiple inputs
    // -------------------------------------------------------------------------
    it('Step 5 - Call /process to create new column with no columns', async () => {
        if (!convexProjectId) {
            throw new Error('No project_id found from Step 3!');
        }

        const processDataRequestBody = {
            convex_project_id: convexProjectId,
            convex_column_id: '1234',
            column_name: 'new_column',
            prompt: CALL_CENTER_CLASSIFICATION_PROMPT,
            sql_condition: '1=1',
            output_name: 'new_column',
            callback_url: convexUrl,
            workflow_id: '1234',
            prompt_input_columns: ["name", "id"]
        };

        const createColumnResponse = await axios.post(
            `${baseURL}/process`,
            processDataRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(createColumnResponse.status).toBe(200);
        expect(createColumnResponse.data).toHaveProperty('job_id');
        expect(createColumnResponse.data).toHaveProperty('items_to_process');

    });

});
