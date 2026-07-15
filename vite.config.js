import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// base = tên repo GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/hanghoa/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
