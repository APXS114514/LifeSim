import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const repoRoot = new URL('../../', import.meta.url);

/**
 * 构建产物随附许可声明（MIT 要求「所有副本」都包含版权与许可声明）。
 * 压缩器会去掉源码里的许可注释，所以必须把声明作为文件随产物分发（M3-044）：
 * 本项目的 LICENSE，以及 `pnpm notices` 生成的第三方声明（npm 依赖 + 移植代码）。
 */
function licenseNotices(): Plugin {
  return {
    name: 'lifesim-license-notices',
    apply: 'build',
    generateBundle() {
      for (const [fileName, source] of [
        ['LICENSE.txt', 'LICENSE'],
        ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.md'],
      ] as const) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(new URL(source, repoRoot), 'utf8'),
        });
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages 项目页部署在 /LifeSim/ 下；本地开发与预览保持根路径（ADR-0001）。
  base: process.env['LIFESIM_BASE'] ?? '/',
  plugins: [react(), licenseNotices()],
});
