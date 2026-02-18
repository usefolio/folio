import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
    API_BASE_URL,
    bearerAuthHeaders,
    createConvexProjectWithGrouping,
    loadCoreIntegrationEnv,
    sleep,
} from './test_helpers';

describe('Run Workflow Endpoint', () => {
    let token: string;
    let userId: string;
    let convexApiKey: string;
    let convexUrl: string;

    const baseURL = API_BASE_URL;

    let presignedUrl: string | null = null;
    let guid: string | null = null;
    let convexProjectId: string | null = null;

    let baselineSheetId: string | null = null;
    let industryColumnId: string | null = null;
    const sheetIds: Record<string, string> = {};
    const columnIds: Record<string, string> = {};

    beforeAll(() => {
        const env = loadCoreIntegrationEnv();
        token = env.token;
        userId = env.userId;
        convexApiKey = env.convexApiKey;
        convexUrl = env.convexUrl;
    });

    it('Step 1 - Request upload URL', async () => {
        const uploadUrlRequestBody = { fileName: 'gtm.csv' };
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
    });

    it('Step 2 - Upload file', async () => {
        if (!presignedUrl) throw new Error('No presignedUrl');
        const testFilePath = path.join(__dirname, '..', 'workflow_runner', 'gtm.csv');
        const fileData = fs.readFileSync(testFilePath);
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileData,
        });
        expect([200,201,204]).toContain(response.status);
    });

    it('Step 3 - Create project in Convex', async () => {
        const { projectId, projectGroupingId } = await createConvexProjectWithGrouping({
            convexUrl,
            convexApiKey,
            userId,
            projectName: 'test_gtm_project',
            synced: true,
        });
        convexProjectId = projectId;
        console.log('Step 3 grouping id:', projectGroupingId);
    });

    it('Step 4 - Upload dataset with GUID', async () => {
        if (!guid || !convexProjectId) throw new Error('Missing guid or project');
        const requestBody = {
            convex_project_id: convexProjectId,
            file_name: 'gtm',
            callback_url: convexUrl,
            file_id: guid,
        };
        const response = await axios.post(
            `${baseURL}/upload_dataset/with_id`,
            requestBody,
            { headers: bearerAuthHeaders(token) }
        );
        expect(response.status).toBe(200);
    });

    it('Step 5 - Create convex sheets and columns', async () => {
        if (!convexProjectId) throw new Error('No project');
        const sheetBody = {
            text: 'Baseline View',
            project_id: convexProjectId,
            filter: '1=1',
            apiKey: convexApiKey,
        };
        const sheetRes = await axios.post(`${convexUrl}/createSheet`, sheetBody);
        expect(sheetRes.status).toBe(200);
        baselineSheetId = sheetRes.data.sheet_id;
        const colRes = await axios.post(`${convexUrl}/createColumn`, {
            text: 'industry',
            project_id: convexProjectId,
            apiKey: convexApiKey,
        });
        expect(colRes.status).toBe(200);
        industryColumnId = colRes.data.column_id;

        const categories = [
            { key: 'ecommerce', name: 'e-commerce', filter: "\"industry\" LIKE '%ecommerce%'", column: 'ecomm_type' },
            { key: 'finance', name: 'finance', filter: "\"industry\" LIKE '%finance%'", column: 'fin_type' },
            { key: 'manufacturing', name: 'manufacturing', filter: "\"industry\" LIKE '%manufacturing%'", column: 'manuf_type' },
            { key: 'nonprofit', name: 'non-profit', filter: "\"industry\" LIKE '%non-profit%'", column: 'non-profit_type' },
            { key: 'other', name: 'other', filter: "\"industry\" LIKE '%other%'", column: null },
            { key: 'restaurant', name: 'restaurant', filter: "\"industry\" LIKE '%restaurant%'", column: 'resto_type' },
            { key: 'education', name: 'education', filter: "\"industry\" LIKE '%education%'", column: 'edu_type' },
            { key: 'technology', name: 'technology', filter: "\"industry\" LIKE '%technology%'", column: 'tech_type' },
            { key: 'healthcare', name: 'healthcare', filter: "\"industry\" LIKE '%healthcare%'", column: 'healthcare_type' },
        ];

        for (const c of categories) {
            const viewRes = await axios.post(`${convexUrl}/createSheet`, {
                text: c.name,
                project_id: convexProjectId,
                filter: c.filter,
                apiKey: convexApiKey,
            });
            expect(viewRes.status).toBe(200);
            sheetIds[c.key] = viewRes.data.sheet_id;

            if (c.column) {
                const cRes = await axios.post(`${convexUrl}/createColumn`, {
                    text: c.column,
                    project_id: convexProjectId,
                    apiKey: convexApiKey,
                });
                expect(cRes.status).toBe(200);
                columnIds[c.column] = cRes.data.column_id;
            }
            await sleep(100); // slight delay between requests
        }
    });

    it('Step 6 - Run workflow', async () => {
        if (!convexProjectId || !baselineSheetId || !industryColumnId) {
            throw new Error('Missing ids for workflow');
        }

        const wfPath = path.join(__dirname, 'sample_workflow.json');
        let wfText = fs.readFileSync(wfPath, 'utf-8');

        const replacements: Record<string, string> = {
            PROJECT_ID: convexProjectId,
            BASELINE_SHEET_ID: baselineSheetId,
            INDUSTRY_COLUMN_ID: industryColumnId,
            ECOMMERCE_SHEET_ID: sheetIds['ecommerce'],
            ECOMM_TYPE_COLUMN_ID: columnIds['ecomm_type'],
            FINANCE_SHEET_ID: sheetIds['finance'],
            FIN_TYPE_COLUMN_ID: columnIds['fin_type'],
            MANUFACTURING_SHEET_ID: sheetIds['manufacturing'],
            MANUF_TYPE_COLUMN_ID: columnIds['manuf_type'],
            NONPROFIT_SHEET_ID: sheetIds['nonprofit'],
            NONPROFIT_TYPE_COLUMN_ID: columnIds['non-profit_type'],
            OTHER_SHEET_ID: sheetIds['other'],
            RESTAURANT_SHEET_ID: sheetIds['restaurant'],
            RESTO_TYPE_COLUMN_ID: columnIds['resto_type'],
            EDUCATION_SHEET_ID: sheetIds['education'],
            EDU_TYPE_COLUMN_ID: columnIds['edu_type'],
            TECHNOLOGY_SHEET_ID: sheetIds['technology'],
            TECH_TYPE_COLUMN_ID: columnIds['tech_type'],
            HEALTHCARE_SHEET_ID: sheetIds['healthcare'],
            HEALTH_TYPE_COLUMN_ID: columnIds['healthcare_type'],
            CALLBACK_URL: convexUrl,
        };

        for (const [token, value] of Object.entries(replacements)) {
            if (value) {
                const regex = new RegExp(token, 'g');
                wfText = wfText.replace(regex, value);
            }
        }

        const wfObj = JSON.parse(wfText);
        const body = { requests: wfObj.requests, workflow_type: 'literal' };
        const resp = await axios.post(
            `${baseURL}/run_workflow`,
            body,
            { headers: bearerAuthHeaders(token) }
        );
        expect(resp.status).toBe(200);
        expect(resp.data).toHaveProperty('workflow_id');
    });
});
