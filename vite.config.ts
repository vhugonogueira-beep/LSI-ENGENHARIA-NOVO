import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src/frontend'),
        },
    },
    server: {
        port: 5174,
        allowedHosts: [
            'engineering.lsoffice.com.br',
        ],
        proxy: {
            '/api': {
                target: 'http://localhost:3006',
                changeOrigin: true,
            }
        }
    }
});
