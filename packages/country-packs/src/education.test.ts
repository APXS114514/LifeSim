import { BIRTH_REGION_IDS } from '@lifesim/content-schema';
import { describe, expect, it } from 'vitest';
import { PACKS } from './packs/index.ts';
import type { CountryPack, EducationSegment } from './schema.ts';

/** 找覆盖该年的分段；M3-012a 的契约要求 1950—2026 的出生年都能解析出学制。 */
function segmentAt(pack: CountryPack, year: number): EducationSegment {
  const found = pack.education.find(
    (segment) => year >= segment.validFrom && (segment.validTo === null || year <= segment.validTo),
  );
  if (!found) throw new Error(`${pack.manifest.packId} 在 ${year} 没有教育制度分段`);
  return found;
}

describe('M3-012a：国家包的教育制度分段（规则数据，不是统计序列）', () => {
  it.each(BIRTH_REGION_IDS)('%s 的分段按年份递增且互不重叠', (packId) => {
    const pack = PACKS[packId];
    expect(pack.education.length).toBeGreaterThan(0);
    expect(pack.education[0]?.validFrom).toBe(1950);
    for (let index = 1; index < pack.education.length; index += 1) {
      const previous = pack.education[index - 1];
      const current = pack.education[index];
      if (!previous || !current) throw new Error('unreachable');
      const previousEnd = previous.validTo ?? Number.POSITIVE_INFINITY;
      expect(current.validFrom).toBeGreaterThan(previousEnd);
    }
  });

  it.each(BIRTH_REGION_IDS)('%s 的入学年龄、年限与义务教育年限自洽', (packId) => {
    for (const segment of PACKS[packId].education) {
      expect(segment.primaryStartAge).toBeGreaterThanOrEqual(4);
      expect(segment.primaryStartAge).toBeLessThanOrEqual(10);
      expect(segment.compulsoryYears).toBeLessThanOrEqual(
        segment.primaryYears + segment.secondaryYears,
      );
      if (segment.entranceExam.kind === 'exam') {
        expect(segment.entranceExam.passBase).toBeGreaterThan(0);
        expect(segment.entranceExam.passBase).toBeLessThanOrEqual(1);
      }
      expect(segment.feeShare).toBeGreaterThanOrEqual(0);
      expect(segment.feeShare).toBeLessThanOrEqual(1);
    }
  });

  it.each(BIRTH_REGION_IDS)('%s 的 1950—2026 每个年份都能解析出学制', (packId) => {
    const pack = PACKS[packId];
    for (let year = 1950; year <= 2026; year += 1) {
      const segment = segmentAt(pack, year);
      expect(['C', 'D']).toContain(segment.grade);
    }
  });

  it.each(BIRTH_REGION_IDS)('%s 的 C 级有已登记来源、D 级写明缺口', (packId) => {
    for (const segment of PACKS[packId].education) {
      expect(segment.sourceIds.length).toBeGreaterThan(0);
      if (segment.grade === 'D') {
        expect(segment.note).toBeTruthy();
      } else {
        expect(segment.sourceIds.some((id) => !id.startsWith('adr:'))).toBe(true);
      }
    }
  });

  it('中国大陆的考试制度按任务史实骨架分段：1976 年无考试、1977 年恢复高考', () => {
    const cn = PACKS.CN;
    expect(segmentAt(cn, 1965).entranceExam.kind).toBe('exam');
    expect(segmentAt(cn, 1976).entranceExam).toEqual({ kind: 'none' });
    expect(segmentAt(cn, 1977).entranceExam.kind).toBe('exam');
    expect(segmentAt(cn, 1985).compulsoryYears).toBe(0);
    expect(segmentAt(cn, 1986).compulsoryYears).toBe(9);
  });

  it('每个分段的起止年份落在数据覆盖范围内', () => {
    for (const packId of BIRTH_REGION_IDS) {
      for (const segment of PACKS[packId].education) {
        expect(segment.validFrom).toBeGreaterThanOrEqual(1950);
        expect(segment.validFrom).toBeLessThanOrEqual(2100);
        if (segment.validTo !== null) {
          expect(segment.validTo).toBeGreaterThanOrEqual(segment.validFrom);
        }
      }
    }
  });
});
