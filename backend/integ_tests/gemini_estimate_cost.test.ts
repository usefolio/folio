import axios from 'axios';
import { API_BASE_URL, bearerAuthHeaders, requireEnv } from './test_helpers';

describe('Gemini Cost Estimation', () => {
    const baseURL = API_BASE_URL;
    let token: string;

    beforeAll(() => {
        token = requireEnv('TEST_USER_TOKEN', 'TEST_USER_TOKEN not set in environment variables');
    });

    it('returns token estimate for gemini flash prompt', async () => {
        const requestBody = {
            convex_project_id: process.env.CONVEX_PROJECT_ID || 'test-project',
            convex_column_id: 'test-column',
            column_name: 'gemini_estimate',
            prompt: {
                model: 'gemini-2.5-flash',
                system_prompt: 'You are an analyst who extracts concise insights.',
                user_prompt_template: 'Provide a concise insight about quarterly performance changes.',
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'Insight',
                        schema: {
                            type: 'object',
                            properties: {
                                insight: {
                                    type: 'string'
                                }
                            },
                            required: ['insight']
                        }
                    }
                }
            },
            sql_condition: '1=1',
            output_name: 'insight',
            prompt_input_columns: []
        };

        const response = await axios.post(
            `${baseURL}/process/estimate_cost`,
            requestBody,
            {
                headers: bearerAuthHeaders(token)
            }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('total_tokens');
        expect(response.data).toHaveProperty('total_price');
        expect(response.data.total_tokens).toBeGreaterThan(0);
        expect(response.data.total_price).toBeGreaterThan(0);
    });
});
