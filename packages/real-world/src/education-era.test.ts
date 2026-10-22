import { type SimEventFact } from '@lifesim/content-schema';
import { canonicalJson } from '@lifesim/simulation-core';
import { afterSecondaryDecisionKey } from '@lifesim/systems';
import { describe, expect, it } from 'vitest';
import { createRealLifeSimulation } from './region-model.ts';

const FOREVER = { targetDate: '2200-01-01', stopAtMajorDecision: false, maxWorkUnits: 1_000_000 };
const EXAM_TYPES = new Set(['education.exam-passed', 'education.exam-failed']);

function isExamFact(fact: SimEventFact): boolean {
  return EXAM_TYPES.has(fact.type);
}

/** CN 主角：可预设中学毕业后的决定（CN 的中学在 16 岁结束）。 */
function cnFacts(
  seed: string,
  year: number,
  decision: 'apply-university' | 'start-work' = 'apply-university',
): readonly SimEventFact[] {
  const session = createRealLifeSimulation({
    seed,
    region: 'CN',
    year,
    birthDate: `${year}-05-04`,
    decisions: { [afterSecondaryDecisionKey(16)]: decision },
  });
  session.simulation.advanceTo(FOREVER);
  return session.simulation.facts;
}

describe('M3-012b：中国与年代驱动的升学（验收 1—2）', () => {
  it('同一 seed 下 CN 1955 与 CN 1985 的升学路径不同，且只有 1977 年后才出现高考事实（验收 1）', () => {
    // 固定种子（不是随机抽样）：同一 seed 下 1985 出生者会走到有高考的升学，1955 出生者不会。
    const older = cnFacts('era-scan-2', 1955);
    const younger = cnFacts('era-scan-2', 1985);
    expect(canonicalJson(older)).not.toBe(canonicalJson(younger));

    // 1955 出生者在 1971 年升学：那时没有统一高考，走的是选拔路径。
    expect(older.some(isExamFact)).toBe(false);
    // 1985 出生者在 2001 年升学：有高考，必须记录考试事实。
    expect(younger.some(isExamFact)).toBe(true);

    // 至少一条事实类型只出现在特定年代（考试事实）。
    const typesOf = (facts: readonly SimEventFact[]) => new Set(facts.map((fact) => fact.type));
    const olderTypes = typesOf(older);
    const onlyYounger = [...typesOf(younger)].filter((type) => !olderTypes.has(type));
    expect(onlyYounger.length).toBeGreaterThan(0);
  });

  it('CN 角色在 1976 年之前不会被高考录取，1977 年起才开放考试路径（验收 2）', () => {
    for (const year of [1950, 1952, 1955, 1960, 1965]) {
      for (const seed of ['era-scan-2', 'era-scan-5']) {
        const facts = cnFacts(seed, year);
        for (const fact of facts) {
          if (fact.type !== 'education.admitted') continue;
          if (fact.details?.['stage'] !== 'tertiary') continue;
          const admissionYear = Number(fact.at.slice(0, 4));
          if (admissionYear <= 1976) {
            expect(fact.details?.['path'], `${seed} ${year} ${fact.at}`).toBe('selection');
          }
        }
        // 1976 年之前的任何考试事实都不能是高考路径产生的。
        for (const fact of facts.filter(isExamFact)) {
          expect(Number(fact.at.slice(0, 4))).toBeGreaterThan(1976);
        }
      }
    }

    // 1977 年之后恢复考试：1985 出生者在 2001 年的升学有考试事实与考试录取。
    const later = cnFacts('era-scan-5', 1985);
    expect(later.some(isExamFact)).toBe(true);
    expect(
      later.some(
        (fact) =>
          fact.type === 'education.admitted' &&
          fact.details?.['stage'] === 'tertiary' &&
          fact.details?.['path'] === 'exam',
      ),
    ).toBe(true);
  });

  it('同 seed 同参数两次运行的事实逐字节相同（验收 4，真实地区）', () => {
    expect(canonicalJson(cnFacts('era-determinism', 1985))).toBe(
      canonicalJson(cnFacts('era-determinism', 1985)),
    );
  });
});
