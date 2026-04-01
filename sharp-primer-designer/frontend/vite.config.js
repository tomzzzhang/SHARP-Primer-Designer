import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // SSE (Server-Sent Events) requires no proxy timeout
        configure: (proxy) => {
          proxy.on('error', (err) => console.error('[proxy error]', err))
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.url?.includes('/stream')) {
              _proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
        },
        // Disable proxy timeout for streaming endpoints
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
