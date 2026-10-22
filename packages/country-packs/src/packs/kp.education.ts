import type { EducationSegment } from '../schema.ts';

/**
 * 朝鲜教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 仓库目前**没有登记任何教育法规来源**（`data/sources.json` 只有 WDI/WPP 与币制/政体来源），
 * 因此全部条目都是 **D 级设计假设**：年份边界取自任务 M3-012 列出的史实骨架，具体参数
 * （入学年龄、年限、考试基础通过率、学费比例）是设计假设，待登记并审计教育法规来源后复核。
 * 每条 D 级都带 `note` 写明缺口，校验（`validateCountryPack` 规则 14—16）会强制这一点。

 * 朝鲜（KP）资料有限，允许 C/D 混用；本包全部条目暂为 D，缺口表逐条说明。
 */
export const KP_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: 1971,
    primaryStartAge: 7,
    primaryYears: 4,
    secondaryYears: 3,
    tertiaryYears: 5,
    compulsoryYears: 0,
    entranceExam: { kind: 'none' },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：朝鲜 1972 年前的学制资料有限（任务标注 C/D），按人民学校 4 年 + 中学 3 年、无升学考试处理；国家供给学费，按 0 计。',
  },
  {
    validFrom: 1972,
    validTo: null,
    primaryStartAge: 6,
    primaryYears: 4,
    secondaryYears: 7,
    tertiaryYears: 5,
    compulsoryYears: 11,
    entranceExam: { kind: 'exam', passBase: 0.3 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1972 年起十一年制义务教育（任务史实骨架，资料有限、标 C/D）；小学 4 年 + 中学 7 年覆盖十一年，升学考试与通过率为设计假设，学费按国家供给计 0。',
  },
];
