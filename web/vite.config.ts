import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The FastAPI backend; override with SMOM_API_URL to develop against another port.
const API_TARGET = process.env.SMOM_API_URL ?? 'http://127.0.0.1:8000';
const HOST = '127.0.0.1';
const apiProxy = { '/api': { target: API_TARGET } };

// Libraries in their own chunks, cached across releases of the app code.
const VENDOR_CHUNKS = [
  { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 3 },
  { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/, priority: 2 },
  { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
];

export default defineConfig({
  plugins: [react()],
  server: { host: HOST, port: 5173, strictPort: true, proxy: apiProxy },
  preview: { host: HOST, port: 4173, strictPort: true, proxy: apiProxy },
  build: {
    outDir: 'dist',
    rolldownOptions: { output: { codeSplitting: { groups: VENDOR_CHUNKS } } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Whole-page tests that type and click take a few seconds on a busy machine: 5 s (the default) is too tight.
    testTimeout: 15_000,
  },
});
