import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // needed so it's reachable inside a Docker container during `npm run dev`
    port: 3000,
  },
});
