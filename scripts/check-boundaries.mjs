// 校验工作区的依赖方向（docs/ARCHITECTURE.md「依赖规则」）。
// 同时检查 package.json 声明与源码里实际的 import，任何违规都以非零状态退出。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

/**
 * 每个工作区包允许依赖的内部包。新增包必须先在这里登记。
 * @type {Record<string, string[]>}
 */
const ALLOWED_INTERNAL = {
  '@lifesim/content-schema': [],
  '@lifesim/simulation-core': ['@lifesim/content-schema'],
  '@lifesim/save': ['@lifesim/content-schema'],
  '@lifesim/narrative': ['@lifesim/content-schema'],
  '@lifesim/systems': ['@lifesim/content-schema', '@lifesim/simulation-core'],
  // M2 计划中的包（docs/tasks/）：先登记依赖方向，任务执行者不需要修改本脚本。
  '@lifesim/data-registry': ['@lifesim/content-schema'],
  '@lifesim/country-packs': [
    '@lifesim/content-schema',
    '@lifesim/data-registry',
    '@lifesim/simulation-core',
  ],
  // M3 可玩切片：把国家包适配成 systems 能消费的 RegionModel。
  '@lifesim/real-world': [
    '@lifesim/content-schema',
    '@lifesim/country-packs',
    '@lifesim/data-registry',
    '@lifesim/narrative',
    '@lifesim/simulation-core',
    '@lifesim/systems',
  ],
  // 合成数据只供测试与 headless 运行：网页应用不在允许名单里，因此不会进入公开构建。
  '@lifesim/synthetic-world': [
    '@lifesim/content-schema',
    '@lifesim/simulation-core',
    '@lifesim/systems',
  ],
  '@lifesim/cli': [
    '@lifesim/content-schema',
    '@lifesim/narrative',
    '@lifesim/save',
    '@lifesim/simulation-core',
    '@lifesim/synthetic-world',
    '@lifesim/systems',
    '@lifesim/real-world',
  ],
  '@lifesim/web': [
    '@lifesim/content-schema',
    '@lifesim/country-packs',
    '@lifesim/narrative',
    '@lifesim/save',
    '@lifesim/simulation-core',
    '@lifesim/systems',
    '@lifesim/real-world',
  ],
};

/** 只属于界面层的库：领域包（packages/*）不得依赖。 */
const UI_ONLY = new Set(['react', 'react-dom', 'react-i18next']);

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs)$/;
const TEST_FILE = /\.test\.(?:ts|tsx)$/;
const EXPLICIT_EXTENSION = /\.(?:ts|tsx|mts|js|mjs|json|css)$/;

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** @type {string[]} */
const errors = [];
/** @param {string} message */
const report = (message) => errors.push(message);

const rootManifest = readJson(join(root, 'package.json'));
const rootDevDependencies = new Set(Object.keys(rootManifest.devDependencies ?? {}));

function listWorkspaces() {
  return ['apps', 'packages'].flatMap((group) =>
    readdirSync(join(root, group), { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && existsSync(join(root, group, entry.name, 'package.json')),
      )
      .map((entry) => {
        const dir = join(root, group, entry.name);
        return { dir, group, manifest: readJson(join(dir, 'package.json')) };
      }),
  );
}

/** @param {string} dir */
function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * `@scope/name/sub` → `@scope/name`；`name/sub` → `name`。
 * @param {string} specifier
 */
function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

const workspaces = listWorkspaces();
/** @type {Map<string, string[]>} */
const graph = new Map();

for (const { dir, group, manifest } of workspaces) {
  const name = manifest.name;
  const where = relative(root, dir);
  const allowed = ALLOWED_INTERNAL[name];
  if (!allowed) {
    report(`${where}: 包 ${name} 未在 scripts/check-boundaries.mjs 的 ALLOWED_INTERNAL 中登记`);
    continue;
  }

  const declared = new Set(
    ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) =>
      Object.keys(manifest[field] ?? {}),
    ),
  );
  const internal = [...declared].filter((dep) => dep.startsWith('@lifesim/'));
  graph.set(name, internal);

  for (const dep of internal) {
    if (!allowed.includes(dep)) report(`${where}: ${name} 不允许依赖 ${dep}`);
  }
  if (group === 'packages') {
    for (const dep of declared) {
      if (UI_ONLY.has(dep)) report(`${where}: 领域包不得依赖界面库 ${dep}`);
    }
  }

  const sources = [...listSourceFiles(join(dir, 'src')), ...listSourceFiles(join(dir, 'e2e'))];
  for (const file of sources) {
    const fileWhere = relative(root, file);
    const isTest = TEST_FILE.test(file) || file.includes(`${sep}e2e${sep}`);
    const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);

    for (const { fileName: specifier } of importedFiles) {
      if (specifier.startsWith('.')) {
        if (!EXPLICIT_EXTENSION.test(specifier)) {
          report(
            `${fileWhere}: 相对导入 "${specifier}" 必须写明扩展名（Node 直接运行 TS 源码需要）`,
          );
        }
        const target = resolve(dirname(file), specifier);
        if (relative(dir, target).startsWith('..')) {
          report(`${fileWhere}: 相对路径 "${specifier}" 越出了包目录；跨包请通过包名导入`);
        }
        continue;
      }
      if (NODE_BUILTINS.has(specifier)) {
        if (group === 'packages' && !isTest) {
          report(`${fileWhere}: 领域包必须与运行环境无关，不能导入 "${specifier}"`);
        }
        continue;
      }
      const dep = packageNameOf(specifier);
      if (declared.has(dep)) continue;
      if (isTest && rootDevDependencies.has(dep)) continue;
      report(`${fileWhere}: 导入了 "${dep}"，但 ${where}/package.json 没有声明它`);
    }
  }
}

// 内部依赖图必须无环。
/** @type {Map<string, 'active' | 'done'>} */
const state = new Map();
/**
 * @param {string} name
 * @param {string[]} path
 */
function visit(name, path) {
  if (state.get(name) === 'done') return;
  if (state.get(name) === 'active') {
    report(`内部依赖存在环：${[...path, name].join(' → ')}`);
    return;
  }
  state.set(name, 'active');
  for (const dep of graph.get(name) ?? []) visit(dep, [...path, name]);
  state.set(name, 'done');
}
for (const name of graph.keys()) visit(name, []);

if (errors.length > 0) {
  console.error(`依赖边界检查失败（${errors.length} 项）：`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`依赖边界检查通过：${workspaces.length} 个工作区包，内部依赖无环。`);
