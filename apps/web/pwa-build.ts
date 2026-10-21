import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

function filesIn(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(join(directory, entry.name), prefix + entry.name + '/')
      : [prefix + entry.name],
  );
}
type WriteBundleHook = Extract<Plugin['writeBundle'], (...args: never[]) => unknown>;
type Bundle = Parameters<WriteBundleHook>[1];

function staticImports(bundle: Bundle): Set<string> {
  const result = new Set<string>();
  const visit = (name: string) => {
    if (result.has(name)) return;
    result.add(name);
    const entry = bundle[name];
    if (entry?.type === 'chunk') entry.imports.forEach(visit);
  };
  for (const item of Object.values(bundle))
    if (item.type === 'chunk' && item.isEntry) visit(item.fileName);
  return result;
}

/** The version is derived from real output bytes; dynamic country chunks stay out of precache. */
export function offlineBuild(): Plugin {
  let directory = '';
  let base = '/';
  return {
    name: 'lifesim-offline-build',
    apply: 'build',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
      base = config.base;
      if (!base.startsWith('/') || !base.endsWith('/'))
        throw new Error('Offline builds require an absolute path base ending in /');
    },
    writeBundle(_options, bundle) {
      const assets = filesIn(directory)
        .filter((name) => name !== 'sw.js')
        .sort();
      const staticJs = staticImports(bundle);
      const shell = assets.filter((name) => !name.endsWith('.js') || staticJs.has(name));
      const source = readFileSync(
        fileURLToPath(new URL('./public/sw.js', import.meta.url)),
        'utf8',
      );
      const hash = createHash('sha256').update(source);
      for (const name of assets) hash.update(name).update(readFileSync(join(directory, name)));
      const version = hash.digest('hex').slice(0, 20);
      const worker = source.replace(
        /const BUILD = [\s\S]*?\/\/ LIFESIM_BUILD_CONFIG/,
        `const BUILD = ${JSON.stringify({ version, base, shell, assets })}; // LIFESIM_BUILD_CONFIG`,
      );
      writeFileSync(join(directory, 'sw.js'), worker);
    },
  };
}
