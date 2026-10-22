import type { EducationSegment } from '../schema.ts';

/**
 * 日本教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 仓库目前**没有登记任何教育法规来源**（`data/sources.json` 只有 WDI/WPP 与币制/政体来源），
 * 因此全部条目都是 **D 级设计假设**：年份边界取自任务 M3-012 列出的史实骨架，具体参数
 * （入学年龄、年限、考试基础通过率、学费比例）是设计假设，待登记并审计教育法规来源后复核。
 * 每条 D 级都带 `note` 写明缺口，校验（`validateCountryPack` 规则 14—16）会强制这一点。
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
    note: 'D 级设计假设：战后六三三四学制在该包覆盖期内基本稳定（六岁入学、小学 6 年、中学 3 年、大学 4 年、九年义务教育），但仓库未登记学校教育法来源；考试通过率与学费比例是设计假设。',
  },
];
