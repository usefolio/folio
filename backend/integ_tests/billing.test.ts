import axios, { AxiosError, AxiosResponse } from 'axios';
import {
    API_BASE_URL,
    bearerAuthHeaders,
    requireEnv,
} from './test_helpers';

describe('Billing Endpoints', () => {
    let token: string;
    let userId: string;
    let apiKey: string;
    const baseURL = API_BASE_URL;
    const authHeaders = () => bearerAuthHeaders(token);

    const setupDemoPlan = async (): Promise<AxiosResponse> => {
        try {
            return await axios.post(`${baseURL}/billing/demo`, null, {
                headers: authHeaders(),
            });
        } catch (error) {
            const axiosErr = error as AxiosError;
            if (axiosErr.response) {
                return axiosErr.response;
            }
            throw error;
        }
    };

    beforeAll(() => {
        token = requireEnv('TEST_USER_TOKEN', 'TEST_USER_TOKEN not set');
        userId = requireEnv('TEST_USER_ID', 'TEST_USER_ID not set');
        apiKey = requireEnv('FOLIO_API_KEY', 'FOLIO_API_KEY not set');
    });

    it('provisions a demo plan at most once per user', async () => {
        const firstAttempt = await setupDemoPlan();
        expect([200, 409]).toContain(firstAttempt.status);

        const secondAttempt = await setupDemoPlan();

        if (firstAttempt.status === 200) {
            expect(secondAttempt.status).toBe(200);
            expect(secondAttempt.data.plan_name).toBe(firstAttempt.data.plan_name);
            expect(secondAttempt.data.plan_expires_at).toBe(
                firstAttempt.data.plan_expires_at
            );
            expect(secondAttempt.data.membership_active).toBe(true);

            const summary = await axios.get(`${baseURL}/billing/summary`, {
                headers: authHeaders(),
            });
            expect(summary.status).toBe(200);
            expect(summary.data.plan_name).toBe('basic');
            expect(summary.data.plan_expires_at).toBe(
                firstAttempt.data.plan_expires_at
            );
        } else {
            expect(secondAttempt.status).toBe(409);
            expect(secondAttempt.data.detail).toBe(firstAttempt.data.detail);
            expect(secondAttempt.data.detail).toContain('already_configured');
        }
    });

    it('sets up billing plan for user', async () => {
        const body = {
            customer_id: userId,
            plan: 'pro',
        };
        const resp = await axios.post(`${baseURL}/billing/admin/plan`, body, {
            headers: { 'X-System-Key': apiKey },
        });
        expect(resp.status).toBe(200);
    });

    it('returns billing summary', async () => {
        const resp = await axios.get(`${baseURL}/billing/summary`, {
            headers: authHeaders(),
        });
        expect(resp.status).toBe(200);
        expect(resp.data).toHaveProperty('plan_id');
        expect(resp.data).toHaveProperty('usd_remaining');
        expect(resp.data).toHaveProperty('usd_spend');
    });

    it('reports sufficient credits', async () => {
        const resp = await axios.post(
            `${baseURL}/billing/check`,
            { required_credits: 10 },
            { headers: authHeaders() }
        );
        expect(resp.status).toBe(200);
        expect(resp.data.has_enough).toBe(true);
    });

    it('reports insufficient credits', async () => {
        const resp = await axios.post(
            `${baseURL}/billing/check`,
            { required_credits: 1000000 },
            { headers: authHeaders() }
        );
        expect(resp.status).toBe(200);
        expect(resp.data.has_enough).toBe(false);
    });
});
