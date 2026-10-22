import type { EducationSegment } from '../schema.ts';

/**
 * 韩国教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 仓库目前**没有登记任何教育法规来源**（`data/sources.json` 只有 WDI/WPP 与币制/政体来源），
 * 因此全部条目都是 **D 级设计假设**：年份边界取自任务 M3-012 列出的史实骨架，具体参数
 * （入学年龄、年限、考试基础通过率、学费比例）是设计假设，待登记并审计教育法规来源后复核。
 * 每条 D 级都带 `note` 写明缺口，校验（`validateCountryPack` 规则 14—16）会强制这一点。
 */
export const KR_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: 1952,
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 0,
    entranceExam: { kind: 'exam', passBase: 0.4 },
    feeShare: 0.15,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：六三三四学制，义务教育尚未立法（任务史实骨架 1953 年前）；无已登记来源。',
  },
  {
    validFrom: 1953,
    validTo: 1968,
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 6,
    entranceExam: { kind: 'exam', passBase: 0.5 },
    feeShare: 0.12,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1953 年六年制义务教育（任务史实骨架）；中学与大学升学考试并存，通过率与学费比例是设计假设。',
  },
  {
    validFrom: 1969,
    validTo: null,
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 6,
    entranceExam: { kind: 'exam', passBase: 0.6 },
    feeShare: 0.12,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1969 年中学免试入学与平准化（任务史实骨架）取消初中入学考试，但高中与大学入学考试保留；义务教育按六年处理（九年制全面实施年份无可登记来源，故不下调也不上调）。',
  },
];
