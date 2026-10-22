import type { EducationSegment } from '../schema.ts';

/**
 * 俄罗斯 / 苏联教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 证据：所有分段仍标 **D 级设计假设**——每段都包含未由法规决定的
 * `entranceExam.passBase` 与 `feeShare`，按最弱值整段取 D（逐值证据见
 * `docs/data/EDUCATION_SYSTEMS.md`）。1984 年改革的决议文本已登记，其余年份待核实。
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
    note: 'D 级设计假设：苏联七年制普及义务教育与十年制完全中学，小学 4 年 + 中学 3 年到七年级，高等教育免学费；结构待核实（本轮未取得 1950 年代苏联学制的可引用文本）。',
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
    note: 'D 级设计假设：1958 年学制改革后的八年制义务教育（任务史实骨架）；本轮未取得 1958 年《关于加强学校与生活联系法》的可引用文本，结构与年份边界待核实。',
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
    sourceIds: ['adr:0007', 'ussr-1984:school-reform'],
    note: 'D 级设计假设：1984-04-12 苏共中央与苏联部长会议第 313 号决议计划逐步过渡到 11 年制、从 6 岁开始入学、小学 3 年改 4 年、九年制不完全中学（1—9）与 11(12) 年制完全中学（ussr-1984:school-reform）。改革没有全面完成，本模型取 7 岁入学；secondary 5 年对应 5—9 年级，十至十一年级未单列；passBase 0.5 是设计假设。',
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
    note: 'D 级设计假设：1992 年《教育法》后的小学 4 年 + 不完全中学 5 年（九年义务教育）+ 完全中学 2 年结构；本轮未取得 1992 年《教育法》的可引用文本，结构待核实。高等教育开始收学费的比例 0.1 与 passBase 0.55 是设计假设。',
  },
];
