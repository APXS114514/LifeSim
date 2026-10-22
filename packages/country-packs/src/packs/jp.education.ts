import type { EducationSegment } from '../schema.ts';

/**
 * 日本教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 证据：本段仍标 **D 级设计假设**——包含未由法规决定的 `entranceExam.passBase` 与
 * `feeShare`，按最弱值整段取 D（逐值证据见 `docs/data/EDUCATION_SYSTEMS.md`）。
 * 本轮未取得可引用的《学校教育法》文本（e-Gov 法规页为脚本渲染），结构待核实。
 */
export const JP_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: null,
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 9,
    entranceExam: { kind: 'exam', passBase: 0.6 },
    feeShare: 0.12,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：战后六三三四学制在该包覆盖期内基本稳定（六岁入学、小学 6 年、中学 3 年、大学 4 年、九年义务教育），但仓库仍未登记可引用的学校教育法来源，结构待核实；考试通过率与学费比例是设计假设。',
  },
];
