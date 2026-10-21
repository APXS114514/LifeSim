import { describe, expect, it } from 'vitest';
import { highRiskChanges } from './check-guardrails.mjs';

describe('PR guardrails', () => {
  it('flags kernel, contract, golden, data and gate changes', () => {
    const flagged = highRiskChanges([
      { status: 'M', path: 'packages/simulation-core/src/random.ts' },
      { status: 'M', path: 'packages/content-schema/src/money.ts' },
      { status: 'M', path: 'packages/synthetic-world/src/golden.ts' },
      { status: 'A', path: 'data/sources.json' },
      { status: 'M', path: 'qa/test-baseline.json' },
      { status: 'M', path: '.github/workflows/ci.yml' },
      { status: 'M', path: 'docs/adr/0005-x.md' },
      { status: 'M', path: 'third_party/ported-code.json' },
    ]);
    expect(flagged.map((entry) => entry.path)).toHaveLength(8);
  });

  it('flags deleted test files but not new or edited tests', () => {
    const flagged = highRiskChanges([
      { status: 'D', path: 'packages/systems/src/foo.test.ts' },
      { status: 'A', path: 'packages/country-packs/src/select-birth.test.ts' },
      { status: 'M', path: 'packages/simulation-core/src/engine.test.ts' },
    ]);
    expect(flagged).toEqual([{ path: 'packages/systems/src/foo.test.ts', reason: '删除测试文件' }]);
  });

  it('lets ordinary task work through without approval', () => {
    expect(
      highRiskChanges([
        { status: 'A', path: 'packages/data-registry/src/registry.test.ts' },
        { status: 'M', path: 'packages/systems/src/career.ts' },
        { status: 'A', path: 'docs/tasks/M2-005.md' },
        { status: 'A', path: 'data/scripts/lib/csv.mjs' },
      ]),
    ).toEqual([]);
  });
});
