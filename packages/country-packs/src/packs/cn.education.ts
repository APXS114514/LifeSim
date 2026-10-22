import type { EducationSegment } from '../schema.ts';

/**
 * 中国大陆教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 仓库目前**没有登记任何教育法规来源**（`data/sources.json` 只有 WDI/WPP 与币制/政体来源），
 * 因此全部条目都是 **D 级设计假设**：年份边界取自任务 M3-012 列出的史实骨架，具体参数
 * （入学年龄、年限、考试基础通过率、学费比例）是设计假设，待登记并审计教育法规来源后复核。
 * 每条 D 级都带 `note` 写明缺口，校验（`validateCountryPack` 规则 14—16）会强制这一点。

 * 学费比例只覆盖非义务教育阶段；义务教育年限内由规则按 0 计。
 */
export const CN_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: 1951,
    primaryStartAge: 7,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 0,
    entranceExam: { kind: 'none' },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1950—1951 沿用四二制小学与旧制中学，无统一升学考试、学杂费免收；无已登记来源。',
  },
  {
    validFrom: 1952,
    validTo: 1965,
    primaryStartAge: 7,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 0,
    entranceExam: { kind: 'exam', passBase: 0.35 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1952 年起全国统一高考（任务史实骨架的 1951/1952 学制改革窗口），基础教育免学杂费；无已登记来源。',
  },
  {
    validFrom: 1966,
    validTo: 1976,
    primaryStartAge: 7,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 0,
    entranceExam: { kind: 'none' },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：高校招生中断的十年（任务史实骨架 1966—1976），不存在统一升学考试；无已登记来源。',
  },
  {
    validFrom: 1977,
    validTo: 1985,
    primaryStartAge: 7,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 0,
    entranceExam: { kind: 'exam', passBase: 0.4 },
    feeShare: 0,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1977 年恢复高考（任务史实骨架），高等教育仍免学费；无已登记来源。',
  },
  {
    validFrom: 1986,
    validTo: null,
    primaryStartAge: 7,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 9,
    entranceExam: { kind: 'exam', passBase: 0.5 },
    feeShare: 0.1,
    grade: 'D',
    sourceIds: ['adr:0007'],
    note: 'D 级设计假设：1986 年义务教育法确立九年义务教育；该法规定六周岁入学、条件不具备可推迟到七周岁，本假设取 7 以贴近当时入学实际。非义务教育阶段的学费比例 0.1 是设计假设，不绑定具体年份。',
  },
];
