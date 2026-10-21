import { describe, expect, it } from 'vitest';
import { renderPortedSection, validatePortedCode } from './check-licenses.mjs';

/** 测试夹具：虚构的上游项目与文件，不是真实登记。 */
const LICENSE_TEXT =
  'MIT License\n\nCopyright (c) 2099 Example Author\n\nPermission is hereby granted…\n';
const HEADER = [
  '/*!',
  ' * Ported from example/upstream (fixture).',
  ' * Registered in third_party/ported-code.json (id: example-port).',
  ' * Copyright (c) 2099 Example Author',
  ' * SPDX-License-Identifier: MIT',
  ' */',
  'export const x = 1;',
].join('\n');

const entry = {
  id: 'example-port',
  project: 'example/upstream',
  url: 'https://example.org/upstream',
  commit: '0123456789abcdef0123456789abcdef01234567',
  license: 'MIT',
  copyright: 'Copyright (c) 2099 Example Author',
  licenseFile: 'third_party/example/LICENSE',
  upstream: [{ file: 'app.js', lines: '1-10', sha256: 'a'.repeat(64) }],
  ported: ['apps/web/src/game/example.ts'],
  changes: 'Rewritten as TypeScript.',
  task: 'M0-000',
  accessed: '2099-01-01',
};

function repo(files: Record<string, string>) {
  return {
    exists: (path: string) => path in files,
    read: (path: string) => {
      const text = files[path];
      if (text === undefined) throw new Error(`missing ${path}`);
      return text;
    },
    sourceFiles: () => Object.keys(files).filter((path) => /\.(ts|tsx|mjs|js)$/.test(path)),
  };
}

const goodFiles = {
  'third_party/example/LICENSE': LICENSE_TEXT,
  'apps/web/src/game/example.ts': HEADER,
  'apps/web/src/game/other.ts': 'export const y = 2;\n',
};

describe('ported source code registry', () => {
  it('accepts a complete, consistent entry', () => {
    expect(validatePortedCode({ entries: [entry] }, repo(goodFiles))).toEqual([]);
  });

  it('accepts an empty registry', () => {
    expect(validatePortedCode({ entries: [] }, repo({}))).toEqual([]);
  });

  it.each([
    ['a licence outside the allow-list', { license: 'GPL-3.0-only' }, 'not in the allow-list'],
    ['a short commit', { commit: '5f19a0e' }, 'full 40-character'],
    ['a missing licence file', { licenseFile: 'third_party/nope/LICENSE' }, 'licence file'],
    [
      'a copyright line absent from the licence',
      { copyright: 'Copyright (c) 1999 Someone' },
      'does not contain',
    ],
    ['a missing ported file', { ported: ['apps/web/src/game/gone.ts'] }, 'does not exist'],
    ['no upstream location', { upstream: [] }, 'upstream'],
    ['a bad access date', { accessed: '21/10/2026' }, 'accessed'],
  ])('rejects %s', (_name, change, message) => {
    const problems = validatePortedCode({ entries: [{ ...entry, ...change }] }, repo(goodFiles));
    expect(problems.join('\n')).toContain(message);
  });

  it('requires the licence header, copyright, SPDX tag and registry id in every ported file', () => {
    for (const [broken, message] of [
      [HEADER.replace('/*!', '/*'), 'must start with a /*! licence comment'],
      [HEADER.replace(' * Copyright (c) 2099 Example Author\n', ''), 'copyright line'],
      [HEADER.replace('SPDX-License-Identifier: MIT', ''), 'SPDX-License-Identifier: MIT'],
      [HEADER.replace('id: example-port', 'id: else'), 'registry id'],
    ] as const) {
      const problems = validatePortedCode(
        { entries: [entry] },
        repo({ ...goodFiles, 'apps/web/src/game/example.ts': broken }),
      );
      expect(problems.join('\n')).toContain(message);
    }
  });

  it('finds source files that carry an SPDX tag but are not registered', () => {
    const problems = validatePortedCode(
      { entries: [entry] },
      repo({ ...goodFiles, 'packages/systems/src/sneaky.ts': '// SPDX-License-Identifier: MIT\n' }),
    );
    expect(problems.join('\n')).toContain('packages/systems/src/sneaky.ts');
  });

  it('rejects duplicate ids', () => {
    const problems = validatePortedCode({ entries: [entry, entry] }, repo(goodFiles));
    expect(problems.join('\n')).toContain('duplicate');
  });

  it('renders the entries and each licence text once for THIRD_PARTY_NOTICES.md', () => {
    const second = { ...entry, id: 'example-port-2', ported: ['apps/web/src/game/example.ts'] };
    const text = renderPortedSection({ entries: [entry, second] }, repo(goodFiles));
    expect(text).toContain('## 移植的源代码 / Ported source code');
    expect(text).toContain('example/upstream');
    expect(text).toContain('`0123456`');
    expect(text).toContain('apps/web/src/game/example.ts');
    expect(text.split('Copyright (c) 2099 Example Author').length - 1).toBe(1);
    expect(renderPortedSection({ entries: [] }, repo({}))).toBe('');
  });
});
