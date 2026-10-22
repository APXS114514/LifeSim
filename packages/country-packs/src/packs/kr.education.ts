import type { EducationSegment } from '../schema.ts';

/**
 * 韩国教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 证据：所有分段仍标 **D 级设计假设**——每段都包含未由法规决定的
 * `entranceExam.passBase` 与 `feeShare`，按最弱值整段取 D（逐值证据见
 * `docs/data/EDUCATION_SYSTEMS.md`）。已登记的来源用于核实义务教育与入学制度的时间线；
 * 来源清单见 `data/sources.json`。
 */
export const KR_EDUCATION: EducationSegment[] = [
  {
    validFrom: 1950,
    validTo: 1952,
    primaryStartAge: 6,
    primaryYears: 6,
    secondaryYears: 3,
    tertiaryYears: 4,
    compulsoryYears: 6,
    entranceExam: { kind: 'exam', passBase: 0.4 },
    feeShare: 0.15,
    grade: 'D',
    sourceIds: ['adr:0007', 'kr-archives:compulsory-education'],
    note: 'D 级设计假设：1949 年《教育法》第 8 条规定六年制初等义务教育（1948 年宪法已规定初等教育义务、免费）；1950-06-01 起施行，因战争中断，1952 年施行令后推进（kr-archives:compulsory-education）。本段按六年义务教育计，学制取六三三四；入学年龄 6 岁、passBase 0.4 与 feeShare 0.15 是设计假设。',
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
    sourceIds: ['adr:0007', 'kr-archives:compulsory-education'],
    note: 'D 级设计假设：1953 年起推进「义务教育完成 6 年计划」（1954—1959）；1949 年《教育法》确立六三三四学制与六年初等义务教育（kr-archives:compulsory-education）。中学义务教育 1984 年才取得法律依据，本段的 compulsoryYears=6 只覆盖小学；中学与大学升学考试并存，passBase 0.5 与 feeShare 0.12 是设计假设。',
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
    sourceIds: ['adr:0007', 'kr-archives:compulsory-education', 'kr-aks:admissions-1969-1974'],
    note: 'D 级设计假设：1969 年起初中免试入学（首尔 1969、10 城 1970、全国 1971），1974 年起高中平准化——两者不是同一年、也不是同一项政策（kr-aks:admissions-1969-1974）。初中义务教育 1984 年才取得法律依据，1985 年起分批实施、2002 年全面铺开，故本段仍按六年义务教育（kr-archives:compulsory-education）；entranceExam 指高等教育资格考试，不是已取消的初中入学考试。passBase 0.6 与 feeShare 0.12 是设计假设。',
  },
];
