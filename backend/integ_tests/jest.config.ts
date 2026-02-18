import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/*.test.ts'],
    testTimeout: 30000,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    maxWorkers: 1,
    verbose: false,
    silent: false,
};

export default config;