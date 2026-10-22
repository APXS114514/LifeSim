import type { EducationSegment } from '../schema.ts';

/**
 * 朝鲜教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 证据：所有分段仍标 **D 级设计假设**——每段都包含未由法规决定的
 * `entranceExam.passBase` 与 `feeShare`，按最弱值整段取 D（逐值证据见
 * `docs/data/EDUCATION_SYSTEMS.md`）。朝鲜没有可公开核实的官方教育法文本，
 * 已登记的来源是韩国统一部北韩信息门户与中国驻朝使馆的史实记述（非朝鲜官方）。
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
    sourceIds: ['adr:0007', 'nkinfo:education-system', 'chinaemb-kp:education'],
    note: 'D 级设计假设：本段把 1950—1971 压缩成单一学制（小学 4 年 + 中学 3 年、义务教育 0）。已核实的改革是：1956 年初等义务教育（4 年）、1958 年中等义务教育（人民学校 4 年 + 中学 3 年 = 7 年）、1967 年九年制技术义务教育（人民学校 4 年 + 中学 5 年）（nkinfo:education-system、chinaemb-kp:education）。这些改革没有进入本模型：修正需要新增分段并改变行为，列入 M3-012d 报告的待决项；学费按国家供给计 0 也是设计假设。',
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
    sourceIds: ['adr:0007', 'nkinfo:education-system', 'chinaemb-kp:education'],
    note: 'D 级设计假设：1972 年决定「10 年制义务教育 + 1 年学前义务教育」，1973 年 4 月起实施，合计 1 年学前 + 4 年小学 + 6 年中学 = 11 年（nkinfo:education-system、chinaemb-kp:education）。本模型没有学前段，按小学 4 年 + 中学 7 年折叠为 11 年；入学年龄 6 岁、升学考试与通过率 0.3、学费按国家供给计 0 都是设计假设。',
  },
];
