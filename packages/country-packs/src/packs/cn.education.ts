import type { EducationSegment } from '../schema.ts';

/**
 * 中国大陆教育制度分段（ADR-0007 2026-10-21 增补）。这是**规则数据**，不是统计序列。
 *
 * 证据：所有分段仍标 **D 级设计假设**——每段都包含未由法规决定的
 * `entranceExam.passBase` 与 `feeShare`，按最弱值整段取 D（逐值证据见
 * `docs/data/EDUCATION_SYSTEMS.md`）。已登记的来源用于核实年份边界与历史注释；
 * 来源清单见 `data/sources.json`，D 级缺口说明写在每段的 `note` 里。
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
    sourceIds: ['adr:0007', 'chsi:student-aid-70-years'],
    note: 'D 级设计假设：1950—1951 沿用旧制（四二制小学与旧制中学），无统一升学考试；旧的 7/6/3/4 结构本身待核实（本轮未取得 1951 年学制改革的可引用文本）。新中国成立初期部分学校收取学杂费（chsi:student-aid-70-years），本段 feeShare 0 是设计假设。',
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
    sourceIds: ['adr:0007', 'chsi:student-aid-70-years'],
    note: 'D 级设计假设：1952 年起实行全国统一高考（待核实：本轮未找到可引用的文件）；1951 年学制改革（五年制小学）及其停止推行未进入本模型。基础教育并非全程免学杂费——1949—1965 年部分学校收取学杂费，1955 年教育部、财政部发出中小学杂费管理通知并规定减免；高校免学费并发放人民助学金（chsi:student-aid-70-years）。本段 feeShare 0 与 passBase 0.35 都是设计假设。',
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
    sourceIds: ['adr:0007', 'chsi:student-aid-70-years'],
    note: 'D 级设计假设：1966—1976 年统一高考中断；1970 年起部分高校以推荐方式招生（chsi:student-aid-70-years）。本模型的 entranceExam=none 只表示没有统一考试，不代表没有招生；推荐入学的路径没有实现，列入 M3-012d 报告的待决项。',
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
    sourceIds: ['adr:0007', 'chsi:student-aid-70-years'],
    note: 'D 级设计假设：1977 年恢复统一高考（待核实：本轮未找到可引用的文件）；1978—1983 年高校不收学杂费、住宿费并发放人民助学金（chsi:student-aid-70-years）。本段 feeShare 0 与 passBase 0.4 都是设计假设。',
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
    sourceIds: [
      'adr:0007',
      'moe-cn:compulsory-education-law',
      'cn-npc:compulsory-education-1986',
      'edu-cn:tuition-reform',
    ],
    note: 'D 级设计假设：1986 年《义务教育法》确立九年义务教育，规定免收学费，但小学与初中仍需缴纳杂费（2006 年修订后才规定不收学费、杂费，2008 年城乡全面免除；moe-cn:compulsory-education-law、cn-npc:compulsory-education-1986）；入学年龄六周岁、条件不具备可推迟到七周岁，本假设取 7。高校 1989 年起对所有学生收费、1997 年基本完成招生并轨与缴费上学（edu-cn:tuition-reform）。本段 feeShare 0.1 是覆盖非义务教育阶段的单一比例设计假设，未区分中小学杂费与高校学费。',
  },
];
