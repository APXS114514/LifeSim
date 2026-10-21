import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BirthRegionId } from '../../packages/content-schema/src/index.ts';
import { PACKS } from '../../packages/country-packs/src/index.ts';
import type { CountryPack } from '../../packages/country-packs/src/index.ts';
import { renderCoverage } from './coverage.mjs';

const root = resolve(import.meta.dirname, '../..');

/** 测试夹具，数值虚构：一个地区、三条序列，含缺失年份与预测年份。 */
function fixturePack(): CountryPack {
  const evidence = (yearRange: [number, number]) => ({
    grade: 'B' as const,
    sourceIds: ['adr:0005'],
    modelVersion: 'fixture',
    geographyId: 'country:CN',
    yearRange,
  });
  const missing = new Set([1950, 1951, 1952, 1955]);
  const births = [];
  for (let year = 1950; year <= 2026; year += 1) {
    births.push({
      year,
      age: null,
      value: missing.has(year) ? null : 100,
      ...(missing.has(year) ? { missingReason: 'fixture gap' } : {}),
      projected: year >= 2024,
    });
  }
  const qx = [];
  for (let year = 1950; year <= 2026; year += 1) {
    for (let age = 0; age <= 2; age += 1) {
      qx.push({ year, age, value: 0.01, projected: false });
    }
  }
  const urban = [];
  for (let year = 1960; year <= 2026; year += 1) {
    urban.push({ year, age: null, value: 0.5, projected: false });
  }
  return {
    manifest: { packId: 'CN' },
    geographyId: 'country:CN',
    series: [
      {
        id: 'test/CN/births',
        indicator: 'births',
        geographyId: 'country:CN',
        unit: 'thousand-persons',
        ageBasis: 'none',
        sex: 'both',
        evidence: evidence([1950, 2026]),
        points: births,
      },
      {
        id: 'test/CN/qx',
        indicator: 'life-table-qx',
        geographyId: 'country:CN',
        unit: 'probability',
        ageBasis: 'single-year',
        sex: 'both',
        evidence: evidence([1950, 2026]),
        points: qx,
      },
      {
        id: 'test/CN/urban-share',
        indicator: 'urban-share',
        geographyId: 'country:CN',
        unit: 'share',
        ageBasis: 'none',
        sex: 'both',
        evidence: evidence([1960, 2026]),
        points: urban,
      },
    ],
    places: [],
    breakpoints: [],
  } as unknown as CountryPack;
}

const fixturePacks = { CN: fixturePack() } as unknown as Record<BirthRegionId, CountryPack>;

describe('renderCoverage', () => {
  it('renders projected years when present and an age range only for single-year series', () => {
    const markdown = renderCoverage(fixturePacks);
    expect(markdown).toContain(
      '| CN | births | test/CN/births | adr:0005 | B | 1950—2026 | 2024—2026 | — | 4 | 1950—1952, 1955 |',
    );
    expect(markdown).toContain(
      '| CN | life-table-qx | test/CN/qx | adr:0005 | B | 1950—2026 | — | 0—2 | 0 | — |',
    );
  });

  it('merges consecutive missing years into ranges', () => {
    expect(renderCoverage(fixturePacks)).toContain('1950—1952, 1955');
  });

  it('lists the urban-share gap split between hold-first and neighbor-year rules', () => {
    const markdown = renderCoverage(fixturePacks);
    expect(markdown).toContain('1950—1957（hold-first-observed）');
    expect(markdown).toContain('1958—1959（fallback-neighbor-year）');
  });

  it('matches the committed COVERAGE.md for the real packs', () => {
    expect(renderCoverage(PACKS)).toBe(readFileSync(join(root, 'docs/data/COVERAGE.md'), 'utf8'));
  });
});
