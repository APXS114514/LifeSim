import type { EducationSegment } from '../schema.ts';

/**
 * 俄罗斯 / 苏联教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 仓库目前**没有登记任何教育法规来源**（`data/sources.json` 只有 WDI/WPP 与币制/政体来源），
 * 因此全部条目都是 **D 级设计假设**：年份边界取自任务 M3-012 列出的史实骨架，具体参数
 * （入学年龄、年限、考试基础通过率、学费比例）是设计假设，待登记并审计教育法规来源后复核。
 * 每条 D 级都带 `note` 写明缺口，校验（`validateCountryPack` 规则 14—16）会强制这一点。
 */
export const RU_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: 1957,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 3,
    tertiaryYears: 5,
    compulsoryYears: 7,
    entranceExam: { kind: 'exam', passBase: 0.5 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：苏联七年制普及义务教育与十年制完全中学，小学 4 年 + 中学 3 年到七年级，高等教育免学费；无已登记来源。',
  },
  {
    validFrom: 1958,
    validTo: 1983,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 4,
    tertiaryYears: 5,
    compulsoryYears: 8,
    entranceExam: { kind: 'exam', passBase: 0.5 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1958 年学制改革后的八年制义务教育（任务史实骨架）；无已登记来源。',
  },
  {
    validFrom: 1984,
    validTo: 1991,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 5,
    tertiaryYears: 5,
    compulsoryYears: 9,
    entranceExam: { kind: 'exam', passBase: 0.5 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1984 年学校改革推行十一年制学校与九年义务教育（任务史实骨架）；无已登记来源。',
  },
  {
    validFrom: 1992,
    validTo: null,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 5,
    tertiaryYears: 5,
    compulsoryYears: 9,
    entranceExam: { kind: 'exam', passBase: 0.55 },
    feeShare: 0.1,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1992 年教育法后的小学 4 年 + 不完全中学 5 年（九年义务教育）+ 完全中学 2 年结构；高等教育开始收学费的比例 0.1 是设计假设。',
  },
];
