import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { API_BASE_URL, bearerAuthHeaders, requireEnv } from './test_helpers';

describe('Download Workflow (1 Steps)', () => {
    // Environment variables
    let token: string;

    // Shared data across steps
    let presignedUrl: string | null = null;
    let guid: string | null = null;

    const baseURL = API_BASE_URL; // Your FastAPI server address

    // --------------------------------------------------------------------------
    // Load ENV variables before any tests
    // --------------------------------------------------------------------------
    beforeAll(() => {
        token = requireEnv('TEST_USER_TOKEN', 'TEST_USER_TOKEN not set in environment variables');
    });

    // --------------------------------------------------------------------------
    // STEP 1: Create a file id by uploading a local fixture
    // --------------------------------------------------------------------------
    it('Step 1 - Upload a fixture file and request a download URL', async () => {
        const uploadUrlResponse = await axios.post(
            `${baseURL}/asset_storage/upload_url`,
            {},
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(uploadUrlResponse.status).toBe(200);
        expect(uploadUrlResponse.data).toHaveProperty('url');
        expect(uploadUrlResponse.data).toHaveProperty('guid');

        presignedUrl = uploadUrlResponse.data.url;
        guid = uploadUrlResponse.data.guid;

        if (!presignedUrl || !guid) {
            throw new Error('Missing upload URL or guid from /asset_storage/upload_url');
        }

        const fixturePath = path.join(__dirname, 'test.mp3');
        const fileData = fs.readFileSync(fixturePath);

        const uploadResponse = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileData,
        });
        expect([200, 201, 204]).toContain(uploadResponse.status);

        const downloadUrlRequestBody = {
            filename: guid,
        };

        const downloadUrlResponse = await axios.post(
            `${baseURL}/asset_storage/download_url`,
            downloadUrlRequestBody,
            {
                headers: bearerAuthHeaders(token),
            }
        );

        expect(downloadUrlResponse.status).toBe(200);
        expect(downloadUrlResponse.data).toHaveProperty('url');

        // Store the results for the next step
        presignedUrl = downloadUrlResponse.data.url;

        console.log('Step 1 complete: Presigned URL:', presignedUrl);
    });
});
