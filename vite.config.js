import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { proxy: { '/api': {
    target: 'http://127.0.0.1:8765',
    changeOrigin: true,
    configure: proxy => proxy.on('proxyReq', (proxyReq, request) => {
      // The browser sends a same-origin POST to Vite. Preserve that check
      // while translating only this trusted dev origin to the backend origin.
      if (request.headers.origin === 'http://127.0.0.1:5173') {
        proxyReq.setHeader('Origin', 'http://127.0.0.1:8765');
      }
    })
  } } },
  build: { outDir: 'dist', emptyOutDir: true }
});
