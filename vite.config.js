import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base = tên repo GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/hanghoa/',
});
