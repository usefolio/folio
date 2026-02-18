import axios from 'axios';
import { API_BASE_URL, requireEnv } from './test_helpers';

describe('System Key Workflow Auth', () => {
  it('rejects run_workflow when system key request has no resolvable user context', async () => {
    const systemKey = requireEnv('FOLIO_API_KEY', 'FOLIO_API_KEY not set');

    const response = await axios.post(
      `${API_BASE_URL}/run_workflow`,
      {
        requests: [],
        workflow_type: 'literal',
      },
      {
        headers: {
          'X-System-Key': systemKey,
        },
        validateStatus: () => true,
      }
    );

    expect(response.status).toBe(401);
    expect(String(response.data?.detail || '')).toContain(
      'System-key workflow calls must resolve to a user'
    );
  });
});
