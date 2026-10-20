// 生产依赖许可证检查，并生成 THIRD_PARTY_NOTICES.md（GDD §9.4、§12）。
//
//   node scripts/check-licenses.mjs          检查：许可证都在允许名单内，且 NOTICES 与当前依赖一致
//   node scripts/check-licenses.mjs --write  重新生成 THIRD_PARTY_NOTICES.md
//
// 只覆盖 npm 依赖。外部数据、地图、字体、图片的许可登记在 data/SOURCES.md 等文件，另行审计。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const noticesPath = join(root, 'THIRD_PARTY_NOTICES.md');

/** 允许进入公开构建的宽松许可证（SPDX）。其他许可证需要先写 ADR 评估。 */
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
]);

/**
 * pnpm 列为生产依赖、但不会打进构建产物的包，以及原因。
 * @type {Record<string, string>}
 */
const NOT_BUNDLED = {
  typescript: 'i18next / react-i18next 的可选 peer 依赖，只用于类型检查，不进入构建产物',
};

/**
 * @typedef {{ name: string, versions: string[], paths: string[], license: string }} LicensedPackage
 */

/** @returns {LicensedPackage[]} */
function listProductionPackages() {
  // pnpm 在 Windows 上是 pnpm.cmd；CI 与本机都是 POSIX，直接调用即可。
  const output = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json', '--recursive'], {
    cwd: root,
    encoding: 'utf8',
  });
  /** @type {Record<string, Omit<LicensedPackage, 'license'>[]>} */
  const byLicense = JSON.parse(output);
  return Object.entries(byLicense)
    .flatMap(([license, packages]) => packages.map((pkg) => ({ ...pkg, license })))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {LicensedPackage} pkg */
function readLicenseText(pkg) {
  const dir = pkg.paths[0];
  if (!dir) return null;
  const file = readdirSync(dir).find((name) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : null;
}

/** @param {LicensedPackage[]} packages */
function renderNotices(packages) {
  const bundled = packages.filter((pkg) => !(pkg.name in NOT_BUNDLED));
  const lines = [
    '# 第三方声明 / Third-party notices',
    '',
    '> 本文件由 `pnpm notices`（`scripts/check-licenses.mjs --write`）生成，请勿手改。',
    '> 只列出会进入网页构建产物的 npm 生产依赖；开发工具不随产物分发。',
    '> 外部数据、地图、字体与图片的来源和许可见 `data/SOURCES.md`。',
    '',
    '| 包 | 版本 | 许可证 |',
    '| --- | --- | --- |',
    ...bundled.map((pkg) => `| ${pkg.name} | ${pkg.versions.join(', ')} | ${pkg.license} |`),
    '',
  ];
  const skipped = packages.filter((pkg) => pkg.name in NOT_BUNDLED);
  if (skipped.length > 0) {
    lines.push('未打包（不随产物分发）：', '');
    for (const pkg of skipped) lines.push(`- ${pkg.name}：${NOT_BUNDLED[pkg.name]}`);
    lines.push('');
  }
  for (const pkg of bundled) {
    lines.push(`## ${pkg.name} ${pkg.versions.join(', ')}`, '');
    const text = readLicenseText(pkg);
    lines.push(
      text
        ? ['```text', text, '```'].join('\n')
        : `（包内未找到许可证文件；声明许可证：${pkg.license}）`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

const packages = listProductionPackages();
const disallowed = packages.filter((pkg) => !ALLOWED.has(pkg.license));
if (disallowed.length > 0) {
  console.error('以下生产依赖的许可证不在允许名单内（先写 ADR 评估再引入）：');
  for (const pkg of disallowed)
    console.error(`  - ${pkg.name}@${pkg.versions.join(',')}: ${pkg.license}`);
  process.exit(1);
}

const notices = renderNotices(packages);
if (process.argv.includes('--write')) {
  writeFileSync(noticesPath, notices);
  console.log(`已写入 THIRD_PARTY_NOTICES.md（${packages.length} 个生产依赖）。`);
} else {
  const current = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : '';
  if (current !== notices) {
    console.error(
      'THIRD_PARTY_NOTICES.md 与当前生产依赖不一致，请运行 `pnpm notices` 并提交结果。',
    );
    process.exit(1);
  }
  console.log(`许可证检查通过：${packages.length} 个生产依赖均为允许的许可证，NOTICES 已同步。`);
}
