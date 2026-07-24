import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    port: 3000,
    host: '::',
    proxy: {
      // Proxy MCP JSON-RPC calls to SecB MCP server when running
      '/mcp': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mcp/, '')
      }
    }
  }
});
