// Vite (the development server and build tool for the React app).
// During development the app runs on port 5173 and the API on port 4000. The proxy below
// forwards /api requests and the Socket.IO chat connection to the API server, so the app
// can always use relative URLs like /api/medications.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
