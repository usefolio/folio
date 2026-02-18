import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file only if it exists
if (fs.existsSync('.env')) {
  dotenv.config();
}

// Fall back to API local env for variables not defined in integ_tests/.env
const apiEnvLocalPath = path.resolve('..', 'api', '.env.local');
if (fs.existsSync(apiEnvLocalPath)) {
  dotenv.config({ path: apiEnvLocalPath, override: false });
}

axios.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;
      console.error(`${method} ${url} - ${status}`);
    }
    return Promise.reject(error);
  }
);
