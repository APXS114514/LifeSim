import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 项目页部署在 /LifeSim/ 下；本地开发与预览保持根路径（ADR-0001）。
  base: process.env['LIFESIM_BASE'] ?? '/',
  plugins: [react()],
});
