// 生产依赖与移植源代码的许可证检查，并生成 THIRD_PARTY_NOTICES.md（GDD §9.4、§12）。
//
//   node scripts/check-licenses.mjs          检查：许可证都在允许名单内，移植登记完整，且 NOTICES 与之一致
//   node scripts/check-licenses.mjs --write  重新生成 THIRD_PARTY_NOTICES.md
//
// 覆盖 npm 生产依赖与 third_party/ported-code.json 登记的移植代码（M3-044）。
// 外部数据、地图、字体、图片的许可登记在 data/SOURCES.md 等文件，另行审计。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const noticesPath = join(root, 'THIRD_PARTY_NOTICES.md');
const portedRegistryPath = 'third_party/ported-code.json';

/** 允许进入公开构建的宽松许可证（SPDX）。其他许可证需要先写 ADR 评估。 */
export const ALLOWED = new Set([
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
export function renderNotices(packages) {
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

// ---------------------------------------------------------------------------
// 移植的源代码（third_party/ported-code.json）

/**
 * @typedef {{ file: string, lines: string, sha256: string }} UpstreamLocation
 * @typedef {{
 *   id: string, project: string, url: string, commit: string, license: string, copyright: string,
 *   licenseFile: string, upstream: UpstreamLocation[], ported: string[], changes: string,
 *   task: string, accessed: string,
 * }} PortedEntry
 * @typedef {{ entries: PortedEntry[] }} PortedRegistry
 * @typedef {{ exists(path: string): boolean, read(path: string): string, sourceFiles(): string[] }} RepoIO
 */

const SPDX_TAG = 'SPDX-License-Identifier:';

/** @type {readonly ('id' | 'project' | 'url' | 'license' | 'copyright' | 'licenseFile' | 'changes' | 'task')[]} */
const REQUIRED_TEXT_FIELDS = [
  'id',
  'project',
  'url',
  'license',
  'copyright',
  'licenseFile',
  'changes',
  'task',
];

/**
 * 检查移植登记：字段完整、许可证允许、许可证原文含原版权行、每个移植文件带完整许可注释，
 * 且仓库里每个带 SPDX 标记的源文件都已登记。返回问题列表（空表示通过）。
 * @param {PortedRegistry} registry
 * @param {RepoIO} io
 * @returns {string[]}
 */
export function validatePortedCode(registry, io) {
  const problems = [];
  const entries = Array.isArray(registry?.entries) ? registry.entries : null;
  if (!entries) return [`${portedRegistryPath} must contain an "entries" array`];
  const ids = new Set();
  const registered = new Set();
  for (const entry of entries) {
    const at = `ported entry ${entry?.id ?? '(no id)'}`;
    for (const key of REQUIRED_TEXT_FIELDS) {
      const value = entry?.[key];
      if (typeof value !== 'string' || value.trim() === '')
        problems.push(`${at}: ${key} is required`);
    }
    if (typeof entry?.id === 'string') {
      if (ids.has(entry.id)) problems.push(`${at}: duplicate id`);
      ids.add(entry.id);
    }
    if (!/^[0-9a-f]{40}$/.test(entry?.commit ?? '')) {
      problems.push(`${at}: commit must be the full 40-character SHA`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry?.accessed ?? '')) {
      problems.push(`${at}: accessed must be an ISO date`);
    }
    if (typeof entry?.license === 'string' && !ALLOWED.has(entry.license)) {
      problems.push(`${at}: licence ${entry.license} is not in the allow-list`);
    }
    const upstream = Array.isArray(entry?.upstream) ? entry.upstream : [];
    if (upstream.length === 0) problems.push(`${at}: at least one upstream location is required`);
    for (const location of upstream) {
      if (!location?.file || !location?.lines || !/^[0-9a-f]{64}$/.test(location?.sha256 ?? '')) {
        problems.push(`${at}: upstream locations need file, lines and the file's sha256`);
      }
    }
    if (typeof entry?.licenseFile === 'string') {
      if (!io.exists(entry.licenseFile)) {
        problems.push(`${at}: licence file ${entry.licenseFile} does not exist`);
      } else if (
        typeof entry.copyright === 'string' &&
        !io.read(entry.licenseFile).includes(entry.copyright)
      ) {
        problems.push(
          `${at}: licence file ${entry.licenseFile} does not contain "${entry.copyright}"`,
        );
      }
    }
    const ported = Array.isArray(entry?.ported) ? entry.ported : [];
    if (ported.length === 0) problems.push(`${at}: at least one ported file is required`);
    for (const file of ported) {
      registered.add(file);
      if (!io.exists(file)) {
        problems.push(`${at}: ported file ${file} does not exist`);
        continue;
      }
      const text = io.read(file);
      if (!text.startsWith('/*!')) problems.push(`${file} must start with a /*! licence comment`);
      if (typeof entry.copyright === 'string' && !text.includes(entry.copyright)) {
        problems.push(`${file} must keep the original copyright line "${entry.copyright}"`);
      }
      if (!text.includes(`${SPDX_TAG} ${entry.license}`)) {
        problems.push(`${file} must declare ${SPDX_TAG} ${entry.license}`);
      }
      if (!text.includes(`id: ${entry.id}`))
        problems.push(`${file} must name its registry id ${entry.id}`);
    }
  }
  for (const file of io.sourceFiles()) {
    if (!registered.has(file) && io.read(file).includes(SPDX_TAG)) {
      problems.push(`${file} carries ${SPDX_TAG} but is not registered in ${portedRegistryPath}`);
    }
  }
  return problems;
}

/**
 * THIRD_PARTY_NOTICES.md 的「移植的源代码」一节：登记表 + 每份许可证原文各一次。
 * @param {PortedRegistry} registry
 * @param {RepoIO} io
 */
export function renderPortedSection(registry, io) {
  const entries = registry.entries;
  if (entries.length === 0) return '';
  const lines = [
    '## 移植的源代码 / Ported source code',
    '',
    '> 从其他开源项目移植或改写进本仓库的源代码，登记在 `third_party/ported-code.json`；许可证原文见下。',
    '',
    '| 来源 | Commit | 上游位置 | 许可证 | 本仓库文件 | 改动 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...entries.map((entry) => {
      const where = entry.upstream
        .map((location) => `${location.file} ${location.lines}`)
        .join('；');
      return `| [${entry.project}](${entry.url}) | \`${entry.commit.slice(0, 7)}\` | ${where} | ${entry.license} | ${entry.ported.join('<br>')} | ${entry.changes} |`;
    }),
    '',
  ];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.licenseFile)) continue;
    seen.add(entry.licenseFile);
    lines.push(
      `### ${entry.project}（${entry.licenseFile}）`,
      '',
      '```text',
      io.read(entry.licenseFile).trim(),
      '```',
      '',
    );
  }
  return lines.join('\n');
}

