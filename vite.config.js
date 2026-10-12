import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const webMode = process.env.VITE_WEB_MODE === 'true';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'web-beta-pwa-links',
    transformIndexHtml(html) {
      if (!webMode) return html;
      return html.replace('</head>', '    <link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="/icons/icon-192.png" />\n  </head>');
    }
  }],
  define: { 'import.meta.env.VITE_WEB_MODE': JSON.stringify(webMode) },
  resolve: webMode ? {
    alias: { '@huggingface/transformers': fileURLToPath(new URL('./src/transformers-web-stub.js', import.meta.url)) }
  } : undefined,
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
  build: { outDir: webMode ? 'dist-web' : 'dist', emptyOutDir: true }
});
