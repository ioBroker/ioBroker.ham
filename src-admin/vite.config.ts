import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
        build: {
            outDir: 'build',
        },
        plugins: [react()],
        // the tab is served from /adapter/ham/tab_m.html, so all URLs must be relative
        base: './',
        server: {
            port: 3000,
            proxy: {
                '/adapter': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                    secure: false,
                },
                '/files': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    };
});