/** @param {string} dir */
function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(
      (name) => /\.(ts|tsx|mjs|js)$/.test(name) && !name.split(/[\\/]/).includes('node_modules'),
    )
    .map((name) => relative(root, join(dir, name)).split('\\').join('/'));
}

/** @returns {RepoIO} */
function diskIO() {
  return {
    exists: (path) => existsSync(join(root, path)),
    read: (path) => readFileSync(join(root, path), 'utf8'),
    sourceFiles: () =>
      ['apps', 'packages'].flatMap((group) =>
        (existsSync(join(root, group)) ? readdirSync(join(root, group)) : []).flatMap((name) =>
          listSourceFiles(join(root, group, name, 'src')),
        ),
      ),
  };
}

function main() {
  const io = diskIO();
  /** @type {PortedRegistry} */
  const registry = io.exists(portedRegistryPath)
    ? JSON.parse(io.read(portedRegistryPath))
    : { entries: [] };
  const portedProblems = validatePortedCode(registry, io);
  if (portedProblems.length > 0) {
    console.error(`移植源代码登记不完整（${portedRegistryPath}）：`);
    for (const problem of portedProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const packages = listProductionPackages();
  const disallowed = packages.filter((pkg) => !ALLOWED.has(pkg.license));
  if (disallowed.length > 0) {
    console.error('以下生产依赖的许可证不在允许名单内（先写 ADR 评估再引入）：');
    for (const pkg of disallowed)
      console.error(`  - ${pkg.name}@${pkg.versions.join(',')}: ${pkg.license}`);
    process.exit(1);
  }

  const ported = renderPortedSection(registry, io);
  const notices = ported ? `${renderNotices(packages)}\n${ported}` : renderNotices(packages);
  if (process.argv.includes('--write')) {
    writeFileSync(noticesPath, notices);
    console.log(
      `已写入 THIRD_PARTY_NOTICES.md（${packages.length} 个生产依赖、${registry.entries.length} 处移植代码）。`,
    );
  } else {
    const current = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : '';
    if (current !== notices) {
      console.error(
        'THIRD_PARTY_NOTICES.md 与当前生产依赖或移植登记不一致，请运行 `pnpm notices` 并提交结果。',
      );
      process.exit(1);
    }
    console.log(
      `许可证检查通过：${packages.length} 个生产依赖与 ${registry.entries.length} 处移植代码均为允许的许可证，NOTICES 已同步。`,
    );
  }
}

if (import.meta.main) main();
