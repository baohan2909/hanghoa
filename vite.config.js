import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base tuyệt đối theo tên repo GitHub Pages (baohan2909.github.io/nscare/)
export default defineConfig({
  plugins: [react()],
  base: '/nscare/',
  build: { outDir: 'dist', sourcemap: false }
})
